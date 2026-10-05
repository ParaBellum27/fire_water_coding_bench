import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidenceRoot = join(root, 'task-public/screenshot-pilot');
const model = 'gemini-3.8-flash';
const generationConfig = {
  temperature: 1,
  maxOutputTokens: 24_000,
  responseMimeType: 'application/json',
  responseSchema: { type: 'OBJECT', properties: { html: { type: 'STRING' } }, required: ['html'] },
};
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
loadEnvFile(join(root, '.env'));
const key = process.env.GEMINI_API_KEY?.trim();
if (!key) throw new Error('Set GEMINI_API_KEY in the local ignored .env file.');

const manifestBytes = await readFile(join(evidenceRoot, 'manifest.json'));
const evidence = JSON.parse(manifestBytes.toString()) as {
  images: Array<{ file: string; atMs: number; sha256: string }>;
};
const prompt = await readFile(join(evidenceRoot, 'prompt.txt'), 'utf8');
const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
for (const [index, image] of evidence.images.entries()) {
  const path = resolve(evidenceRoot, image.file);
  if (!path.startsWith(evidenceRoot + sep)) throw new Error('Evidence image escapes its package.');
  const bytes = await readFile(path);
  if (sha256(bytes) !== image.sha256) throw new Error(`Frozen screenshot changed: ${image.file}`);
  parts.push({ text: `Screenshot ${index + 1}/${evidence.images.length}; simulated gameplay time ${image.atMs} ms.` });
  parts.push({ inlineData: { mimeType: 'image/png', data: bytes.toString('base64') } });
}
const request = { contents: [{ role: 'user', parts }], generationConfig };
const outputRoot = join(root, 'artifacts/model-pilots');
await mkdir(outputRoot, { recursive: true });
const out = await mkdtemp(join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${model}-`));
const metadata: Record<string, unknown> = {
  purpose: 'One screenshot-first recreation attempt; not a validated benchmark score',
  modelRequested: model,
  startedAt: new Date().toISOString(),
  screenshotCount: evidence.images.length,
  evidenceManifestSha256: sha256(manifestBytes),
  promptSha256: sha256(prompt),
  generationConfig,
  requestCount: 1,
  assistantCodeRepairs: 0,
  status: 'requesting',
};
await writeFile(join(out, 'manifest.json'), JSON.stringify(metadata, null, 2));
await writeFile(join(out, 'prompt.txt'), prompt);
await writeFile(join(out, 'evidence-manifest.json'), manifestBytes);
await writeFile(join(out, 'request.json'), JSON.stringify(request));
console.log(`Gemini pilot: ${out}`);
console.log(`Sending ${evidence.images.length} screenshots to ${model}; one request, no code repairs.`);
try {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(600_000),
  });
  const rawResponse = (await response.text()).replaceAll(key, '[REDACTED]');
  await writeFile(join(out, 'response.json'), rawResponse);
  metadata.httpStatus = response.status;
  const data = JSON.parse(rawResponse) as {
    modelVersion?: string;
    usageMetadata?: unknown;
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    error?: { message?: string };
  };
  metadata.modelVersion = data.modelVersion;
  metadata.usage = data.usageMetadata;
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${data.error?.message ?? 'Request failed'}`);
  const candidate = data.candidates?.[0];
  metadata.finishReason = candidate?.finishReason;
  const text = candidate?.content?.parts?.filter(part => part.text && !part.thought).map(part => part.text).join('\n');
  if (!text) throw new Error('Gemini returned no submission text.');
  await writeFile(join(out, 'submission-response.txt'), text);
  const submission = JSON.parse(text) as { html?: unknown };
  if (typeof submission.html !== 'string' || !submission.html.trim()) throw new Error('Submission does not contain HTML.');
  await mkdir(join(out, 'submission'));
  await writeFile(join(out, 'submission/index.html'), submission.html);
  metadata.htmlSha256 = sha256(submission.html);
  metadata.status = 'submitted';
  console.log(`Saved unchanged generated HTML: ${join(out, 'submission/index.html')}`);
  console.log(`Token usage: ${JSON.stringify(data.usageMetadata ?? {})}`);
} catch (error) {
  metadata.status = 'failed';
  metadata.error = String(error).replaceAll(key, '[REDACTED]');
  console.error(metadata.error);
  process.exitCode = 1;
} finally {
  metadata.finishedAt = new Date().toISOString();
  await writeFile(join(out, 'manifest.json'), JSON.stringify(metadata, null, 2));
}
