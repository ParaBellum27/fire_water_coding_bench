export interface Trace {
  version: 1;
  name: string;
  clock: 'controlled';
  viewport: { width: number; height: number; deviceScaleFactor: 1 };
  tickMs: number;
  segments: Array<{ keys: string[]; durationMs: number; label?: string }>;
  milestones?: Array<{ atMs: number; label: string }>;
}

export interface RunOptions {
  trace: Trace;
  tracePath: string;
  referenceRoot: string;
  entry: string;
  outDir: string;
}

export interface RunResult {
  success: boolean;
  outDir: string;
  error?: string;
  artifacts: Record<string, string>;
  gameplayMs: number;
}

export function validateTrace(value: unknown): Trace {
  const t = value as Trace;
  const keys: Record<string, true> = { ArrowLeft: true, ArrowRight: true, ArrowUp: true, a: true, d: true, w: true };
  if (!t || t.version !== 1 || typeof t.name !== 'string' || t.clock !== 'controlled' ||
      t.viewport?.width !== 1280 || t.viewport?.height !== 960 || t.viewport?.deviceScaleFactor !== 1 ||
      !Number.isInteger(t.tickMs) || t.tickMs < 1 || t.tickMs > 16 || !Array.isArray(t.segments) || !t.segments.length) {
    throw new Error('Expected version 1 controlled trace, 1280×960 DPR1 viewport, and integer tickMs in 1..16.');
  }
  for (const s of t.segments) {
    if (!Array.isArray(s.keys) || s.keys.some(k => !Object.hasOwn(keys, k)) || new Set(s.keys).size !== s.keys.length ||
        !Number.isSafeInteger(s.durationMs) || s.durationMs <= 0 || (s.label !== undefined && typeof s.label !== 'string')) {
      throw new Error('Invalid trace segment: use complete unique keyboard held sets and positive integer durations.');
    }
  }
  const duration = t.segments.reduce((n, s) => n + s.durationMs, 0);
  if (!Number.isSafeInteger(duration)) throw new Error('Trace duration exceeds safe integer range.');
  if (t.milestones !== undefined && (!Array.isArray(t.milestones) || t.milestones.some(m =>
    !Number.isSafeInteger(m.atMs) || m.atMs < 0 || m.atMs > duration || typeof m.label !== 'string'))) {
    throw new Error('Invalid trace milestone.');
  }
  return t;
}
