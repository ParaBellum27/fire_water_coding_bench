import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { setImmediate as yieldIO } from 'node:timers/promises';
import { Capture } from './capture.js';
import { observeReference, referenceIdentity, type ReferenceObservation, type ReferenceIdentity } from './reference.js';
import { startServer, type LocalServer } from './server.js';
import type { RunOptions, RunResult } from './types.js';

export async function runReplay(options: RunOptions): Promise<RunResult> {
  const { trace, outDir } = options;
  await mkdir(outDir, { recursive: false });
  const startedAt = new Date().toISOString();
  const artifacts: Record<string, string> = { manifest: 'manifest.json', inputs: 'inputs.json',
    observations: 'observations.json', events: 'events.json', trace: 'trace.json' };
  const result: RunResult = { success: false, outDir, artifacts, gameplayMs: 0 };
  const inputs: Array<{ key: string; action: 'down' | 'up'; atMs: number; phase: string; dateNowMs: number; performanceNowMs: number }> = [];
  const observations: Array<{ atMs: number; phase: string; label?: string; snapshot: ReferenceObservation }> = [];
  const events: Array<Record<string, unknown>> = [];
  const held = new Set<string>();
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let server: LocalServer | undefined;
  let capture: Capture | undefined;
  let identity: ReferenceIdentity | undefined;
  let browserVersion: string | undefined;
  let startupMs = 0;
  let gameplayStarted = false;
  let fatalDeath = false;
  let terminalSuccess = false;
  const cleanupErrors: string[] = [];
  const require = createRequire(import.meta.url);
  const environment = { node: process.version, platform: process.platform, arch: process.arch,
    playwright: require('playwright/package.json').version, chromiumExecutable: chromium.executablePath(),
    clockEpoch: '2026-10-05T12:00:00.000Z', clockPauseAt: '2026-10-05T12:00:01.000Z',
    viewport: trace.viewport, tickMs: trace.tickMs, captureFps: 10 };
  async function transition(keys: string[]) {
    if (!page) throw new Error('Replay page is unavailable.');
    const next = new Set(keys);
    for (const key of [...held]) if (!next.has(key)) {
      await page.keyboard.up(key); held.delete(key);
      const observed = await page.evaluate(() => ({ dateNowMs: Date.now(), performanceNowMs: performance.now() }));
      inputs.push({ key, action: 'up', atMs: result.gameplayMs, phase: gameplayStarted ? 'gameplay' : 'startup', ...observed });
    }
    for (const key of keys) if (!held.has(key)) {
      await page.keyboard.down(key); held.add(key);
      const observed = await page.evaluate(() => ({ dateNowMs: Date.now(), performanceNowMs: performance.now() }));
      inputs.push({ key, action: 'down', atMs: result.gameplayMs, phase: 'gameplay', ...observed });
    }
  }
  async function sample(label?: string) {
    if (!page || !capture) throw new Error('Capture is unavailable.');
    const snapshot = await observeReference(page);
    fatalDeath ||= snapshot.fatalDeath;
    terminalSuccess = snapshot.terminal?.success === true;
    observations.push({ atMs: result.gameplayMs, phase: 'gameplay', label, snapshot });
    await capture.frame(page, result.gameplayMs, [...held], label);
    if (fatalDeath) throw new Error(`Fatal character death at gameplay ${result.gameplayMs} ms.`);
  }
  try {
    await writeFile(join(outDir, 'trace.json'), JSON.stringify(trace, null, 2));
    identity = await referenceIdentity(options.referenceRoot);
    server = await startServer(options.referenceRoot, options.entry);
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-networking'] });
    browserVersion = browser.version();
    context = await browser.newContext({ viewport: { width: trace.viewport.width, height: trace.viewport.height },
      deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === server?.origin) await route.continue();
      else { events.push({ type: 'blocked-request', url: url.href }); await route.abort('blockedbyclient'); }
    });
    await context.routeWebSocket(/.*/, ws => { events.push({ type: 'blocked-websocket', url: ws.url() }); ws.close(); });
    page = await context.newPage();
    page.on('pageerror', error => events.push({ type: 'pageerror', message: error.message, stack: error.stack, gameplayMs: result.gameplayMs, startupMs }));
    page.on('console', message => events.push({ type: 'console', level: message.type(), text: message.text(), location: message.location(), gameplayMs: result.gameplayMs, startupMs }));
    const epoch = new Date(environment.clockEpoch);
    await page.clock.install({ time: epoch });
    await page.clock.pauseAt(new Date(environment.clockPauseAt));
    const entryUrl = new URL(options.entry, server.origin + '/');
    if (entryUrl.origin !== server.origin) throw new Error('Entry must be a local relative path.');
    await page.goto(entryUrl.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const startupDeadline = Date.now() + 120_000;
    let ready = false;
    while (startupMs <= 60_000 && Date.now() < startupDeadline) {
      const snapshot = await observeReference(page);
      if (startupMs % 100 < trace.tickMs || snapshot.ready) observations.push({ atMs: startupMs, phase: 'startup', snapshot });
      if (snapshot.ready) { ready = true; break; }
      if (snapshot.fatalDeath) throw new Error('Reference died during startup.');
      await page.clock.runFor(trace.tickMs); startupMs += trace.tickMs;
      await yieldIO();
    }
    if (!ready) throw new Error('Reference readiness deadline exceeded.');
    gameplayStarted = true;
    await page.screenshot({ path: join(outDir, 'initial.png') }); artifacts.initial = 'initial.png';
    capture = new Capture({ outDir, width: trace.viewport.width, height: trace.viewport.height, fps: 10 });
    await capture.start();
    await sample('initial');
    let nextFrame = 100;
    const milestones = [...(trace.milestones ?? [])].sort((a, b) => a.atMs - b.atMs);
    let milestoneIndex = 0;
    for (const segment of trace.segments) {
      await transition(segment.keys);
      const end = result.gameplayMs + segment.durationMs;
      while (result.gameplayMs < end) {
        const step = Math.min(trace.tickMs, end - result.gameplayMs, nextFrame - result.gameplayMs);
        await page.clock.runFor(step); result.gameplayMs += step;
        if (result.gameplayMs === nextFrame) {
          const labels: string[] = [];
          while (milestoneIndex < milestones.length && milestones[milestoneIndex].atMs <= result.gameplayMs) {
            labels.push(milestones[milestoneIndex++].label);
          }
          await sample([segment.label, ...labels].filter(Boolean).join(' · ') || undefined);
          nextFrame += 100;
        }
      }
    }
    await transition([]);
    const final = await observeReference(page);
    observations.push({ atMs: result.gameplayMs, phase: 'final', snapshot: final });
    fatalDeath ||= final.fatalDeath;
    terminalSuccess = final.current === 'endGame' && final.terminal?.success === true;
    if (fatalDeath) throw new Error('Walkthrough contains a fatal death.');
    if (!terminalSuccess) throw new Error('Trace ended without original endGame.levelState.success. Include finish-animation wait in the trace.');
    if (events.some(event => event.type === 'pageerror')) throw new Error('Reference emitted page errors; inspect events.json.');
    result.success = true;
  } catch (error) {
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    try { await transition([]); } catch (error) { cleanupErrors.push(`key release: ${String(error)}`); }
    if (page && !page.isClosed()) {
      try { await page.screenshot({ path: join(outDir, 'final.png'), timeout: 10_000 }); artifacts.final = 'final.png'; }
      catch (error) { cleanupErrors.push(`final screenshot: ${String(error)}`); }
    }
    if (capture) {
      try { Object.assign(artifacts, await capture.finish()); }
      catch (error) { cleanupErrors.push(`capture finalization: ${String(error)}`); }
    }
    try {
      for (const name of await readdir(outDir)) {
        if (!Object.values(artifacts).includes(name)) artifacts[`retained:${name}`] = name;
      }
    } catch (error) { cleanupErrors.push(`artifact listing: ${String(error)}`); }
    try { await context?.close(); } catch (error) { cleanupErrors.push(`context close: ${String(error)}`); }
    try { await browser?.close(); } catch (error) { cleanupErrors.push(`browser close: ${String(error)}`); }
    try { await server?.close(); } catch (error) { cleanupErrors.push(`server close: ${String(error)}`); }
    if (cleanupErrors.length || !artifacts.final || !artifacts.video) {
      result.success = false;
      result.error = [result.error, ...cleanupErrors, !artifacts.final ? 'Final screenshot missing.' : '', !artifacts.video ? 'Video missing.' : ''].filter(Boolean).join('\n');
    }
    const traceBytes = await readFile(join(outDir, 'trace.json')).catch(() => Buffer.from(JSON.stringify(trace)));
    await Promise.all([
      writeFile(join(outDir, 'inputs.json'), JSON.stringify(inputs, null, 2)),
      writeFile(join(outDir, 'observations.json'), JSON.stringify(observations, null, 2)),
      writeFile(join(outDir, 'events.json'), JSON.stringify(events, null, 2)),
      writeFile(join(outDir, 'manifest.json'), JSON.stringify({ version: 1, purpose: 'reference replay evidence; not a candidate grader',
        startedAt, finishedAt: new Date().toISOString(), environment: { ...environment, browserVersion },
        reference: identity ?? null, referenceEntry: options.entry, referenceOrigin: server?.origin,
        trace: { source: options.tracePath, sha256: createHash('sha256').update(traceBytes).digest('hex') },
        startupMs, fatalDeath, terminalSuccess, cleanupErrors, ...result }, null, 2)),
    ]);
  }
  return result;
}
