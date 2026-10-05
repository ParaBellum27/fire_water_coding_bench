import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReplay } from './replay.js';
import { validateTrace, type RunResult } from './types.js';

const DEFAULT_REFERENCE = fileURLToPath(new URL('../reference-game/html5/', import.meta.url));
const args = process.argv.slice(2);
const command = args.shift();
if (command !== 'replay' && command !== 'verify') throw new Error('Usage: npm run replay|verify -- --trace <trace.json> [--runs 5] [--reference-root <dir>] [--entry level-two.html] [--out <dir>]');
const flags: Record<string, string> = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const compactRuns = /^--runs(\d+)$/.exec(arg);
  if (compactRuns) { flags.runs = compactRuns[1]; continue; }
  const equals = arg.indexOf('=');
  const key = arg.slice(2, equals >= 0 ? equals : undefined);
  if (!arg.startsWith('--') || !['trace', 'runs', 'reference-root', 'entry', 'out'].includes(key)) throw new Error(`Unknown option: ${arg}`);
  const value = equals >= 0 ? arg.slice(equals + 1) : args[++i];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
  if (Object.hasOwn(flags, key)) throw new Error(`Duplicate option --${key}`);
  flags[key] = value;
}
const runs = command === 'verify' ? Number(flags.runs ?? 5) : 1;
if (!Number.isSafeInteger(runs) || runs < 1 || (command === 'replay' && flags.runs !== undefined)) throw new Error('--runs must be a positive integer and is only supported by verify.');
const outputRoot = resolve(flags.out ?? 'artifacts/reference-runs');
await mkdir(outputRoot, { recursive: true });
const suiteDir = await mkdtemp(join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${command}-`));
const results: RunResult[] = [];
let commandError: string | undefined;
let traceName: string | undefined;
try {
  if (!flags.trace) throw new Error('--trace is required.');
  const tracePath = resolve(flags.trace);
  const trace = validateTrace(JSON.parse(await readFile(tracePath, 'utf8')));
  traceName = trace.name;
  const referenceRoot = resolve(flags['reference-root'] ?? DEFAULT_REFERENCE);
  const entry = flags.entry ?? 'level-two.html';
  if (entry.startsWith('/') || entry.includes('\\') || entry.split('/').includes('..') || /[?#]/.test(entry) || /^[a-z]+:/i.test(entry)) {
    throw new Error('--entry must be a path within the reference root.');
  }
  for (let index = 1; index <= runs; index++) {
    const outDir = join(suiteDir, `run-${String(index).padStart(2, '0')}`);
    let result: RunResult;
    try {
      result = await runReplay({ trace, tracePath, referenceRoot, entry, outDir });
    } catch (error) {
      result = { success: false, outDir, artifacts: {}, gameplayMs: 0,
        error: `Runner infrastructure failure: ${error instanceof Error ? error.stack ?? error.message : String(error)}` };
    }
    results.push(result);
    console.log(`Run ${index}/${runs}: ${result.success ? 'PASS' : 'FAIL'} — ${result.outDir}`);
    if (!result.success) break;
  }
} catch (error) {
  commandError = error instanceof Error ? error.stack ?? error.message : String(error);
}
const success = !commandError && results.length === runs && results.every(result => result.success);
const summary = { version: 1, command, purpose: 'reference replay only; not a candidate grader', traceName,
  requestedRuns: runs, attemptedRuns: results.length, success, stoppedOnFirstFailure: true,
  error: commandError, runs: results.map((result, index) => ({ ...result, index: index + 1,
    outDir: relative(suiteDir, result.outDir).split(sep).join('/') })), finishedAt: new Date().toISOString() };
await writeFile(join(suiteDir, 'summary.json'), JSON.stringify(summary, null, 2));
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const rows = summary.runs.map(result => `<tr><td>${result.index}</td><td>${result.success ? 'PASS' : 'FAIL'}</td><td>${result.gameplayMs}</td><td>${Object.entries(result.artifacts).map(([name, path]) => `<a href="${escape(`${result.outDir}/${path}`)}">${escape(name)}</a>`).join(' · ')}</td><td><pre>${escape(result.error ?? '')}</pre></td></tr>`).join('\n');
await writeFile(join(suiteDir, 'summary.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reference replay ${success ? 'PASS' : 'FAIL'}</title><style>body{font:16px system-ui;max-width:1400px;margin:2rem auto;padding:1rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.6rem;text-align:left;vertical-align:top}pre{white-space:pre-wrap;max-width:45em}a{display:inline-block;margin:.2rem}</style><h1>Reference ${escape(command)}: ${success ? 'PASS' : 'FAIL'}</h1><p>Reference replay evidence only — not a candidate grader.</p><p>${escape(traceName ?? 'Invalid trace')}: ${results.length}/${runs} runs attempted; stopped at the first failure. Every attempt is retained.</p><p><a href="summary.json">Summary JSON</a></p>${commandError ? `<pre>${escape(commandError)}</pre>` : ''}<table><thead><tr><th>Run</th><th>Result</th><th>Gameplay ms</th><th>Artifacts</th><th>Failure</th></tr></thead><tbody>${rows}</tbody></table></html>`);
console.log(`Summary: ${join(suiteDir, 'summary.html')}`);
if (!success) process.exitCode = 1;
