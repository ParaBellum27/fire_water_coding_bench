import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { startServer } from './server.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

// Only DOM-visible text/geometry and clocks are read. No game globals or injected state.
export async function captureScenario({ root, entry = 'index.html', out, scenario, reference = false }) {
  await mkdir(out, { recursive: true });
  await mkdir(join(out, 'screenshots'), { recursive: false });
  const bytes = await readFile(join(root, entry));
  const report = { version: 1, scenario, sourceSha256: hash(bytes), startedAt: new Date().toISOString(),
    observations: [], actions: [], candidateEvents: [], evaluatorErrors: [], clock: scenario.clock,
    privateStateReads: 0, candidateMutations: 0, reference, deadlineExceeded: false };
  let server, browser, context, page;
  const held = new Set();
  let sequence = 0, requestedMs = 0;
  const deadlineStart = performance.now();
  async function stamp() {
    const host = { hostEpochMs: Date.now(), hostMonotonicMs: performance.now(), requestedMs };
    if (!page || page.isClosed()) return host;
    return { ...host, ...await page.evaluate(() => ({ browserPerformanceMs: performance.now(), browserEpochMs: Date.now() })) };
  }
  async function transition(keys, label) {
    const next = new Set(keys);
    for (const key of [...held]) if (!next.has(key)) {
      const before = await stamp(); await page.keyboard.up(key); held.delete(key);
      report.actions.push({ type: 'key-up', key, label, before, after: await stamp() });
    }
    for (const key of keys) if (!held.has(key)) {
      const before = await stamp(); await page.keyboard.down(key); held.add(key);
      report.actions.push({ type: 'key-down', key, label, before, after: await stamp() });
    }
  }
  async function observe(label) {
    const before = await stamp();
    const file = `screenshots/${String(sequence++).padStart(4, '0')}-${label.replace(/[^a-z0-9_-]/gi, '-').slice(0, 85)}.png`;
    const visible = await page.evaluate(() => {
      const box = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      return { text: document.body.innerText, viewport: { width: innerWidth, height: innerHeight },
        scroll: { x: scrollX, y: scrollY, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        surfaces: [...document.querySelectorAll('canvas,svg')].map(e => ({ tag: e.tagName, rect: box(e) })),
        buttons: [...document.querySelectorAll('button,[role="button"]')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ text: e.textContent, rect: box(e) })) };
    });
    await page.screenshot({ path: join(out, file), fullPage: false, timeout: 10000, animations: 'allow', scale: 'css' });
    const observation = { label, file, held: [...held], before, after: await stamp(), visible };
    report.observations.push(observation);
    return observation;
  }
  async function advance(duration, label, sampleEvery = 250) {
    let remaining = duration, part = 0;
    while (remaining > 0) {
      if (performance.now() - deadlineStart > scenario.hostDeadlineMs) {
        report.deadlineExceeded = true; throw new Error('EVALUATOR_DEADLINE: scenario host deadline exceeded');
      }
      const step = Math.min(remaining, sampleEvery);
      const before = await stamp();
      if (scenario.clock === 'controlled') await page.clock.runFor(step);
      else await sleep(step);
      requestedMs += step; remaining -= step;
      report.actions.push({ type: 'advance', label, durationMs: step, before, after: await stamp() });
      await observe(`${label}-${part++}`);
    }
  }
  try {
    server = await startServer(root, entry);
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-networking'] });
    report.browserVersion = browser.version();
    context = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1,
      serviceWorkers: 'block', recordVideo: scenario.clock === 'real' ? { dir: join(out, 'videos'), size: { width: 1280, height: 960 } } : undefined });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
      else { report.candidateEvents.push({ type: 'blocked-request', url: url.href }); await route.abort('blockedbyclient'); }
    });
    await context.routeWebSocket(/.*/, ws => { report.candidateEvents.push({ type: 'blocked-websocket', url: ws.url() }); ws.close(); });
    page = await context.newPage();
    page.setDefaultTimeout(3000);
    page.on('pageerror', error => report.candidateEvents.push({ type: 'pageerror', message: error.message, requestedMs }));
    page.on('console', msg => { if (msg.type() === 'error') report.candidateEvents.push({ type: 'console-error', message: msg.text(), requestedMs }); });
    if (scenario.clock === 'controlled') {
      await page.clock.install({ time: new Date('2026-10-06T12:00:00.000Z') });
      await page.clock.pauseAt(new Date('2026-10-06T12:00:01.000Z'));
    }
    const before = await stamp();
    await page.goto(server.origin + '/' + entry, { waitUntil: 'load', timeout: 30000 });
    report.actions.push({ type: 'navigation', before, after: await stamp() });
    // Reference loader startup is evaluator preparation, never used for candidates.
    if (reference) {
      if (scenario.clock === 'controlled') await page.clock.runFor(4000); else await sleep(4000);
    } else {
      if (scenario.clock === 'controlled') await page.clock.runFor(1000); else await sleep(1000);
    }
    await observe('startup');
    for (const [index, segment] of scenario.segments.entries()) {
      const label = segment.label ?? `segment-${String(index).padStart(2, '0')}`;
      if (segment.operation === 'reset') {
        const before = await stamp();
        if (segment.method === 'R') await page.keyboard.press('r');
        else {
          // A covered or absent button is candidate evidence, not an infrastructure timeout.
          const restart = page.getByRole('button', { name: /restart/i }).first();
          try { await restart.click({ timeout: 2000 }); }
          catch (error) { report.candidateEvents.push({ type: 'reset-unavailable', label, message: String(error), requestedMs }); }
        }
        report.actions.push({ type: 'reset', method: segment.method, label, before, after: await stamp(), held: [...held] });
        await advance(segment.durationMs ?? 700, label, segment.sampleEveryMs ?? 250);
      } else if (segment.operation === 'resize') {
        await page.setViewportSize(segment.viewport); await observe(label);
      } else {
        await transition(segment.keys ?? [], label);
        await advance(segment.durationMs, label, segment.sampleEveryMs ?? scenario.sampleEveryMs ?? 250);
      }
    }
    await transition([], 'final-release');
    await observe('final');
  } catch (error) {
    report.evaluatorErrors.push({ message: String(error), requestedMs });
  } finally {
    try { if (page && !page.isClosed()) await transition([], 'cleanup'); } catch (error) { report.evaluatorErrors.push({ phase: 'key-release', message: String(error) }); }
    if (context) {
      try { const video = page?.video(); await context.close(); if (video) report.video = await video.path(); }
      catch (error) { report.evaluatorErrors.push({ phase: 'video-close', message: String(error) }); }
    }
    try { await browser?.close(); } catch (error) { report.evaluatorErrors.push({ phase: 'browser-close', message: String(error) }); }
    try { await server?.close(); } catch (error) { report.evaluatorErrors.push({ phase: 'server-close', message: String(error) }); }
    report.finishedAt = new Date().toISOString(); report.durationMs = performance.now() - deadlineStart;
    report.sourceAfterSha256 = hash(await readFile(join(root, entry)));
    report.sourceUnchanged = report.sourceSha256 === report.sourceAfterSha256;
    await writeFile(join(out, 'capture.json'), json(report));
  }
  return report;
}

export async function captureSuite({ root, entry = 'index.html', out, scenarios, reference = false }) {
  const results = [];
  for (const scenario of scenarios) {
    console.log(`Serial browser assessment: ${scenario.id}`);
    results.push(await captureScenario({ root, entry, out: join(out, scenario.id), scenario, reference }));
  }
  await writeFile(join(out, 'suite.json'), json({ results: results.map(r => ({ id: r.scenario.id,
    capture: `${r.scenario.id}/capture.json`, screenshots: r.observations.length,
    evaluatorErrors: r.evaluatorErrors, candidateEvents: r.candidateEvents, sourceUnchanged: r.sourceUnchanged })) }));
  return results;
}
