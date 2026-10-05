import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';

const ffmpegPath: string | null = createRequire(import.meta.url)('ffmpeg-static');

type BrowserTime = { performanceNowMs: number; dateNowMs: number };
type Sample = {
  index: number;
  atMs: number;
  videoTimeMs: number;
  keys: string[];
  label?: string;
  image: string;
  browserBeforeScreenshot: BrowserTime | null;
  browserAfterScreenshot: BrowserTime | null;
};
type Artifacts = { video: string; frames: string; timeline: string; player: string; captions: string };

/** Raw screenshots are never modified. review.vtt supplies external input captions. */
export class Capture {
  private readonly outDir: string;
  private readonly width: number;
  private readonly height: number;
  private readonly fps: number;
  private readonly samples: Sample[] = [];
  private started = false;
  private finishing = false;
  private finishPromise?: Promise<Artifacts>;
  private encoding: 'pending' | 'complete' | 'failed' = 'pending';
  private encodingError?: string;

  constructor(options: { outDir: string; width: number; height: number; fps: number }) {
    if (!Number.isInteger(options.width) || options.width <= 0 ||
        !Number.isInteger(options.height) || options.height <= 0 ||
        !Number.isFinite(options.fps) || options.fps <= 0) {
      throw new Error('Capture requires positive integer dimensions and a positive finite fps.');
    }
    this.outDir = path.resolve(options.outDir);
    this.width = options.width;
    this.height = options.height;
    this.fps = options.fps;
  }

  async start(): Promise<void> {
    if (this.started) throw new Error('Capture has already started.');
    await mkdir(this.outDir, { recursive: true });
    // Refuse to mix screenshots from separate runs, even after an interrupted run.
    await mkdir(path.join(this.outDir, 'frames'));
    this.started = true;
    await this.persistTimeline();
  }

  async frame(page: Page, atMs: number, keys: string[], label?: string): Promise<void> {
    if (!this.started || this.finishing) throw new Error('Capture is not accepting frames.');
    if (!Number.isFinite(atMs) || atMs < 0 ||
        (this.samples.length > 0 && atMs <= this.samples[this.samples.length - 1].atMs)) {
      throw new Error('Capture timestamps must be finite, nonnegative, and strictly increasing.');
    }
    const viewport = page.viewportSize();
    if (!viewport || viewport.width !== this.width || viewport.height !== this.height) {
      throw new Error(`Capture requires the configured ${this.width}x${this.height} viewport.`);
    }
    const index = this.samples.length;
    const image = `frames/frame-${String(index).padStart(6, '0')}-${String(atMs).padStart(9, '0')}ms.png`;
    const heldKeys = [...keys];
    const before = await this.browserTime(page);
    await page.screenshot({ path: path.join(this.outDir, image), type: 'png', fullPage: false,
      animations: 'allow', caret: 'initial', scale: 'css' });
    const after = await this.browserTime(page);
    this.samples.push({ index, atMs, videoTimeMs: index * 1000 / this.fps,
      keys: heldKeys, ...(label === undefined ? {} : { label }), image,
      browserBeforeScreenshot: before, browserAfterScreenshot: after });
    await this.persistTimeline();
  }

  finish(): Promise<Artifacts> {
    if (!this.finishPromise) {
      this.finishing = true;
      this.finishPromise = this.finalize();
    }
    return this.finishPromise;
  }

  private async browserTime(page: Page): Promise<BrowserTime | null> {
    try {
      return await page.evaluate(() => ({ performanceNowMs: performance.now(), dateNowMs: Date.now() }));
    } catch {
      // Browser closure must not prevent preserving screenshots already acquired.
      return null;
    }
  }

  private async persistTimeline(): Promise<void> {
    await writeFile(path.join(this.outDir, 'timeline.json'), JSON.stringify({
      version: 1,
      viewport: { width: this.width, height: this.height, deviceScaleFactor: 1 },
      fps: this.fps,
      video: 'review.mp4',
      captions: 'review.vtt',
      encoding: this.encoding,
      ...(this.encodingError === undefined ? {} : { encodingError: this.encodingError }),
      timing: {
        atMs: 'Requested simulated replay time; not a wall-clock capture timestamp.',
        videoTimeMs: 'Constant-frame-rate review playback time derived from sample index.',
        browserBeforeScreenshot: 'Observed browser clocks immediately before screenshot acquisition; null if unavailable.',
        browserAfterScreenshot: 'Observed browser clocks immediately after screenshot acquisition; null if unavailable.',
      },
      samples: this.samples,
    }, null, 2) + '\n');
  }

  private async finalize(): Promise<Artifacts> {
    if (!this.started) throw new Error('Capture has not started.');
    await this.persistTimeline();
    const captions = this.samples.map((sample) => {
      const text = `Simulated time: ${sample.atMs} ms | Held keys: ${sample.keys.join(' + ') || '(none)'}` +
        (sample.label === undefined ? '' : ` | ${sample.label}`);
      return `${sample.index + 1}\n${vttTime(sample.videoTimeMs)} --> ${vttTime((sample.index + 1) * 1000 / this.fps)}\n` +
        text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ') + '\n';
    }).join('\n');
    await writeFile(path.join(this.outDir, 'review.vtt'), `WEBVTT\n\n${captions}`);
    await writeFile(path.join(this.outDir, 'review.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Keyboard walkthrough recording</title>
<style>body{font:16px system-ui;background:#171b16;color:#eee;margin:1rem}video{width:100%;max-width:1280px}a{color:#9dd6ff}</style>
<h1>Keyboard walkthrough recording</h1>
<p>10 fps simulated-time review; no audio. Enable captions for held keys and route annotations.</p>
<video controls preload="metadata" src="review.mp4"><track kind="captions" src="review.vtt" srclang="en" label="Inputs and simulated time" default></video>
<p><a href="inputs.json">Exact input transitions</a> · <a href="timeline.json">Frame timestamps</a> · <a href="manifest.json">Reference and environment identity</a></p>
</html>`);
    try {
      if (this.samples.length === 0) throw new Error('No screenshots were captured; a review video cannot be encoded.');
      if (!ffmpegPath) throw new Error('ffmpeg-static did not provide an executable for this platform.');
      // Relative paths are generated by this recorder, never supplied by the trace.
      const entries = this.samples.map((sample) => `file '${sample.image}'\nduration ${1 / this.fps}\n`).join('');
      const concat = 'frames.ffconcat';
      await writeFile(path.join(this.outDir, concat), `ffconcat version 1.0\n${entries}file '${this.samples[this.samples.length - 1].image}'\n`);
      await encode(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        '-f', 'concat', '-safe', '1', '-r', String(this.fps), '-i', concat,
        '-an', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-r', String(this.fps),
        '-frames:v', String(this.samples.length), '-c:v', 'libx264',
        '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', 'review.mp4',
      ], this.outDir);
      this.encoding = 'complete';
      await this.persistTimeline();
      return { video: 'review.mp4', frames: 'frames', timeline: 'timeline.json',
        player: 'review.html', captions: 'review.vtt' };
    } catch (error) {
      this.encoding = 'failed';
      this.encodingError = error instanceof Error ? error.message : String(error);
      await this.persistTimeline();
      throw new Error(`Recording finalization failed: ${this.encodingError}. Raw screenshots, timeline.json, and review.vtt remain in ${this.outDir}.`, { cause: error });
    }
  }
}

function vttTime(ms: number): string {
  const rounded = Math.round(ms);
  const hours = Math.floor(rounded / 3_600_000);
  const minutes = Math.floor(rounded / 60_000) % 60;
  const seconds = Math.floor(rounded / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(rounded % 1000).padStart(3, '0')}`;
}

async function encode(executable: string, args: string[], cwd: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const child = spawn(executable, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-32_768); });
  child.once('error', reject);
  child.once('close', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`ffmpeg exited ${code === null ? `with signal ${signal}` : `with code ${code}`}: ${stderr.trim()}`));
  });
  return promise;
}
