import type { Page } from 'playwright';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

export interface ReferenceIdentity {
  root: string;
  treeSha256: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  provenance: Record<string, unknown>;
  provenanceText: string;
  exactStartupAdapter: string;
  exactEntry: string;
  declaredBundlePatchesVerified: boolean;
}

export interface ReferenceObservation {
  dateNowMs: number;
  performanceNowMs: number;
  current: string | null;
  ready: boolean;
  fatalDeath: boolean;
  terminal: { success: boolean; data: Record<string, unknown> | null; state: Record<string, unknown> | null } | null;
  pers1: Record<string, unknown> | null;
  pers2: Record<string, unknown> | null;
  levelState: Record<string, unknown> | null;
  objects: Array<Record<string, unknown>>;
}

export async function referenceIdentity(root: string): Promise<ReferenceIdentity> {
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const data = await readFile(path);
        files.push({ path: relative(root, path), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
      } else throw new Error(`Reference identity does not permit symlinks/special files: ${path}`);
    }
  }
  await walk(root);
  const provenanceText = await readFile(join(root, 'local-provenance.json'), 'utf8');
  const parsed: unknown = JSON.parse(provenanceText);
  if (!parsed || typeof parsed !== 'object' || !('bundle_changes' in parsed) ||
      !parsed.bundle_changes || typeof parsed.bundle_changes !== 'object' ||
      !('entry' in parsed) || typeof parsed.entry !== 'string' ||
      !('original_bundle_sha256' in parsed) || typeof parsed.original_bundle_sha256 !== 'string' ||
      !('runtime_bundle_sha256' in parsed) || typeof parsed.runtime_bundle_sha256 !== 'string') {
    throw new Error('Invalid reference provenance.');
  }
  const provenance = parsed;
  const patches = parsed.bundle_changes;
  const entry = parsed.entry;
  const original = await readFile(join(root, 'fireboy-and-watergirl-forest-temple.min.js'), 'utf8');
  const runtime = await readFile(join(root, 'runtime.bundle.js'), 'utf8');
  let reconstructed = original;
  for (const [before, after] of Object.entries(patches)) {
    if (!before || typeof after !== 'string') throw new Error('Invalid declared bundle patch.');
    if (!reconstructed.includes(before)) throw new Error(`Declared reference patch is absent: ${before}`);
    reconstructed = reconstructed.replace(before, after);
  }
  if (reconstructed !== runtime) throw new Error('Runtime reference bundle differs from declared exact patches.');
  const digest = (text: string) => createHash('sha256').update(text).digest('hex');
  if (digest(original) !== provenance.original_bundle_sha256 || digest(runtime) !== provenance.runtime_bundle_sha256) {
    throw new Error('Reference bundle identity disagrees with provenance.');
  }
  return { root, treeSha256: digest(JSON.stringify(files)), files, provenance, provenanceText,
    exactStartupAdapter: await readFile(join(root, 'local-start.js'), 'utf8'),
    exactEntry: await readFile(join(root, entry), 'utf8'), declaredBundlePatchesVerified: true };
}

export async function observeReference(page: Page): Promise<ReferenceObservation> {
  return page.evaluate(() => {
    interface Entity {
      sprite?: { x: number; y: number }; x?: number; y?: number; state?: unknown;
      data?: Record<string, unknown>; isDead?: boolean; dead?: boolean;
    }
    interface Terminal { success?: boolean; data?: Record<string, unknown>; state?: Record<string, unknown> }
    interface ReferenceGame {
      level?: { levelStarted?: boolean; ui?: { clock?: { startTime?: number } };
        pers1?: Entity; pers2?: Entity; levelState?: Record<string, unknown>; objects?: Entity[] };
      state?: { current?: string; getCurrentState(): { levelState?: Terminal } };
      physics?: { box2d?: { paused?: boolean } }; paused?: boolean;
    }
    // This is the documented upstream reference runtime, never a candidate grading interface.
    const referenceWindow = window as unknown as { referenceGame?: ReferenceGame };
    const game = referenceWindow.referenceGame;
    const level = game?.level;
    const current = game?.state?.current ?? null;
    const terminal = current === 'endGame' ? game?.state?.getCurrentState()?.levelState : null;
    // Object methods remain self-contained when tsx preserves function names.
    // Assigned arrow helpers would reference esbuild's host-only __name helper.
    const helpers = {
      scalars(data: Record<string, unknown> | undefined) {
        return data ? Object.fromEntries(Object.entries(data).filter(([, v]) =>
          v === null || ['string', 'number', 'boolean'].includes(typeof v))) : null;
      },
      character(pers: Entity | undefined) {
        return pers ? { x: pers.sprite?.x ?? null, y: pers.sprite?.y ?? null,
          isDead: pers.isDead === true, dead: pers.dead === true, data: this.scalars(pers.data) } : null;
      },
    };
    return {
      dateNowMs: Date.now(), performanceNowMs: performance.now(), current,
      ready: !!(level?.levelStarted && level?.ui?.clock?.startTime != null &&
        game?.physics?.box2d && !game.physics.box2d.paused && !game.paused),
      fatalDeath: !!(level?.pers1?.isDead || level?.pers2?.isDead || level?.pers1?.dead || level?.pers2?.dead || terminal?.success === false),
      terminal: terminal ? { success: terminal.success === true, data: helpers.scalars(terminal.data), state: helpers.scalars(terminal.state) } : null,
      pers1: helpers.character(level?.pers1), pers2: helpers.character(level?.pers2),
      levelState: helpers.scalars(level?.levelState),
      objects: Array.isArray(level?.objects) ? level.objects.map((object, index) => ({
        index, type: object.constructor?.name, x: object.sprite?.x ?? object.x ?? null,
        y: object.sprite?.y ?? object.y ?? null, state: object.state ?? null,
        data: helpers.scalars(object.data),
      })) : [],
    };
  });
}
