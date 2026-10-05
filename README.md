# Fireboy and Watergirl coding benchmark

Canonical repository: <https://github.com/ParaBellum27/fire_water_coding_bench>. The canonical local checkout is `/Users/Pierre/Desktop/fire_water_coding_bench`; all commands below work from any clone's root without depending on that machine-specific path.

The current experiment is **screenshot-first model recreation**: use captured gameplay images as evidence for a source-blind playable recreation. The existing TypeScript/Playwright runner captures the trusted reference; it is not a candidate implementation or grader. No Gemini test, model integration, or model trial has been implemented or completed, and no Gemini API key is currently available.

The documents in `docs/` preserve earlier specification-driven behavioral-benchmark designs as historical background. They are not a claim that the current screenshot-first experiment has a finished grader or released candidate package.

## Run

Prerequisites: Node.js/npm and Python 3 (used by reference setup); GitHub CLI (`gh`) is needed only for the release-download command. From a fresh clone:

```sh
git clone https://github.com/ParaBellum27/fire_water_coding_bench.git
cd fire_water_coding_bench
npm ci
npm run setup:reference
npx playwright install chromium
npm run check
npm run replay -- --trace traces/walkthrough.json
npm run verify -- --trace traces/walkthrough.json --runs 5
```

`setup:reference` prepares the pinned reference under `reference-game/html5`, validates the original/runtime bundle hashes and exact adapters/provenance, and leaves an already-valid installation untouched. A mismatched existing installation fails rather than being overwritten. An alternative destination is supported with `npm run setup:reference -- --target /absolute/path/to/reference-game/html5`. Upstream game source and assets have no established redistribution license and are **not included in the public repository or evidence release**; setup downloads the pinned upstream version instead. Keep this trusted reference out of a candidate's workspace: candidates must not inspect or copy its source/assets.

For the later Gemini experiment, copy the blank template and set the key locally:

```sh
cp .env.example .env
# Edit .env locally and add: GEMINI_API_KEY=your-key
```

`.env` and other `.env*` files are Git-ignored; only the blank `.env.example` is tracked. Never commit or publish the key. This is the intended local credential location, not an implemented Gemini invocation or a claim that the runner loads it.

Verification requests five separate browser launches/contexts, stops at the first failure, and retains every attempted run. No existing evidence is overwritten. The default reference location is checkout-relative `reference-game/html5`; an identical relocated reference can be selected with `--reference-root /absolute/path/to/reference-game/html5`, and output with `--out artifacts/reference-runs`.

The runner checks the original and runtime bundle hashes and reconstructs the runtime bundle from the exact declared patches in `local-provenance.json`. Each manifest also records a SHA-256 inventory of the full reference directory, startup adapter, entry HTML, trace, dependency versions, and Chromium version. The copied game is trusted preparation material; do not supply its source or private observations to coding-benchmark candidates.

## What the walkthrough does

`traces/walkthrough.json` uses ordinary key-down/key-up events only:

- Fireboy: left/right arrows and up to jump.
- Watergirl: A/D and W to jump.
- Both characters cross their elemental chambers.
- Each holds a pressure plate while the other crosses the lower barrier.
- Both jump via the two physically moving hanging platforms above green pools.
- Watergirl makes a grounded approach to the central blue diamond.
- One holds the final bridge plate while the other crosses; then they exchange roles.
- Each enters the matching exit; the trace waits for the original victory and reward presentation.

Every segment specifies the **complete held-key set**, not a new key press. Consecutive segments can keep a key down; omitted keys are released. An empty set releases every key. No character teleportation, injected velocities, altered physics, or forced success is used. Reference state reads are diagnostic only. Success requires the upstream `endGame.levelState.success` result, no fatal death, no page errors, and a finalized MP4.

## Retrieve existing evidence

All existing raw screenshot/video artifacts remain local under Git-ignored `artifacts/`, not Git blobs. They are published intact as `gameplay-evidence-2026-10-05.tar.gz` in the GitHub release `gameplay-evidence-2026-10-05`. From the checkout root, retrieve and extract them with GitHub CLI:

```sh
gh release download gameplay-evidence-2026-10-05 \
  --repo ParaBellum27/fire_water_coding_bench \
  --pattern 'gameplay-evidence-2026-10-05.tar.gz*'
shasum -a 256 -c gameplay-evidence-2026-10-05.tar.gz.sha256
tar -xzf gameplay-evidence-2026-10-05.tar.gz
```

The archive restores `artifacts/` into the checkout root. The main existing screenshot sequence is `artifacts/reference-runs/2026-10-05T05-28-04-469Z-verify-M2swXV/run-01/frames/`: **486 PNG screenshots covering 48.54 seconds of simulated gameplay**. Existing `review.mp4` files are assembled from these controlled-time captures, not native wall-clock video. Preserve screenshot names and accompanying timing/input data.

## Recording

Each attempt is under a unique directory in `artifacts/reference-runs/`:

| File | Meaning |
| --- | --- |
| `summary.html`, `summary.json` | Suite-level verdict and artifact links |
| `run-XX/review.html` | Browser video player with input captions |
| `review.mp4` | H.264, 1280×960, 10 fps review video; no audio |
| `review.vtt` | Held keys, requested simulation time, and route labels |
| `frames/*.png` | Unmodified viewport screenshots at 100 ms intervals |
| `timeline.json` | Frame-to-replay-time mapping and browser clocks before/after screenshots |
| `inputs.json` | Actual down/up transitions and browser timestamps |
| `observations.json` | Reference startup/progression/terminal diagnostics |
| `events.json` | Browser errors, console messages, blocked external requests |
| `trace.json` | Exact trace used for this attempt |
| `manifest.json` | Identity, environment, timing, verdict, and errors |
| `initial.png`, `final.png` | Initial and final rendered surfaces |

Open the MP4 directly for a quick review. For the captioned player, serve this workspace locally so browsers can load the VTT track:

```sh
python3 -m http.server 18868 --bind 127.0.0.1
```

Visit the printed suite path under `http://127.0.0.1:18868/`, open `summary.html`, and choose a run's `player` link. Captions can be enabled through the video's controls.

The MP4 is assembled from captured frames, not a wall-clock screen recording. This avoids encoding filesystem/network/browser overhead as gameplay stalls. Exact inputs remain in JSON; captions show the held set at each 10 fps sample. The final screenshot separately covers a trace endpoint that may fall between video samples.

## Timing and reset

The Playwright clock is installed and paused **before navigation**, at a fixed epoch. Loading advances in increments of at most 16 ms until the upstream level reports ready. Gameplay then advances in increments of at most 16 ms, split at segment and 100 ms capture boundaries. The clock stays paused during key transitions, observation, and screenshot acquisition. Ordinary game timers and animation callbacks still execute when time advances.

Startup time is recorded separately and excluded from walkthrough time. A fresh browser/context and empty storage provide reset; there is no late teleport/reset shortcut. The reference is served on an ephemeral loopback port; off-origin browser requests, WebSockets, and service workers are blocked. This is a trusted local runner boundary, not a sandbox suitable for untrusted submitted game code.

## Status and limits

The final walkthrough suite recorded **four successful completions with all 16 diamonds**; the fifth attempt was canceled by the user. The older suite timed out after four successful completions with 15 diamonds. Neither suite establishes five successful fresh starts. See [the factual replay results note](docs/reference-replay-results.md) for retained evidence and limits.

Controlled clock stepping has been exercised with this pinned reference, not proven portable across other games, browser versions, real-time playback, or independently implemented candidates. Ten-frame-per-second video is a review artifact, not a high-frequency physics measurement. Audio is intentionally not recorded. Five fresh starts are an engineering feasibility check, not a statistical reliability guarantee.

The complete-route replay does not yet validate withheld mechanic probes, grading detectors, a candidate implementation, or equivalent public task packaging. Those remain separate benchmark gates. Route-authoring failures and superseded replay attempts are retained rather than counted as successful trials.
