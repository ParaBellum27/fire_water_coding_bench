import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir, realpath, stat, lstat, readlink } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { startServer, type LocalServer } from './server.js';

export type Status = 'PASS' | 'FAIL' | 'NOT_REACHED' | 'AWAITING_REVIEW' | 'EVALUATOR_ERROR';
export type ClockMode = 'real' | 'controlled';
export type AssessmentId = 'BOOT' | 'FLOOR_SUPPORT' | 'FIREBOY_MOVE' | 'WATERGIRL_MOVE' | 'SIMULTANEOUS_RELEASE' | 'FIREBOY_JUMP' | 'WATERGIRL_JUMP' | 'RESET_R' | 'RESET_BUTTON' | 'NO_INPUT';
export interface AssessmentProfile { version: 1; fireboy: string; watergirl: string; floor: string; restart: string; timer?: string }
export interface AssessmentOptions { candidate: string; profile?: string; out?: string; compareClocks?: boolean }
export interface Assertion { id: AssessmentId; clock: ClockMode; status: Status; reason: string; evidence: string[]; observations: Observation[] }
type Box = { x: number; y: number; width: number; height: number };
type Stamp = { hostEpochMs: number; hostMonotonicMs: number; browserPerformanceMs: number; browserEpochMs: number };
type Observation = { label: string; trial: string; requestedElapsedMs: number; stamp: Stamp; fireboy: Box | null; watergirl: Box | null; floor: Box | null; timer: string | null; restart: Box | null; surfaces: number; clearFireboy: boolean; clearWatergirl: boolean };
type FileHash = { path: string; sha256: string; bytes: number; link?: string };
export interface ClockComparisonReport { status: string; reviewedStatus?: string; [key: string]: unknown }
export interface ReviewArtifacts { record: string; report: string; html: string }
export interface AssessmentReport { version: 1; runId: string; runDirectory: string; submission: { root: string; entry: string; before: FileHash[]; after: FileHash[]; sha256: string; afterSha256: string | null }; protocolSha256: string; profile: AssessmentProfile | null; profileSha256: string | null; startedAt: string; finishedAt: string; assertions: Assertion[]; aggregate: 'PASS' | 'FAIL' | 'INCOMPLETE' | 'EVALUATOR_ERROR'; exitCode: number; errors: string[]; comparison?: ClockComparisonReport; reviewArtifacts?: ReviewArtifacts }
const ids: AssessmentId[] = ['BOOT', 'FLOOR_SUPPORT', 'FIREBOY_MOVE', 'WATERGIRL_MOVE', 'SIMULTANEOUS_RELEASE', 'FIREBOY_JUMP', 'WATERGIRL_JUMP', 'RESET_R', 'RESET_BUTTON', 'NO_INPUT'];
const prerequisites: Record<AssessmentId, AssessmentId[]> = {
  BOOT: [], FLOOR_SUPPORT: ['BOOT'], FIREBOY_MOVE: ['BOOT', 'FLOOR_SUPPORT'], WATERGIRL_MOVE: ['BOOT', 'FLOOR_SUPPORT'],
  SIMULTANEOUS_RELEASE: ['BOOT', 'FLOOR_SUPPORT', 'FIREBOY_MOVE', 'WATERGIRL_MOVE'],
  FIREBOY_JUMP: ['BOOT', 'FLOOR_SUPPORT'], WATERGIRL_JUMP: ['BOOT', 'FLOOR_SUPPORT'],
  RESET_R: ['BOOT', 'FLOOR_SUPPORT', 'FIREBOY_MOVE', 'WATERGIRL_MOVE'], RESET_BUTTON: ['BOOT', 'FLOOR_SUPPORT', 'FIREBOY_MOVE', 'WATERGIRL_MOVE'], NO_INPUT: ['BOOT', 'FLOOR_SUPPORT'],
};
const budgets: Record<AssessmentId, number> = { BOOT: 12000, FLOOR_SUPPORT: 15000, FIREBOY_MOVE: 30000, WATERGIRL_MOVE: 30000, SIMULTANEOUS_RELEASE: 55000, FIREBOY_JUMP: 18000, WATERGIRL_JUMP: 18000, RESET_R: 35000, RESET_BUTTON: 35000, NO_INPUT: 85000 };
const descriptions: Record<AssessmentId, string> = {
  BOOT: 'Observe startup for at most 3000ms. Require two distinct visible non-overlapping character boxes and visible floor in viewport. Missing/slow/profileless visual identity requires review, not a canvas-presence pass.',
  FLOOR_SUPPORT: 'Allow at most 1200ms initial settling, then sample both characters every 100ms for 600ms. Require bottom within 2px of visible floor top, horizontal floor overlap and at most 2px box drift throughout. Canvas requires review of actual support.',
  FIREBOY_MOVE: 'Fresh trials ArrowRight for 80,160,320ms maximum three. Measure before release, release, then screenshot. Earliest >=4px right displacement with Watergirl <=2px drift passes on supported clear ground. Wall/obstruction/unsupported trials are NOT_REACHED.',
  WATERGIRL_MOVE: 'Fresh trials d for 80,160,320ms maximum three. Measure before release, release, then screenshot. Earliest >=4px right displacement with Fireboy <=2px drift passes on supported clear ground. Wall/obstruction/unsupported trials are NOT_REACHED.',
  SIMULTANEOUS_RELEASE: 'Two opposite release variants, each fresh 80,160,320ms trials. Hold ArrowRight+d, measure both >=4px; release ArrowRight retaining d for same interval, require Fireboy drift <=2px and Watergirl >=4px; reverse released key in second variant. Clear supported ground required in both phases. DOM screenshots after all keys released. Canvas adds intentional both-held intermediate screenshot; its actual elapsed hold including screenshot overhead is logged for review.',
  FIREBOY_JUMP: 'Settled supported start; ArrowUp held 80ms, sampled during tap, then released. Read-only box samples every 50ms through ascent/apex/descent and supported landing, maximum 3000ms. Require rise >=8px, observed descending sample, no other-character drift >2px, supported landing <=2px and 600ms idle support. Screenshots at release, apex evidence and landing; screenshot delays included in timestamps.',
  WATERGIRL_JUMP: 'Same grounded jump procedure with w and Watergirl. No second airborne jump or movement input. Require ascent >=8px, descent, landing within 2px, stable 600ms support and Fireboy drift <=2px.',
  RESET_R: 'Fresh settled scene; seed actual >=4px displacement of BOTH characters with ArrowRight+d using bounded 80/160/320ms fresh trials. With movement keys still held press r. Measure reset before releasing old keys, observe 600ms with formerly-held inputs, then release and observe another 600ms. Require both starting boxes restored <=2px and no drift. Observable timer must reset (numeric/text evidence); absent/uninterpretable timer leaves full reset claim pending review.',
  RESET_BUTTON: 'Same displaced and formerly-held-input reset precondition as RESET_R; activate visible actionable Restart button by click, not candidate state. Missing visible actionable Restart is NOT_REACHED. Timer rule is identical.',
  NO_INPUT: 'Fresh scene, no keyboard/mouse input for full 60000ms beginning at navigation completion. Samples at startup/settling and nominal 5000ms intervals (actual timestamps include observation/screenshot overhead), screenshots at startup, 30s and 60s. After settling require continuously supported characters with <=2px drift; blank/broken/unsupported scene cannot pass. Profileless visual survival requires review.',
};
export const ASSESSMENT_PROTOCOL = {
  version: 2, scope: 'Minimal two-character browser assessment, not Forest Temple completion or game fidelity.',
  viewport: { width: 1280, height: 960, deviceScaleFactor: 1 }, startupMs: 3000, initialSettlingMaxMs: 1200, settleMs: 600,
  movementTrialsMs: [80, 160, 320], displacementPx: 4, driftPx: 2, risePx: 8, jumpSampleMs: 50, jumpDeadlineMs: 3000, idleMs: 60000,
  clocks: { default: 'real', compare: ['real', 'controlled'], controlledEpoch: '2026-10-05T12:00:00.000Z',
    comparison: { positionTolerancePx: 4, requestedTimeToleranceMs: 60, actualBrowserElapsedToleranceMs: 120, hostElapsedToleranceMs: 200,
      rule: 'Pair same scenario/trial/sample label, compare relative rendered trajectories and actual elapsed clocks. Missing samples mean pending correspondence review; tolerance violations mean DIVERGED. Profileless or pending claims require human visual comparison. Matching statuses alone never proves clock equivalence. Calibration only; does not authorize controlled time for candidates.' } },
  evidence: 'External CSS profiles are evaluator configuration. Read only rendered boxes, visible text and browser clocks; no candidate globals, data state, success flags or source inspection. Screenshots are raw. Real-time profileless sessions additionally retain full-viewport video from page creation through cleanup, with the navigation and input timeline in actions.json; video frames are not guaranteed to capture every transient state. Controlled sessions do not establish real-time video correspondence. All input transitions, waits, observations and screenshot delays have host/browser timestamps. No external network, WebSockets or service workers.',
  manual: 'Review binds runId, submission SHA256, protocol SHA256, assertion clock/id and exact evidence filenames. Only AWAITING_REVIEW assertions may be decided PASS/FAIL/NOT_REACHED; evaluator errors cannot be overridden. All prerequisites must PASS; failed/unreached prerequisites force NOT_REACHED. Pending prerequisites prevent dependent PASS. Original capture report is never changed.',
  scenarios: ids.map(id => ({ id, prerequisites: prerequisites[id], hostDeadlineMs: budgets[id], procedure: descriptions[id] })),
};
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const errorText = (error: unknown) => error instanceof Error ? error.stack ?? error.message : String(error);
function inside(root: string, path: string) { return path === root || path.startsWith(root + sep); }
async function canonicalDestination(path: string): Promise<string> {
  try { return await realpath(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(await canonicalDestination(dirname(path)), basename(path));
  }
}
async function identity(root: string): Promise<FileHash[]> {
  const files: FileHash[] = [];
  async function visit(dir: string) {
    for (const name of (await readdir(dir)).sort()) {
      const file = join(dir, name), info = await lstat(file), rel = relative(root, file).split(sep).join('/');
      if (info.isSymbolicLink()) {
        const target = await realpath(file);
        if (!inside(root, target)) throw new Error(`Submission symlink escapes served root: ${rel}`);
        const link = await readlink(file);
        if ((await stat(file)).isDirectory()) throw new Error(`Directory symlinks are not supported for reproducible submission hashing: ${rel}`);
        const bytes = await readFile(file); files.push({ path: rel, sha256: hash(bytes), bytes: bytes.length, link });
      } else if (info.isDirectory()) await visit(file);
      else if (info.isFile()) { const bytes = await readFile(file); files.push({ path: rel, sha256: hash(bytes), bytes: bytes.length }); }
    }
  }
  await visit(root); return files;
}
function boxDrift(a: Box | null, b: Box | null): number {
  return !a || !b ? Infinity : Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
}
function supported(box: Box | null, floor: Box | null): boolean {
  return !!box && !!floor && Math.abs(box.y + box.height - floor.y) <= 2 && box.x >= floor.x - 2 && box.x + box.width <= floor.x + floor.width + 2;
}
function ground(o: Observation) { return supported(o.fireboy, o.floor) && supported(o.watergirl, o.floor); }
function bootVisible(o: Observation) {
  const f = o.fireboy, w = o.watergirl;
  return !!f && !!w && !!o.floor && !(f.x < w.x + w.width && f.x + f.width > w.x && f.y < w.y + w.height && f.y + f.height > w.y);
}
function clear(o: Observation, actor: 'fireboy' | 'watergirl') { return ground(o) && (actor === 'fireboy' ? o.clearFireboy : o.clearWatergirl); }
function boundary(o: Observation, actor: 'fireboy' | 'watergirl') {
  const b = o[actor], f = o.floor;
  return !b || !f || b.x + b.width >= Math.min(1280, f.x + f.width) - 2 || !supported(b, f);
}
function aggregate(assertions: Assertion[], errors: string[]): AssessmentReport['aggregate'] {
  if (errors.length || assertions.some(a => a.status === 'EVALUATOR_ERROR')) return 'EVALUATOR_ERROR';
  if (assertions.some(a => a.status === 'FAIL')) return 'FAIL';
  if (assertions.some(a => a.status === 'AWAITING_REVIEW' || a.status === 'NOT_REACHED')) return 'INCOMPLETE';
  return 'PASS';
}
function exitCode(status: AssessmentReport['aggregate']) { return { PASS: 0, FAIL: 1, INCOMPLETE: 2, EVALUATOR_ERROR: 3 }[status]; }

class Session {
  readonly held = new Set<string>();
  readonly observations: Observation[] = [];
  readonly evidence: string[] = [];
  context!: BrowserContext;
  page!: Page;
  navigationHostMs = 0;
  navigationBrowserMs = 0;
  private sequence = 0;
  private requestedElapsedMs = 0;
  private videoSaved = false;
  constructor(readonly browser: Browser, readonly origin: string, readonly entry: string, readonly clock: ClockMode,
    readonly profile: AssessmentProfile | null, readonly out: string, readonly prefix: string,
    readonly actions: Record<string, unknown>[], readonly events: Record<string, unknown>[]) {}
  async open() {
    this.context = await this.browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, serviceWorkers: 'block',
      ...(!this.profile && this.clock === 'real' ? { recordVideo: { dir: join(this.out, 'videos'), size: { width: 1280, height: 960 } } } : {}) });
    this.context.setDefaultTimeout(2500); this.context.setDefaultNavigationTimeout(3000);
    await this.context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === this.origin) await route.continue();
      else { this.events.push({ scenario: this.prefix, hostEpochMs: Date.now(), type: 'blocked-request', url: url.href }); await route.abort('blockedbyclient'); }
    });
    await this.context.routeWebSocket(/.*/, ws => { this.events.push({ scenario: this.prefix, type: 'blocked-websocket', url: ws.url(), hostEpochMs: Date.now() }); ws.close(); });
    this.page = await this.context.newPage();
    this.page.on('pageerror', error => this.events.push({ scenario: this.prefix, type: 'candidate-pageerror', message: error.message, stack: error.stack, hostEpochMs: Date.now() }));
    this.page.on('console', message => this.events.push({ scenario: this.prefix, type: 'console', level: message.type(), text: message.text(), location: message.location(), hostEpochMs: Date.now() }));
    this.page.on('requestfailed', request => this.events.push({ scenario: this.prefix, type: 'requestfailed', url: request.url(), failure: request.failure(), hostEpochMs: Date.now() }));
    if (this.clock === 'controlled') {
      const epoch = new Date(ASSESSMENT_PROTOCOL.clocks.controlledEpoch);
      await this.page.clock.install({ time: epoch }); await this.page.clock.pauseAt(epoch);
    }
    try { await this.page.goto(new URL(this.entry, this.origin + '/').href, { waitUntil: 'domcontentloaded', timeout: 3000 }); }
    catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') this.events.push({ scenario: this.prefix, type: 'candidate-startup-timeout', message: error.message });
      else throw error;
    }
    const stamp = await this.stamp(); this.navigationHostMs = stamp.hostMonotonicMs; this.navigationBrowserMs = stamp.browserPerformanceMs;
    this.actions.push({ scenario: this.prefix, type: 'navigation-complete', stamp });
  }
  async stamp(): Promise<Stamp> {
    const before = performance.now();
    const browser = await this.page.evaluate(() => ({ browserPerformanceMs: performance.now(), browserEpochMs: Date.now() }));
    return { hostEpochMs: Date.now(), hostMonotonicMs: (before + performance.now()) / 2, ...browser };
  }
  async wait(ms: number, label: string) {
    const before = await this.stamp();
    if (this.clock === 'real') await sleep(ms); else await this.page.clock.runFor(ms);
    this.requestedElapsedMs += ms;
    const after = await this.stamp();
    this.actions.push({ scenario: this.prefix, type: 'wait', label, requestedMs: ms, held: [...this.held], before, after });
  }
  async keys(keys: string[], label: string) {
    for (const key of [...this.held]) if (!keys.includes(key)) {
      const before = await this.stamp(); await this.page.keyboard.up(key); this.held.delete(key);
      this.actions.push({ scenario: this.prefix, type: 'key-up', key, label, before, after: await this.stamp(), held: [...this.held] });
    }
    for (const key of keys) if (!this.held.has(key)) {
      const before = await this.stamp(); await this.page.keyboard.down(key); this.held.add(key);
      this.actions.push({ scenario: this.prefix, type: 'key-down', key, label, before, after: await this.stamp(), held: [...this.held] });
    }
  }
  async observe(label: string): Promise<Observation> {
    const before = performance.now();
    const result = await this.page.evaluate((profile) => {
      // Object methods serialize without tsx's host-only function-name helpers.
      const helpers = {
        visible(element: Element | null): Box | null {
          if (!element) return null;
          const r = element.getBoundingClientRect(), style = getComputedStyle(element);
          if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0 || r.width <= 0 || r.height <= 0 || r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight) return null;
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const s = getComputedStyle(parent); if (s.visibility !== 'visible' || s.display === 'none' || Number(s.opacity) === 0) return null;
          }
          // Center hit-testing catches covered boxes; children are allowed, unrelated overlays are not.
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          if (hit && hit !== element && !element.contains(hit)) return null;
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        },
        one(selector?: string): Element | null {
          if (!selector) return null;
          const elements = document.querySelectorAll(selector); return elements.length === 1 ? elements[0] : null;
        },
        corridor(actor: Element | null, box: Box | null) {
          if (!actor || !box || !floor || box.x + box.width + 4 > Math.min(innerWidth, floor.x + floor.width) - 2) return false;
          for (const element of document.querySelectorAll('body *')) {
            if (element === actor || element === fb || element === wg || element === fl || actor.contains(element) || element.contains(actor) || element.contains(fl)) continue;
            const r = element.getBoundingClientRect(), style = getComputedStyle(element);
            if (r.width <= 0 || r.height <= 0 || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) continue;
            if (r.x < box.x + box.width + 4 && r.right > box.x + box.width && r.y < box.y + box.height - 2 && r.bottom > box.y + 2) {
              if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none' || element.matches('canvas,img,svg,video') || parseFloat(style.borderWidth) > 0) return false;
            }
          }
          return true;
        },
      };
      const fb = helpers.one(profile?.fireboy), wg = helpers.one(profile?.watergirl), fl = helpers.one(profile?.floor), restartElement = helpers.one(profile?.restart);
      const fireboy = helpers.visible(fb), watergirl = helpers.visible(wg), floor = helpers.visible(fl);
      const timerElement = helpers.one(profile?.timer);
      const timer = timerElement && helpers.visible(timerElement) ? timerElement.textContent?.trim() ?? null : null;
      const restart = restartElement && !restartElement.matches(':disabled,[aria-disabled="true"]') && getComputedStyle(restartElement).pointerEvents !== 'none' ? helpers.visible(restartElement) : null;
      return { fireboy, watergirl, floor, timer, restart, clearFireboy: helpers.corridor(fb, fireboy), clearWatergirl: helpers.corridor(wg, watergirl),
        surfaces: [...document.querySelectorAll('canvas,img,svg')].filter(e => helpers.visible(e)).length,
        browserPerformanceMs: performance.now(), browserEpochMs: Date.now() };
    }, this.profile);
    const { browserPerformanceMs, browserEpochMs, ...boxes } = result;
    const observation: Observation = { label, trial: this.prefix.replace(/^(?:real|controlled)-[^-]+-/, ''), requestedElapsedMs: this.requestedElapsedMs, stamp: { hostEpochMs: Date.now(), hostMonotonicMs: (before + performance.now()) / 2, browserPerformanceMs, browserEpochMs }, ...boxes };
    this.observations.push(observation); this.actions.push({ scenario: this.prefix, type: 'observation', held: [...this.held], observation }); return observation;
  }
  async screenshot(label: string) {
    const name = `screenshots/${this.prefix}-${String(this.sequence++).padStart(3, '0')}-${label.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    const before = await this.stamp(); await this.page.screenshot({ path: join(this.out, name), type: 'png', fullPage: false, animations: 'allow', caret: 'initial', scale: 'css', timeout: 3000 });
    this.evidence.push(name); this.actions.push({ scenario: this.prefix, type: 'screenshot', file: name, held: [...this.held], before, after: await this.stamp() });
  }
  async startup() {
    let o = await this.observe('startup-0');
    const startHost = performance.now(), startBrowser = o.stamp.browserPerformanceMs;
    while (!bootVisible(o) && (this.clock === 'real' ? performance.now() - startHost : o.stamp.browserPerformanceMs - startBrowser) < 3000) {
      await this.wait(100, 'startup-observation'); o = await this.observe('startup');
    }
    await this.screenshot('startup');
    if (this.profile && !bootVisible(o)) {
      const counts = await this.page.evaluate(p => [p.fireboy, p.watergirl, p.floor].map(selector => document.querySelectorAll(selector).length), this.profile);
      if (counts.some(count => count !== 1)) throw new Error(`Evaluator profile character/floor selectors must each resolve uniquely after startup; observed counts ${counts.join(',')}. Missing or ambiguous mapping is not a gameplay failure.`);
    }
    return o;
  }
  async settle() {
    let first = await this.observe('settling-initial');
    for (let i = 0; this.profile && !ground(first) && i < 12; i++) {
      await this.wait(100, 'initial-settling'); first = await this.observe(`settling-initial-${i + 1}`);
    }
    const samples = [await this.observe('settle-start')];
    for (let i = 1; i <= 6; i++) { await this.wait(100, 'settling'); samples.push(await this.observe(`settle-${i}`)); }
    const start = samples[0];
    return { start, end: samples[samples.length - 1], stable: samples.every(o => ground(o) && boxDrift(start.fireboy, o.fireboy) <= 2 && boxDrift(start.watergirl, o.watergirl) <= 2) };
  }
  async close() {
    let inputError: unknown;
    if (this.page && !this.page.isClosed()) {
      try { await this.keys([], 'cleanup'); }
      catch (error) { inputError = error; this.events.push({ type: 'cleanup-input-error', scenario: this.prefix, error: errorText(error) }); }
      try { await this.screenshot('context-final'); } finally { await this.context?.close(); }
    } else await this.context?.close();
    const video = this.page?.video();
    if (video && !this.videoSaved) {
      const file = `videos/${this.prefix}.webm`;
      await video.saveAs(join(this.out, file));
      await video.delete();
      this.videoSaved = true;
      this.evidence.push(file);
      this.actions.push({ scenario: this.prefix, type: 'video', file, note: 'Full viewport recording; correlate visible scene/timer with navigation and input timestamps. Encoding may omit short transients.' });
    }
    if (inputError) throw inputError;
  }
}

function decision(status: Status, reason: string): Pick<Assertion, 'status' | 'reason'> { return { status, reason }; }
function pending(reason: string) { return decision('AWAITING_REVIEW', reason); }
function movementResult(start: Observation, end: Observation, actor: 'fireboy' | 'watergirl') {
  const other = actor === 'fireboy' ? 'watergirl' : 'fireboy';
  if (!clear(start, actor) || !ground(end) || boundary(end, actor)) return decision('NOT_REACHED', 'Trial is outside clear supported ground or reaches a visible wall/floor limit; not evidence of failed controls.');
  const displacement = end[actor]!.x - start[actor]!.x;
  if (boxDrift(start[other], end[other]) > 2) return decision('FAIL', 'Independent movement displaced the other character more than 2px.');
  return displacement >= 4 ? decision('PASS', `Visible independent right displacement ${displacement.toFixed(2)}px.`) : decision('FAIL', `Right displacement ${displacement.toFixed(2)}px below 4px threshold.`);
}
function timerReset(start: string | null, seeded: string | null, reset: string | null): boolean | null {
  if (start === null || seeded === null || reset === null) return null;
  // Interpret only plain elapsed-time displays (seconds or colon-separated clock); all other displays need visual review.
  const number = (text: string) => {
    if (!/^\d+(?:\.\d+)?(?:\s*s)?$/.test(text) && !/^\d+:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(text)) return NaN;
    return text.replace(/\s*s$/, '').split(':').reduce((total, value) => total * 60 + Number(value), 0);
  };
  const a = number(start), b = number(seeded), c = number(reset);
  if (![a, b, c].every(Number.isFinite) || b <= a) return null;
  return c <= a + 0.2 && c < b;
}

async function executeScenario(id: AssessmentId, clock: ClockMode, make: (trial: string) => Promise<Session>, profile: AssessmentProfile | null): Promise<Pick<Assertion, 'status' | 'reason'>> {
  const durations = [80, 160, 320];
  const visual = !profile;
  if (id === 'FIREBOY_MOVE' || id === 'WATERGIRL_MOVE') {
    const actor = id === 'FIREBOY_MOVE' ? 'fireboy' : 'watergirl', key = actor === 'fireboy' ? 'ArrowRight' : 'd';
    let last = decision('NOT_REACHED', 'No supported clear movement trial.');
    for (const duration of durations) {
      const s = await make(`trial-${duration}`);
      try {
        await s.startup(); const settled = await s.settle();
        if (!visual && (!settled.stable || !clear(settled.end, actor))) { await s.screenshot('unavailable-ground'); last = decision('NOT_REACHED', 'Settled supported clear start unavailable.'); continue; }
        await s.screenshot('movement-start');
        const start = await s.observe('move-start'); await s.keys([key], 'movement'); await s.wait(duration, 'movement');
        const end = await s.observe('move-end'); await s.keys([], 'movement-release'); await s.screenshot('movement-end');
        if (visual) { last = pending('Review independent movement and supported unobstructed start in all bounded trials.'); continue; }
        last = movementResult(start, end, actor);
        if (last.status === 'PASS' || (last.status === 'FAIL' && boxDrift(start[actor === 'fireboy' ? 'watergirl' : 'fireboy'], end[actor === 'fireboy' ? 'watergirl' : 'fireboy']) > 2)) return last;
      } finally { await s.close(); }
    }
    return last;
  }
  if (id === 'SIMULTANEOUS_RELEASE') {
    for (const released of ['ArrowRight', 'd']) {
      let variant = decision('NOT_REACHED', 'No clear supported simultaneous trial.');
      for (const duration of durations) {
        const s = await make(`${released === 'd' ? 'release-d' : 'release-arrow'}-${duration}`);
        try {
          await s.startup(); const settled = await s.settle();
          if (!visual && (!settled.stable || !clear(settled.end, 'fireboy') || !clear(settled.end, 'watergirl'))) { await s.screenshot('unavailable-ground'); continue; }
          await s.screenshot('simultaneous-start');
          const start = await s.observe('simultaneous-start'); await s.keys(['ArrowRight', 'd'], 'both-right'); await s.wait(duration, 'both-right'); const both = await s.observe('both-end');
          if (visual) await s.screenshot('both-moving-before-release');
          const retained = released === 'd' ? 'ArrowRight' : 'd'; await s.keys([retained], 'independent-release');
          const releaseStart = await s.observe('release-start');
          await s.wait(duration, 'retained-right');
          const end = await s.observe('release-end'); await s.keys([], 'all-released'); await s.screenshot('release-end');
          if (visual) { variant = pending('Review simultaneous movement and independent release in both variants.'); continue; }
          if (!ground(both) || !ground(end) || ['fireboy', 'watergirl'].some(a => boundary(both, a as 'fireboy' | 'watergirl') || boundary(end, a as 'fireboy' | 'watergirl'))) { variant = decision('NOT_REACHED', 'Visible wall/support limit reached in simultaneous trial.'); continue; }
          const stopped = released === 'd' ? 'watergirl' : 'fireboy', moving = released === 'd' ? 'fireboy' : 'watergirl';
          if (!clear(releaseStart, moving)) { variant = decision('NOT_REACHED', 'Retained character has no clear supported continuation corridor.'); continue; }
          if (boxDrift(releaseStart[stopped], end[stopped]) > 2) return decision('FAIL', `Released ${released} character continued drifting >2px.`);
          const bothMoved = both.fireboy!.x - start.fireboy!.x >= 4 && both.watergirl!.x - start.watergirl!.x >= 4;
          const continues = end[moving]!.x - releaseStart[moving]!.x >= 4;
          variant = bothMoved && continues ? decision('PASS', 'Both moved and independently released character stopped while retained character continued.') : decision('FAIL', 'Insufficient simultaneous/retained displacement after bounded trial.');
          if (variant.status === 'PASS') break;
        } finally { await s.close(); }
      }
      if (variant.status !== 'PASS' && !visual) return variant;
    }
    return visual ? pending('Both opposite release variants captured; visual prerequisites and behavior require review.') : decision('PASS', 'Both opposite independent-release variants passed visible-box thresholds.');
  }
  if (id === 'RESET_R' || id === 'RESET_BUTTON') {
    let last = decision('NOT_REACHED', 'Reset precondition could not seed actual displacement of both characters.');
    for (const duration of durations) {
      const s = await make(`seed-${duration}`);
      try {
        await s.startup(); const settled = await s.settle(); const start = await s.observe('reset-start');
        if (!visual && (!settled.stable || !clear(start, 'fireboy') || !clear(start, 'watergirl'))) { await s.screenshot('unavailable-ground'); continue; }
        await s.screenshot('reset-start');
        if (id === 'RESET_BUTTON') {
          if (profile ? !start.restart : !(await s.page.getByRole('button', { name: /restart/i }).count())) { await s.screenshot('restart-unavailable'); return decision('NOT_REACHED', 'No visible actionable Restart control observed.'); }
        }
        await s.keys(['ArrowRight', 'd'], 'reset-seed'); await s.wait(duration, 'reset-seed'); const seeded = await s.observe('reset-seeded');
        if (!visual && (!ground(seeded) || boundary(seeded, 'fireboy') || boundary(seeded, 'watergirl'))) { await s.keys([], 'seed-release'); await s.screenshot('seed-wall'); continue; }
        if (!visual && (seeded.fireboy!.x - start.fireboy!.x < 4 || seeded.watergirl!.x - start.watergirl!.x < 4)) { await s.keys([], 'seed-release'); await s.screenshot('insufficient-seed'); continue; }
        // This screenshot intentionally records still-held displacement; its elapsed delay is measured, never hidden.
        await s.screenshot('displaced-before-reset');
        const actualSeed = await s.observe('reset-preactivation');
        if (!visual && (!ground(actualSeed) || boundary(actualSeed, 'fireboy') || boundary(actualSeed, 'watergirl'))) { await s.keys([], 'seed-wall-release'); continue; }
        const before = await s.stamp();
        if (id === 'RESET_R') { await s.keys(['ArrowRight', 'd', 'r'], 'reset-r'); await s.keys(['ArrowRight', 'd'], 'reset-r-release'); }
        else {
          const locator = profile ? s.page.locator(profile.restart) : s.page.getByRole('button', { name: /restart/i });
          if (await locator.count() !== 1 || !(await locator.isVisible()) || !(await locator.isEnabled())) return decision('NOT_REACHED', 'Restart is absent, ambiguous, hidden or disabled.');
          try { await locator.click({ timeout: 1000, trial: true }); } catch { return decision('NOT_REACHED', 'Restart exists but is not actionable.'); }
          await locator.click({ timeout: 1000 });
        }
        s.actions.push({ scenario: s.prefix, type: id === 'RESET_R' ? 'reset-key' : 'restart-click', before, after: await s.stamp(), held: [...s.held] });
        const reset = await s.observe('reset-immediate');
        const heldSamples: Observation[] = [];
        for (let i = 1; i <= 6; i++) { await s.wait(100, 'formerly-held-inputs'); heldSamples.push(await s.observe(`reset-held-${i}`)); }
        await s.keys([], 'reset-old-inputs-release'); const idle = await s.settle(); await s.screenshot('reset-after');
        if (visual) { last = pending('Review actual displaced precondition, restored scene/timer and no drift under formerly-held inputs across bounded fresh seed trials.'); continue; }
        const restored = [reset, ...heldSamples, idle.start, idle.end].every(o => ground(o) && boxDrift(start.fireboy, o.fireboy) <= 2 && boxDrift(start.watergirl, o.watergirl) <= 2);
        if (!restored || !idle.stable) return decision('FAIL', 'Reset did not restore both starting boxes or formerly-held input caused continuing drift.');
        const timer = timerReset(start.timer, actualSeed.timer, reset.timer);
        last = timer === null ? pending('Position/input reset passed, but observable timer reset is absent or inconclusive; full visual reset claim requires review.') : timer ? decision('PASS', 'Actual displaced boxes, cleared formerly-held inputs, idle support and observable timer reset passed.') : decision('FAIL', 'Observable elapsed timer did not reset.');
        return last;
      } finally { await s.close(); }
    }
    return last;
  }
  const s = await make('main');
  try {
    const startup = await s.startup();
    if (id === 'BOOT') return profile && bootVisible(startup) ? decision('PASS', 'Two distinct visible character boxes and visible floor rendered within startup observation.') : pending('Startup visual identity absent/inconclusive within 3s; inspect raw screenshot (canvas/nonempty image alone is not proof).');
    if (id === 'NO_INPUT') {
      const samples = [startup];
      const settled = await s.settle(); samples.push(settled.end);
      let mid = false;
      while (true) {
        const stamp = await s.stamp(), elapsed = (clock === 'real' ? stamp.hostMonotonicMs - s.navigationHostMs : stamp.browserPerformanceMs - s.navigationBrowserMs);
        if (elapsed >= 60000) break;
        await s.wait(Math.min(5000, 60000 - elapsed), 'no-input'); samples.push(await s.observe(`idle-${samples.length}`));
        if (!mid && elapsed >= 25000) { await s.screenshot('idle-30s'); mid = true; }
      }
      samples.push(await s.observe('idle-final')); await s.screenshot('idle-60s');
      if (visual) return pending('Full 60s no-input capture completed; review intact rendered scene, continuous support and survival.');
      if (!bootVisible(startup) || !settled.stable) return decision('NOT_REACHED', 'No stable supported playable start; blank/broken scene cannot earn no-input pass.');
      const postSettle = samples.slice(1);
      return postSettle.every(o => ground(o) && boxDrift(settled.end.fireboy, o.fireboy) <= 2 && boxDrift(settled.end.watergirl, o.watergirl) <= 2) ? decision('PASS', 'Supported stable scene remained within 2px throughout full 60s of no input.') : decision('FAIL', 'No-input scene lost support/visibility or drifted more than 2px.');
    }
    const settled = await s.settle();
    if (id === 'FLOOR_SUPPORT') {
      await s.screenshot('support'); return visual ? pending('Review actual grounded support throughout settled idle interval.') : settled.stable ? decision('PASS', 'Both rendered character bottoms supported within 2px and stable for 600ms.') : decision('FAIL', 'Both characters did not remain visibly supported/stable for 600ms.');
    }
    const actor = id === 'FIREBOY_JUMP' ? 'fireboy' : 'watergirl', other = actor === 'fireboy' ? 'watergirl' : 'fireboy';
    if (!visual && !settled.stable) { await s.screenshot('ungrounded'); return decision('NOT_REACHED', 'Jump start was not settled and grounded.'); }
    await s.screenshot('jump-start');
    const start = await s.observe('jump-start'); await s.keys([actor === 'fireboy' ? 'ArrowUp' : 'w'], 'jump');
    const trajectory: Observation[] = [];
    await s.wait(50, 'jump-tap'); trajectory.push(await s.observe('jump-50')); await s.wait(30, 'jump-tap'); trajectory.push(await s.observe('jump-80'));
    await s.keys([], 'jump-release'); await s.screenshot('jump-release');
    const jumpStartHost = start.stamp.hostMonotonicMs, jumpStartBrowser = start.stamp.browserPerformanceMs;
    let rise = 0, descending = false, airborne = false, landed = false, apexCaptured = false;
    const visualFrames = [250, 500, 750, 1000, 2000];
    for (const sample of trajectory) if (start[actor] && sample[actor]) { rise = Math.max(rise, start[actor]!.y - sample[actor]!.y); airborne ||= !supported(sample[actor], sample.floor); }
    while (true) {
      const previous = trajectory[trajectory.length - 1];
      const elapsed = clock === 'real' ? performance.now() - jumpStartHost : (await s.stamp()).browserPerformanceMs - jumpStartBrowser;
      if (elapsed >= 3000) break;
      await s.wait(Math.min(50, 3000 - elapsed), 'jump-sample'); const sample = await s.observe(`jump-${trajectory.length}`); trajectory.push(sample);
      if (visual && visualFrames.length && elapsed >= visualFrames[0]) await s.screenshot(`jump-visual-${visualFrames.shift()}`);
      if (start[actor] && sample[actor]) {
        rise = Math.max(rise, start[actor]!.y - sample[actor]!.y); airborne ||= !supported(sample[actor], sample.floor);
        if (previous[actor] && sample[actor]!.y > previous[actor]!.y + 0.1) descending = true;
        if (descending && !apexCaptured) { await s.screenshot('jump-apex-descent'); apexCaptured = true; }
        if (airborne && descending && supported(sample[actor], sample.floor)) { landed = true; break; }
      }
    }
    const after = await s.settle(); await s.screenshot('jump-landing');
    if (visual) return pending('Review grounded tap, ascent/apex/descent, landing/support and other-character independence; 3s trajectory captured.');
    if (trajectory.some(o => boxDrift(start[other], o[other]) > 2)) return decision('FAIL', 'Jump moved or hid the other character.');
    return rise >= 8 && descending && landed && after.stable ? decision('PASS', `Grounded jump rose ${rise.toFixed(2)}px, descended and landed supported with 600ms stable idle.`) : decision('FAIL', `Jump evidence incomplete: rise=${rise.toFixed(2)}px, descent=${descending}, landing=${landed}, stableSupport=${after.stable}.`);
  } finally { await s.close(); }
}

function compare(assertions: Assertion[]) {
  const pairs: Record<string, unknown>[] = [];
  let complete = true, equal = true;
  for (const id of ids) {
    const real = assertions.find(a => a.id === id && a.clock === 'real'), controlled = assertions.find(a => a.id === id && a.clock === 'controlled');
    if (!real || !controlled) { complete = false; continue; }
    const grouped = (a: Assertion) => {
      const occurrences = new Map<string, number>();
      return a.observations.map(o => { const label = `${o.trial}/${o.label}`, n = occurrences.get(label) ?? 0; occurrences.set(label, n + 1); return { key: `${label}:${n}`, observation: o }; });
    };
    const r = grouped(real), c = grouped(controlled), lookup = new Map(c.map(o => [o.key, o.observation]));
    if (!r.length || r.length !== c.length) complete = false;
    for (const item of r) {
      const other = lookup.get(item.key);
      const r0 = r.find(sample => sample.observation.trial === item.observation.trial)?.observation;
      const c0 = c.find(sample => sample.observation.trial === other?.trial)?.observation;
      if (!other || !r0 || !c0) { complete = false; pairs.push({ id, sample: item.key, status: 'MISSING' }); continue; }
      const o = item.observation;
      const displacement = (actor: 'fireboy' | 'watergirl') => {
        if (!o[actor] || !other[actor] || !r0[actor] || !c0[actor]) return null;
        return Math.max(Math.abs((o[actor]!.x - r0[actor]!.x) - (other[actor]!.x - c0[actor]!.x)), Math.abs((o[actor]!.y - r0[actor]!.y) - (other[actor]!.y - c0[actor]!.y)));
      };
      const fireboyDeltaPx = displacement('fireboy'), watergirlDeltaPx = displacement('watergirl');
      const realBrowserElapsedMs = o.stamp.browserPerformanceMs - r0.stamp.browserPerformanceMs, controlledBrowserElapsedMs = other.stamp.browserPerformanceMs - c0.stamp.browserPerformanceMs;
      const realHostElapsedMs = o.stamp.hostMonotonicMs - r0.stamp.hostMonotonicMs, controlledHostElapsedMs = other.stamp.hostMonotonicMs - c0.stamp.hostMonotonicMs;
      const tolerances = ASSESSMENT_PROTOCOL.clocks.comparison;
      const trajectoryWithinTolerance = fireboyDeltaPx !== null && watergirlDeltaPx !== null && fireboyDeltaPx <= tolerances.positionTolerancePx && watergirlDeltaPx <= tolerances.positionTolerancePx;
      const browserElapsedWithinTolerance = Math.abs(realBrowserElapsedMs - controlledBrowserElapsedMs) <= tolerances.actualBrowserElapsedToleranceMs;
      const requestedElapsedDeltaMs = Math.abs(o.requestedElapsedMs - other.requestedElapsedMs);
      const requestedElapsedWithinTolerance = requestedElapsedDeltaMs <= tolerances.requestedTimeToleranceMs;
      if (fireboyDeltaPx === null || watergirlDeltaPx === null) complete = false;
      if (!trajectoryWithinTolerance || !browserElapsedWithinTolerance || !requestedElapsedWithinTolerance) equal = false;
      pairs.push({ id, sample: item.key, real: o, controlled: other, fireboyDeltaPx, watergirlDeltaPx, realBrowserElapsedMs, controlledBrowserElapsedMs, realHostElapsedMs, controlledHostElapsedMs,
        trajectoryWithinTolerance, browserElapsedWithinTolerance, requestedElapsedDeltaMs, requestedElapsedWithinTolerance, hostElapsedWithinTolerance: Math.abs(realHostElapsedMs - controlledHostElapsedMs) <= tolerances.hostElapsedToleranceMs });
    }
  }
  const pendingClaims = assertions.some(a => a.status === 'AWAITING_REVIEW' || a.status === 'NOT_REACHED' || a.status === 'EVALUATOR_ERROR');
  return { purpose: 'Baseline calibration only, not authorization to trust controlled candidate clocks.', tolerances: ASSESSMENT_PROTOCOL.clocks.comparison,
    status: !complete || pendingClaims ? 'AWAITING_REVIEW' : equal ? 'WITHIN_DECLARED_OBSERVABLE_TOLERANCES' : 'DIVERGED',
    note: 'Host elapsed differences are reported, not assumed equivalent (controlled waits deliberately compress host time). Browser elapsed and trajectories are compared. Review screenshots for visual-only identity/behavior; result labels do not establish equivalence.', pairs };
}

function escapeHtml(text: string) { return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
async function renderReport(out: string, report: AssessmentReport, filename = 'report.html') {
  await writeFile(join(out, filename), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Browser assessment ${escapeHtml(report.runId)}</title><style>body{font:16px system-ui;margin:2rem;max-width:1300px;background:#181b20;color:#eee}a{color:#9cd4ff}img,video{max-width:100%;border:1px solid #777}section{border-top:1px solid #555;padding:1rem 0}pre{white-space:pre-wrap}</style><h1>Minimal browser assessment: ${report.aggregate}</h1><p>Run ${escapeHtml(report.runId)}. This is not Forest Temple completion. Real-time results only are candidate assessment; controlled comparisons are calibration evidence.</p><p><a href="report.json">Original report</a> · <a href="protocol.json">Frozen protocol</a> · <a href="actions.json">Timestamped raw actions/observations</a> · <a href="events.json">Browser/network errors</a> · <a href="environment.json">Environment</a> · <a href="review-template.json">Bound review template</a></p><pre>${escapeHtml(report.errors.join('\n'))}</pre>${report.assertions.map(a => `<section><h2>${a.clock} / ${a.id}: ${a.status}</h2><p>${escapeHtml(a.reason)}</p><p>Prerequisites: ${prerequisites[a.id].join(', ') || 'none'}</p>${a.evidence.map(file => `<details><summary><a href="${escapeHtml(file)}">${escapeHtml(file)}</a></summary>${file.endsWith('.webm') ? `<video controls preload="none" src="${escapeHtml(file)}"></video>` : `<img loading="lazy" src="${escapeHtml(file)}">`}</details>`).join('')}</section>`).join('')}<section><h2>Clock correspondence</h2><pre>${escapeHtml(report.comparison ? JSON.stringify({ ...report.comparison as object, pairs: 'See report.json for raw paired trajectories and elapsed clocks.' }, null, 2) : 'Not requested.')}</pre></section></html>`);
}

export async function runAssessment(options: AssessmentOptions): Promise<AssessmentReport> {
  const candidate = await realpath(resolve(options.candidate)), info = await stat(candidate);
  const root = info.isDirectory() ? candidate : dirname(candidate), entry = info.isDirectory() ? 'index.html' : basename(candidate);
  if (!(await stat(join(root, entry))).isFile()) throw new Error('Candidate entry must be a file (directories require index.html).');
  const artifactRoot = await canonicalDestination(resolve(options.out ?? 'artifacts/assessments'));
  if (inside(root, artifactRoot)) throw new Error('Output must be outside the served submission directory, including through symlinks.');
  const before = await identity(root), submissionSha = hash(json(before));
  let profile: AssessmentProfile | null = null, profileSha256: string | null = null;
  if (options.profile) {
    const bytes = await readFile(resolve(options.profile)); profileSha256 = hash(bytes); const value: unknown = JSON.parse(bytes.toString());
    if (!value || typeof value !== 'object') throw new Error('Profile must be an object.');
    const p = value as Record<string, unknown>;
    if (p.version !== 1 || !['fireboy', 'watergirl', 'floor', 'restart'].every(key => typeof p[key] === 'string' && (p[key] as string).trim()) || (p.timer !== undefined && typeof p.timer !== 'string') || Object.keys(p).some(key => !['version', 'fireboy', 'watergirl', 'floor', 'restart', 'timer'].includes(key))) throw new Error('Profile must be {version:1,fireboy,watergirl,floor,restart,timer?} with CSS selector strings.');
    profile = p as unknown as AssessmentProfile;
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`, out = join(artifactRoot, runId);
  await mkdir(artifactRoot, { recursive: true }); await mkdir(out); await mkdir(join(out, 'screenshots')); await mkdir(join(out, 'videos'));
  const protocolBytes = json(ASSESSMENT_PROTOCOL), protocolSha256 = hash(protocolBytes);
  // These exact bytes are written before any server/browser/candidate execution and never rewritten.
  await writeFile(join(out, 'protocol.json'), protocolBytes, { flag: 'wx', mode: 0o444 });
  await writeFile(join(out, 'submission-before.json'), json({ root, entry, sha256: submissionSha, files: before }));
  const report: AssessmentReport = { version: 1, runId, runDirectory: out, submission: { root, entry, before, after: [], sha256: submissionSha, afterSha256: null }, protocolSha256, profile, profileSha256, startedAt: new Date().toISOString(), finishedAt: '', assertions: [], aggregate: 'INCOMPLETE', exitCode: 2, errors: [] };
  const actions: Record<string, unknown>[] = [], events: Record<string, unknown>[] = [];
  const require = createRequire(import.meta.url);
  const environment: Record<string, unknown> = { node: process.version, platform: process.platform, arch: process.arch, playwright: require('playwright/package.json').version, chromiumExecutable: chromium.executablePath(), viewport: ASSESSMENT_PROTOCOL.viewport, clocks: options.compareClocks ? ['real', 'controlled'] : ['real'], profile, profileSha256, origin: null };
  let browser: Browser | undefined, server: LocalServer | undefined;
  try {
    server = await startServer(root, entry); environment.origin = server.origin;
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-networking'] }); environment.browserVersion = browser.version();
    for (const clock of (options.compareClocks ? ['real', 'controlled'] : ['real']) as ClockMode[]) {
      for (const id of ids) {
        const failedPrereq = prerequisites[id].find(p => report.assertions.some(a => a.clock === clock && a.id === p && ['FAIL', 'NOT_REACHED', 'EVALUATOR_ERROR'].includes(a.status)));
        const assertion: Assertion = { id, clock, status: 'NOT_REACHED', reason: '', evidence: [], observations: [] }; report.assertions.push(assertion);
        if (failedPrereq) { assertion.reason = `Prerequisite ${failedPrereq} did not pass; scenario not reached.`; continue; }
        const sessions: Session[] = []; let timedOut = false; let timer: NodeJS.Timeout | undefined;
        let scenarioTask: Promise<Pick<Assertion, 'status' | 'reason'>> | undefined;
        const make = async (trial: string) => {
          if (timedOut) throw new Error('Scenario host deadline already expired.');
          const session = new Session(browser!, server!.origin, entry, clock, profile, out, `${clock}-${id}-${trial}`, actions, events); sessions.push(session); await session.open(); return session;
        };
        try {
          scenarioTask = executeScenario(id, clock, make, profile);
          const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error(`Evaluator host deadline ${budgets[id]}ms exceeded for ${id}.`)); }, budgets[id]); });
          Object.assign(assertion, await Promise.race([scenarioTask, deadline]));
          const awaiting = prerequisites[id].find(p => report.assertions.some(a => a.clock === clock && a.id === p && a.status === 'AWAITING_REVIEW'));
          if (awaiting && assertion.status !== 'EVALUATOR_ERROR' && !(id === 'RESET_BUTTON' && assertion.status === 'NOT_REACHED' && /Restart/i.test(assertion.reason))) {
            assertion.status = 'AWAITING_REVIEW'; assertion.reason += ` Prerequisite ${awaiting} is pending; behavior/reachability cannot be awarded until reviewed.`;
          }
        } catch (error) { assertion.status = 'EVALUATOR_ERROR'; assertion.reason = errorText(error); events.push({ type: 'evaluator-error', id, clock, error: assertion.reason }); }
        finally {
          clearTimeout(timer);
          if (timedOut) {
            await Promise.all(sessions.map(session => session.context?.close().catch(error => events.push({ type: 'deadline-cleanup-error', error: errorText(error) }))));
            await scenarioTask?.catch(() => undefined);
          }
          for (const session of sessions) {
            if (session.page && !session.page.isClosed()) {
              try { await session.screenshot('scenario-final'); } catch (error) { events.push({ type: 'evidence-error', id, clock, error: errorText(error) }); assertion.status = 'EVALUATOR_ERROR'; assertion.reason += ` Evidence capture failed: ${errorText(error)}`; }
            }
            try { await session.close(); } catch (error) { events.push({ type: 'context-cleanup-error', id, clock, error: errorText(error) }); assertion.status = 'EVALUATOR_ERROR'; }
            assertion.evidence.push(...session.evidence); assertion.observations.push(...session.observations);
          }
        }
        const candidateErrors = events.filter(event => event.type === 'candidate-pageerror' && typeof event.scenario === 'string' && event.scenario.startsWith(`${clock}-${id}-`));
        if (candidateErrors.length && assertion.status !== 'EVALUATOR_ERROR') {
          assertion.status = 'FAIL'; assertion.reason = `Candidate emitted ${candidateErrors.length} uncaught browser exception(s); inspect events.json. ${assertion.reason}`;
        }
        await writeFile(join(out, 'actions.json'), json(actions)); await writeFile(join(out, 'events.json'), json(events));
      }
    }
  } catch (error) { report.errors.push(errorText(error)); }
  finally {
    try { await browser?.close(); } catch (error) { report.errors.push(`Browser cleanup: ${errorText(error)}`); }
    try { await server?.close(); } catch (error) { report.errors.push(`Server cleanup: ${errorText(error)}`); }
    try {
      const after = await identity(root); report.submission.after = after; report.submission.afterSha256 = hash(json(after));
      if (report.submission.afterSha256 !== submissionSha) report.errors.push('Submission byte identity changed during assessment. No verdict may be trusted.');
    } catch (error) { report.errors.push(`After-run submission hashing failed: ${errorText(error)}`); }
    for (const clock of (options.compareClocks ? ['real', 'controlled'] : ['real']) as ClockMode[]) for (const id of ids) {
      if (!report.assertions.some(a => a.id === id && a.clock === clock)) report.assertions.push({ id, clock, status: 'NOT_REACHED', reason: 'Run infrastructure prevented execution.', evidence: [], observations: [] });
    }
    if (options.compareClocks) report.comparison = compare(report.assertions);
    report.finishedAt = new Date().toISOString(); report.aggregate = aggregate(report.assertions, report.errors);
    if (report.aggregate === 'PASS' && report.comparison?.status === 'AWAITING_REVIEW') report.aggregate = 'INCOMPLETE';
    report.exitCode = exitCode(report.aggregate);
    await Promise.all([
      writeFile(join(out, 'actions.json'), json(actions)), writeFile(join(out, 'events.json'), json(events)), writeFile(join(out, 'environment.json'), json(environment)),
      writeFile(join(out, 'submission-after.json'), json({ sha256: report.submission.afterSha256, files: report.submission.after, errors: report.errors })),
      writeFile(join(out, 'report.json'), json(report)),
      writeFile(join(out, 'review-template.json'), json({ version: 1, runId, submissionSha256: submissionSha, protocolSha256, reviewer: '', reviewedAt: '',
        instructions: 'Fill nonempty reviewer/reviewedAt, inspect all named evidence and raw observations. Change pending decision to PASS/FAIL/NOT_REACHED with a specific reason; remove unreviewed entries. May not change automated results or evaluator errors. Prerequisite decisions gate dependent verdicts.',
        verdicts: report.assertions.filter(a => a.status === 'AWAITING_REVIEW').map(a => ({ id: a.id, clock: a.clock, decision: 'AWAITING_REVIEW', reason: '', evidence: a.evidence })),
        ...(options.compareClocks ? { clockComparison: { decision: 'AWAITING_REVIEW', reason: '', evidence: report.assertions.flatMap(a => a.evidence) } } : {}) })),
    ]);
    await renderReport(out, report);
  }
  return report;
}

export async function applyAssessmentReview(candidatePath: string, runDirectory: string, reviewPath: string): Promise<AssessmentReport> {
  const out = await realpath(resolve(runDirectory));
  const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8')) as AssessmentReport;
  const protocol = await readFile(join(out, 'protocol.json'));
  const candidate = await realpath(resolve(candidatePath)), info = await stat(candidate), root = info.isDirectory() ? candidate : dirname(candidate);
  const entry = info.isDirectory() ? 'index.html' : basename(candidate);
  if (inside(root, out)) throw new Error('Review artifacts must remain outside the served submission directory.');
  if (root !== report.submission.root || entry !== report.submission.entry || hash(json(await identity(root))) !== report.submission.sha256 || report.submission.afterSha256 !== report.submission.sha256) throw new Error('Review candidate path/bytes do not match the original unchanged submission.');
  if (hash(protocol) !== report.protocolSha256) throw new Error('Frozen protocol bytes do not match report hash.');
  const reviewBytes = await readFile(resolve(reviewPath)); const review = JSON.parse(reviewBytes.toString()) as Record<string, unknown>;
  if (review.version !== 1 || review.runId !== report.runId || review.submissionSha256 !== report.submission.sha256 || review.protocolSha256 !== report.protocolSha256 || typeof review.reviewer !== 'string' || !review.reviewer.trim() || typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt)) || !Array.isArray(review.verdicts)) throw new Error('Review must bind version, run ID, submission hash, protocol hash, named reviewer, valid reviewedAt and verdict array.');
  const reviewed = structuredClone(report), seen = new Set<string>();
  for (const raw of review.verdicts) {
    if (!raw || typeof raw !== 'object') throw new Error('Review verdict must be an object.');
    const v = raw as Record<string, unknown>, key = `${v.clock}/${v.id}`;
    if (seen.has(key)) throw new Error(`Duplicate verdict ${key}.`); seen.add(key);
    const original = report.assertions.find(a => a.id === v.id && a.clock === v.clock), target = reviewed.assertions.find(a => a.id === v.id && a.clock === v.clock);
    if (!original || !target || original.status !== 'AWAITING_REVIEW' || !['PASS', 'FAIL', 'NOT_REACHED'].includes(String(v.decision)) || typeof v.reason !== 'string' || !v.reason.trim() || !Array.isArray(v.evidence) || !v.evidence.length || v.evidence.some(e => typeof e !== 'string')) throw new Error(`Invalid manual verdict ${key}; only pending results with explicit reasons/evidence may be reviewed.`);
    const evidence = v.evidence as string[];
    if (evidence.length !== original.evidence.length || new Set(evidence).size !== evidence.length || original.evidence.some(e => !evidence.includes(e))) throw new Error(`Review must bind all exact original assertion evidence filenames for ${key}.`);
    for (const file of evidence) {
      const canonical = await realpath(join(out, file)); if (!inside(out, canonical) || !(await stat(canonical)).isFile()) throw new Error(`Invalid evidence file ${file}.`);
    }
    target.status = v.decision as Status; target.reason = `Manual review by ${review.reviewer}: ${v.reason}`;
  }
  for (const a of reviewed.assertions) {
    const deps = prerequisites[a.id].map(id => reviewed.assertions.find(p => p.id === id && p.clock === a.clock)!);
    if (a.status === 'EVALUATOR_ERROR') continue;
    const failed = deps.find(d => ['FAIL', 'NOT_REACHED', 'EVALUATOR_ERROR'].includes(d.status));
    if (failed) { a.status = 'NOT_REACHED'; a.reason = `Reviewed prerequisite ${failed.id} is ${failed.status}; retained captures do not establish reachability.`; }
    else if (a.status === 'PASS' && deps.some(d => d.status !== 'PASS')) { a.status = 'AWAITING_REVIEW'; a.reason = 'Manual verdict retained in review record, but prerequisites remain pending; no PASS awarded.'; }
  }
  if (review.clockComparison !== undefined) {
    const comparisonReview = review.clockComparison as Record<string, unknown>;
    if (!report.comparison || !comparisonReview || typeof comparisonReview !== 'object' || !['WITHIN_DECLARED_OBSERVABLE_TOLERANCES', 'DIVERGED'].includes(String(comparisonReview.decision)) || typeof comparisonReview.reason !== 'string' || !comparisonReview.reason.trim() || !Array.isArray(comparisonReview.evidence)) throw new Error('Clock comparison review requires a comparison capture, explicit decision, reason and bound evidence.');
    if (reviewed.errors.length || reviewed.assertions.some(a => a.status === 'EVALUATOR_ERROR')) throw new Error('Clock comparison cannot override evaluator errors.');
    const allEvidence = report.assertions.flatMap(a => a.evidence);
    if (comparisonReview.evidence.length !== allEvidence.length || new Set(comparisonReview.evidence).size !== allEvidence.length || allEvidence.some(file => !(comparisonReview.evidence as unknown[]).includes(file))) throw new Error('Clock comparison review must bind all exact paired capture evidence filenames.');
    for (const file of allEvidence) { const canonical = await realpath(join(out, file)); if (!inside(out, canonical) || !(await stat(canonical)).isFile()) throw new Error(`Missing paired evidence ${file}.`); }
    reviewed.comparison = { ...report.comparison, status: report.comparison!.status, manualComparison: { reviewer: review.reviewer, reviewedAt: review.reviewedAt, ...comparisonReview },
      reviewedStatus: reviewed.assertions.some(a => a.status === 'AWAITING_REVIEW' || a.status === 'NOT_REACHED') ? 'AWAITING_REVIEW' : String(comparisonReview.decision) };
  }
  reviewed.aggregate = aggregate(reviewed.assertions, reviewed.errors);
  if (reviewed.aggregate === 'PASS' && (reviewed.comparison?.reviewedStatus ?? reviewed.comparison?.status) === 'AWAITING_REVIEW') reviewed.aggregate = 'INCOMPLETE';
  reviewed.exitCode = exitCode(reviewed.aggregate);
  const reviewId = `${Date.now()}-${randomUUID()}`;
  reviewed.reviewArtifacts = { record: `review-${reviewId}.json`, report: `report-reviewed-${reviewId}.json`, html: `report-reviewed-${reviewId}.html` };
  await writeFile(join(out, reviewed.reviewArtifacts.record), json({ reviewSha256: hash(reviewBytes), review, appliedAt: new Date().toISOString() }), { flag: 'wx' });
  await writeFile(join(out, reviewed.reviewArtifacts.report), json(reviewed), { flag: 'wx' });
  await renderReport(out, reviewed, reviewed.reviewArtifacts.html);
  return reviewed;
}
