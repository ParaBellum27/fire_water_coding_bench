// Public evaluator program, not code to embed in the game.
// npm exec tsx walkthrough-program.mjs <submission-directory> <output-directory>
// The shared capture driver imports steps(); every configuration receives these exact bytes.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export function steps(trace) {
  if (trace.version !== 1 || !Array.isArray(trace.segments)) throw new Error('Invalid walkthrough');
  return trace.segments.map((segment, index) => ({ keys: [...segment.keys], durationMs: segment.durationMs,
    label: segment.label ?? `segment-${String(index).padStart(2, '0')}` }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, out] = process.argv.slice(2);
  if (!root || !out) throw new Error('Provide submission directory and fresh output directory.');
  const trace = JSON.parse(await readFile(new URL('./walkthrough.json', import.meta.url), 'utf8'));
  const { captureScenario } = await import('../../runner/comparison-capture.mjs');
  await captureScenario({ root: resolve(root), out: resolve(out), scenario: {
    id: 'public-walkthrough', clock: 'controlled', hostDeadlineMs: 300000, sampleEveryMs: 500, segments: steps(trace)
  } });
}
