import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Standalone generation only: no candidate or assessment modules are imported.
type Provider = 'gemini' | 'cerebras' | 'openrouter';
type Model = { id: string; provider: Provider; model: string };
type Protocol = {
  models: Model[];
  generation: { temperature: number; maxOutputTokens: number; timeoutMs: number };
  publicFiles: string[];
};
type JsonObject = Record<string, unknown>;
const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys: Record<Provider, string> = {
  gemini: 'GEMINI_API_KEY', cerebras: 'CEREBRAS_API_KEY', openrouter: 'OPEN_ROUTER_API_KEY',
};
const secrets = new Set<string>();
function rememberSecrets() {
  for (const [name, value] of Object.entries(process.env)) {
    if (value && /key|token|secret|password|credential/i.test(name)) {
      secrets.add(value);
      if (value.trim()) secrets.add(value.trim());
    }
  }
}
function redact(text: string): string {
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    text = text.replaceAll(secret, '[REDACTED]');
    // Providers can reflect a credential inside a JSON-escaped error message.
    const escaped = JSON.stringify(secret).slice(1, -1);
    text = text.replaceAll(escaped, '[REDACTED]');
    text = text.replaceAll(encodeURIComponent(secret), '[REDACTED]');
  }
  return text;
}

function argumentsFromCLI() {
  let packageDir: string | undefined;
  let outDir: string | undefined;
  let dryRun = false;
  const args = process.argv.slice(2);
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
    seen.add(flag);
    if (flag === '--dry-run') { dryRun = true; continue; }
    if ((flag !== '--package' && flag !== '--out') || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('Usage: tsx runner/comparison-generate.ts --package <publicdir> --out <freshartifactdir> [--dry-run]');
    }
    const value = resolve(args[++i]);
    if (flag === '--package') packageDir = value;
    else outDir = value;
  }
  if (!packageDir || !outDir) throw new Error('--package and --out are required.');
  return { packageDir, outDir, dryRun };
}
async function exists(path: string) {
  try { await stat(path); return true; }
  catch (error) { if (object(error) && error.code === 'ENOENT') return false; throw error; }
}
function within(parent: string, child: string) {
  const path = relative(parent, child);
  return path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}
async function packageFile(packageDir: string, file: string) {
  if (!file || /[\r\n\0]/.test(file) || isAbsolute(file)) throw new Error('Invalid package filename.');
  const path = resolve(packageDir, file);
  if (!within(packageDir, path) || !within(packageDir, await realpath(path))) {
    throw new Error(`Package file escapes package: ${file}`);
  }
  return readFile(path);
}
function validateProtocol(value: unknown): Protocol {
  if (!object(value) || !object(value.generation) || !Array.isArray(value.models) || !Array.isArray(value.publicFiles)) {
    throw new Error('Invalid protocol structure.');
  }
  const settings = value.generation;
  if (settings.temperature !== 1 || settings.maxOutputTokens !== 16384 || settings.timeoutMs !== 600000) {
    throw new Error('Protocol must freeze temperature=1, maxOutputTokens=16384, timeoutMs=600000.');
  }
  if (value.models.length !== 3) throw new Error('Protocol must contain exactly three provider configurations.');
  const providers = new Set<string>();
  const ids = new Set<string>();
  const models: Model[] = [];
  for (const entry of value.models) {
    if (!object(entry) || typeof entry.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.id)
      || typeof entry.provider !== 'string' || typeof entry.model !== 'string') throw new Error('Invalid model configuration.');
    const provider = entry.provider.toLowerCase() === 'google' ? 'gemini' : entry.provider.toLowerCase();
    const expected: Record<string, string> = { gemini: 'gemini-3.8-flash', cerebras: 'gpt-oss-120b', openrouter: 'openai/gpt-oss-120b' };
    if ((provider !== 'gemini' && provider !== 'cerebras' && provider !== 'openrouter')
      || entry.model !== expected[provider] || providers.has(provider) || ids.has(entry.id) || entry.id === 'dry-run') {
      throw new Error('Protocol must contain unique IDs and the three specified provider/model pairs.');
    }
    models.push({ id: entry.id, provider, model: entry.model });
    providers.add(provider); ids.add(entry.id);
  }
  const publicFiles: string[] = [];
  for (const file of value.publicFiles) {
    if (typeof file !== 'string' || publicFiles.includes(file)) throw new Error('Invalid ordered publicFiles list.');
    publicFiles.push(file);
  }
  if (publicFiles.length === 0) throw new Error('publicFiles must not be empty.');
  return {
    models, publicFiles,
    generation: { temperature: settings.temperature, maxOutputTokens: settings.maxOutputTokens, timeoutMs: settings.timeoutMs },
  };
}
function requestFor(config: Model, protocol: Protocol, payload: string) {
  if (config.provider === 'gemini') {
    return {
      contents: [{ role: 'user', parts: [{ text: payload }] }],
      generationConfig: {
        temperature: protocol.generation.temperature, maxOutputTokens: protocol.generation.maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { html: { type: 'STRING' } }, required: ['html'] },
      },
    };
  }
  return {
    model: config.model, messages: [{ role: 'user', content: payload }],
    temperature: protocol.generation.temperature, max_tokens: protocol.generation.maxOutputTokens,
    response_format: { type: 'json_schema', json_schema: {
      name: 'submission', strict: true,
      schema: { type: 'object', properties: { html: { type: 'string' } }, required: ['html'], additionalProperties: false },
    } },
  };
}
function responseFields(provider: Provider, data: unknown) {
  const record = object(data) ? data : {};
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const candidate = object(candidates[0]) ? candidates[0] : {};
  const choice = object(choices[0]) ? choices[0] : {};
  const content = object(candidate.content) ? candidate.content : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const message = object(choice.message) ? choice.message : {};
  const text = provider === 'gemini'
    ? parts.flatMap(part => object(part) && typeof part.text === 'string' && part.thought !== true ? [part.text] : []).join('')
    : typeof message.content === 'string' ? message.content : '';
  const usage = provider === 'gemini' ? record.usageMetadata ?? null : record.usage ?? null;
  const nested = object(record.data) ? record.data : {};
  const reportedProvider = nested.provider ?? record.provider ?? null;
  const usageRecord = object(usage) ? usage : {};
  return {
    text,
    modelReturned: record.modelVersion ?? record.model ?? null,
    servingProvider: provider === 'gemini' ? 'Google' : provider === 'cerebras' ? 'Cerebras' : typeof reportedProvider === 'string' ? reportedProvider : 'unknown',
    servingProviderAttribution: provider === 'openrouter' ? (typeof reportedProvider === 'string' ? 'reported_metadata' : 'unknown') : 'direct_endpoint',
    reportedProvider,
    usage,
    finishReason: provider === 'gemini' ? candidate.finishReason ?? null : choice.finish_reason ?? null,
    reportedCost: usageRecord.cost ?? nested.cost ?? record.cost ?? null,
    apiError: record.error ?? null,
  };
}

async function main() {
  const { packageDir: requestedPackage, outDir, dryRun } = argumentsFromCLI();
  const packageDir = await realpath(requestedPackage);
  const manifestBytes = await packageFile(packageDir, 'manifest.json');
  const manifest: unknown = JSON.parse(manifestBytes.toString('utf8'));
  if (!object(manifest) || !Array.isArray(manifest.files)) throw new Error('Invalid manifest.files.');
  const verified = new Map<string, Buffer>();
  for (const entry of manifest.files) {
    if (!object(entry) || typeof entry.file !== 'string' || typeof entry.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/i.test(entry.sha256) || verified.has(entry.file)) throw new Error('Invalid manifest entry.');
    const bytes = await packageFile(packageDir, entry.file);
    if (sha256(bytes) !== entry.sha256.toLowerCase()) throw new Error(`Frozen package hash mismatch: ${entry.file}`);
    verified.set(entry.file, bytes);
  }
  const protocolBytes = verified.get('protocol.json');
  if (!protocolBytes) throw new Error('protocol.json must be frozen in manifest.files.');
  const protocol = validateProtocol(JSON.parse(protocolBytes.toString('utf8')));
  const chunks: Buffer[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  for (const file of protocol.publicFiles) {
    const bytes = verified.get(file);
    if (!bytes) throw new Error(`Public file not frozen in manifest: ${file}`);
    decoder.decode(bytes); // Reject lossy UTF-8 decoding; do not normalize or strip BOMs.
    chunks.push(Buffer.from(`\n\n===== FILE: ${file} =====\n`, 'utf8'), bytes);
  }
  const payloadBytes = Buffer.concat(chunks);
  const payload = decoder.decode(payloadBytes);
  const output = dryRun ? join(outDir, 'dry-run') : outDir;
  for (const config of protocol.models) {
    if (await exists(join(outDir, config.id, 'request.json'))) throw new Error(`Refusing rerun of configuration: ${config.id}`);
    if (dryRun && await exists(join(output, config.id, 'request.json'))) throw new Error(`Dry-run artifacts already exist: ${config.id}`);
  }
  if (!dryRun) {
    try { loadEnvFile(join(root, '.env')); }
    catch (error) { if (!object(error) || error.code !== 'ENOENT') throw error; }
    rememberSecrets();
  }
  // Freeze every request before the first network call. No authentication data is persisted.
  const prepared = [];
  for (const config of protocol.models) {
    const dir = join(output, config.id);
    await mkdir(dir, { recursive: true });
    const request = JSON.stringify(requestFor(config, protocol, payload));
    if (redact(request) !== request || redact(payload) !== payload) throw new Error('Public package contains a credential; refusing to persist or transmit it.');
    await writeFile(join(dir, 'request.json'), request, { flag: 'wx' });
    await writeFile(join(dir, 'payload.txt'), payloadBytes);
    await writeFile(join(dir, 'manifest.json'), manifestBytes);
    await writeFile(join(dir, 'protocol.json'), protocolBytes);
    prepared.push({ config, dir, request });
  }
  for (const { config, dir, request } of prepared) {
    const endpoint = config.provider === 'gemini'
      ? `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`
      : config.provider === 'cerebras' ? 'https://api.cerebras.ai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const metadata: JsonObject = {
      id: config.id, provider: config.provider, modelRequested: config.model, modelReturned: null,
      servingProvider: config.provider === 'gemini' ? 'Google' : config.provider === 'cerebras' ? 'Cerebras' : 'unknown',
      servingProviderAttribution: config.provider === 'openrouter' ? 'unknown' : 'direct_endpoint',
      endpoint, settings: protocol.generation, payloadSha256: sha256(payloadBytes), requestSha256: sha256(request),
      manifestSha256: sha256(manifestBytes), protocolSha256: sha256(protocolBytes),
      publicFiles: protocol.publicFiles, requestCount: 0, usage: null, reportedCost: null,
      httpStatus: null, finishReason: null, durationMs: 0, status: dryRun ? 'dry_run' : 'requesting',
      outputContract: { status: 'NOT_ASSESSED', reasons: [] }, startedAt: new Date().toISOString(),
    };
    if (dryRun) {
      await writeFile(join(dir, 'generation.json'), redact(JSON.stringify(metadata, null, 2)) + '\n');
      console.log(JSON.stringify({ id: config.id, model: config.model, status: 'dry_run', durationMs: 0, usage: null }));
      continue;
    }
    let rawResponse = '';
    let submissionText = '';
    let stage = 'configuration';
    const start = performance.now();
    try {
      const credential = process.env[keys[config.provider]]?.trim();
      if (!credential) throw new Error(`Missing credential environment variable: ${keys[config.provider]}`);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (config.provider === 'gemini') headers['x-goog-api-key'] = credential;
      else headers.authorization = `Bearer ${credential}`;
      stage = 'network';
      metadata.requestCount = 1;
      const response = await fetch(endpoint, {
        method: 'POST', headers, body: request, signal: AbortSignal.timeout(protocol.generation.timeoutMs), redirect: 'error',
      });
      metadata.httpStatus = response.status;
      rawResponse = redact(await response.text());
      metadata.durationMs = performance.now() - start;
      stage = 'response';
      let data: unknown;
      try { data = JSON.parse(rawResponse); }
      catch { metadata.status = response.ok ? 'non_json_response' : 'api_error'; metadata.error = 'Response body is not JSON.'; }
      const fields = responseFields(config.provider, data);
      submissionText = fields.text;
      const { text: _text, apiError, ...reported } = fields;
      Object.assign(metadata, reported);
      // These artifacts precede all output-contract and truncation checks, including rejected output.
      await writeFile(join(dir, 'response.json'), rawResponse);
      await writeFile(join(dir, 'submission-response.txt'), submissionText);
      if (!response.ok || apiError !== null) {
        metadata.status = 'api_error';
        metadata.error = apiError ?? `HTTP ${response.status}`;
      } else if (metadata.status !== 'non_json_response') {
        stage = 'contract';
        const reasons: string[] = [];
        let submission: unknown;
        try { submission = JSON.parse(submissionText); }
        catch { reasons.push('Submission is not JSON (no fences or other repairs are permitted).'); }
        const exactEnvelope = object(submission) && Object.keys(submission).length === 1 && typeof submission.html === 'string';
        if (!exactEnvelope) reasons.push('Submission must be exactly one JSON field, html, containing a string.');
        if (object(submission) && Object.keys(submission).length === 1 && typeof submission.html === 'string') {
          const html = submission.html;
          await mkdir(join(dir, 'submission'), { recursive: true });
          await writeFile(join(dir, 'submission/index.html'), html);
          metadata.htmlSha256 = sha256(html);
          if (!/^<!doctype\s+html\s*>/i.test(html.trimStart())) reasons.push('HTML is missing its opening HTML doctype.');
          if (!/<\/html>\s*$/i.test(html)) reasons.push('HTML is missing its closing html tag.');
        }
        if (fields.finishReason === 'MAX_TOKENS' || fields.finishReason === 'length' || fields.finishReason === 'max_tokens') {
          reasons.push('Provider reported output truncation.');
        }
        if (fields.finishReason !== null && fields.finishReason !== 'STOP' && fields.finishReason !== 'stop'
          && fields.finishReason !== 'MAX_TOKENS' && fields.finishReason !== 'length' && fields.finishReason !== 'max_tokens') {
          reasons.push(`Provider reported non-success finish reason: ${String(fields.finishReason)}`);
        }
        metadata.outputContract = { status: reasons.length ? 'INVALID' : 'VALID', reasons };
        metadata.status = reasons.length ? 'output_contract_failure' : 'submitted';
      }
    } catch (error) {
      metadata.status = stage === 'configuration' ? 'configuration_error' : stage === 'network' ? 'network_error' : 'artifact_error';
      metadata.error = redact(String(error));
    } finally {
      if (!metadata.durationMs) metadata.durationMs = performance.now() - start;
      // Empty files explicitly preserve the lack of a response after a network/configuration failure.
      await writeFile(join(dir, 'response.json'), rawResponse);
      await writeFile(join(dir, 'submission-response.txt'), submissionText);
      metadata.finishedAt = new Date().toISOString();
      await writeFile(join(dir, 'generation.json'), redact(JSON.stringify(metadata, null, 2)) + '\n');
    }
    if (metadata.status !== 'submitted') process.exitCode = 1;
    console.log(redact(JSON.stringify({
      id: config.id, modelRequested: config.model, modelReturned: metadata.modelReturned,
      servingProvider: metadata.servingProvider, status: metadata.status,
      durationMs: typeof metadata.durationMs === 'number' ? Math.round(metadata.durationMs) : null, usage: metadata.usage,
    })));
  }
}
rememberSecrets();
try { await main(); }
catch (error) { console.error(redact(String(error))); process.exitCode = 1; }
