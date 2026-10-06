# Fireboy and Watergirl coding benchmark

Canonical repository: <https://github.com/ParaBellum27/fire_water_coding_bench>. The canonical local checkout is `/Users/Pierre/Desktop/fire_water_coding_bench`; all commands below work from any clone's root without depending on that machine-specific path.

This repository contains **separate screenshot-conditioned recreation pilots and a fresh text-evidence full-Level-2 comparison**. The latest comparison used one unchanged generation from each of Gemini, Cerebras and OpenRouter; none achieved full success. Its [draft benchmark paper](docs/benchmark-paper.md) analyzes verified behavior, unassessed coverage, candidate failures and the shared specification error. These are development-pilot findings, not a validated leaderboard.

The earlier specification-driven plans in `docs/` remain historical background. The [paper's release-quality checklist](docs/benchmark-paper.md#7-what-an-excellent-benchmark-would-show) distinguishes the evidence a strong benchmark should demonstrate from what this project has actually established.

## Minimal submission assessment

From the repository root, assess an unchanged submission directory containing `index.html`, or an individual HTML file:

```sh
npm run assess -- /path/to/submission
```

This uses the existing loopback server and isolated Playwright browser utilities. No model requests, source repairs, candidate globals, state writes, teleports, or forced success. Normal assessment uses **real time**. Each scenario uses a fresh browser context; external requests, WebSockets, and service workers are blocked.

Optional evaluator-supplied DOM selectors permit rendered-box measurements:

```sh
npm run assess -- fixtures/assessment-baseline \
  --profile fixtures/assessment-baseline.profile.json
```

The profile is `{ "version": 1, "fireboy": "#fireboy", "watergirl": "#watergirl", "floor": "#floor", "restart": "#restart", "timer": "#time" }`, with `timer` optional. Selectors must identify the actual visible actors, shared supporting floor, actionable restart button, and elapsed-time display; this is external evaluator configuration, not a candidate grading API. The automatic path assumes a clear rightward starting area on that floor. Canvas games, ambiguous identity/support, unavailable clear-ground trials, and absent or uninterpretable reset timers require manual review or remain unreached. Merely having a canvas or surviving in a blank scene never earns a pass.

### Frozen checks and evidence

Before starting the browser, each run writes and hashes `protocol.json` with all prerequisites, procedures, thresholds, adaptation rules, and host deadlines. Viewport is 1280×960, device scale 1.

| Check | Procedure and observable rule | Host deadline |
|---|---|---|
| `BOOT` | Up to 3s startup observation; two distinct visible actors and visible floor. | 12s |
| `FLOOR_SUPPORT` | Up to 1.2s settling, then 600ms sampled support; bottoms within 2px of floor, drift at most 2px. | 15s |
| `FIREBOY_MOVE`, `WATERGIRL_MOVE` | Independently hold ArrowRight or lowercase `d`; fresh 80/160/320ms trials, earliest displacement at least 4px, other actor drift at most 2px. | 30s each |
| `SIMULTANEOUS_RELEASE` | Both move, release one while retaining the other, then reverse in a fresh context; stopped actor drift at most 2px, retained actor advances at least 4px. | 55s |
| `FIREBOY_JUMP`, `WATERGIRL_JUMP` | Grounded 80ms ArrowUp/`w` tap; sample ascent, apex, descent and landing for at most 3s; rise at least 8px, independent partner, supported landing and 600ms stable idle. | 18s each |
| `RESET_R`, `RESET_BUTTON` | Displace both actors with bounded fresh trials; press `r` or click Restart while movement keys remain held; restore starting boxes, clear held input, observe stable support before and after key release, inspect timer reset. | 35s each |
| `NO_INPUT` | Fresh scene without player input for a full 60s; sample every nominal 5s, capture at startup/30s/60s; require intact supported actors and no drift after settling. | 85s |

Adaptation is bounded to three fresh movement/seed trials: 80, 160, and 320ms. No route search, retries with changed code, or exact upstream input-sequence requirement. Obstructed or unsupported starts are not movement failures: those scenarios remain `NOT_REACHED`. The raw log records input transitions, actual host/browser timestamps, requested waits, box/text observations, and screenshot delays; requested intervals are not presented as exact real-time execution.

Run directories under `artifacts/assessments/` contain the frozen protocol, before/after SHA-256 file manifests, environment and browser versions, raw actions/observations, console/errors/blocked requests, screenshots, JSON/HTML reports, and a review template. Real-time runs without a DOM profile also retain full-viewport WebM recordings under `videos/`, linked in each assertion's evidence and playable in the HTML report. Video capture does not assign a verdict. `--out` selects another artifact root **outside** the served submission directory. Changed submission bytes invalidate the verdict.

Assertion statuses are `PASS`, `FAIL`, `NOT_REACHED`, `AWAITING_REVIEW`, and `EVALUATOR_ERROR`. Failed or unreached prerequisites gate dependent checks; pending prerequisites cannot produce dependent passes. Candidate browser exceptions are failures; infrastructure failures are evaluator errors. Exit codes: **0** all specified checks pass; **1** a known behavioral failure; **2** unresolved review/unreached checks; **3** evaluator/configuration error. A known failure is retained even when other checks are unreached.

### Manual review and clock calibration

Inspect `report.html`, named screenshots/videos, and raw observations; copy `review-template.json` to a review file outside the submission. Correlate video transitions and the visible elapsed timer with logged input timestamps; encoding can omit short transients, so missing or ambiguous transitions remain pending rather than passing. Fill `reviewer`, ISO `reviewedAt`, and explicit pending decisions/reasons; remove unreviewed entries and retain each reviewed assertion's exact evidence filenames. Apply without rerunning or modifying the submission:

```sh
npm run assess -- /path/to/submission \
  --run artifacts/assessments/RUN_DIRECTORY --review /path/to/review.json
```

Reviews bind run ID, submission/protocol hashes, assertion IDs/clocks, and existing evidence. Only pending assertions may be reviewed; automated results and evaluator errors cannot be overwritten. Failed reviewed prerequisites force dependent `NOT_REACHED`. The original capture report stays unchanged; each review creates separately named record and JSON/HTML reports.

```sh
npm run assess -- fixtures/assessment-baseline \
  --profile fixtures/assessment-baseline.profile.json --compare-clocks
```

`--compare-clocks` additionally runs the same checks under a controlled browser clock, preserving paired trajectories and requested/browser/host elapsed times. Frozen comparison tolerances are 4px relative position, 60ms requested elapsed difference, and 120ms actual browser elapsed difference. Host elapsed differences are recorded but not required to match because controlled waits compress host time. Missing correspondence or visual-only claims remain pending review; matching pass labels never establish clock equivalence. Reviewed clock correspondence is recorded separately from gameplay status and does not authorize controlled-clock candidate grading.

### Exercised validation

Local evidence is retained in `artifacts/assessment-validation/` (ignored, not published automatically):

| Case | Observed result |
|---|---|
| Working `fixtures/assessment-baseline` | All ten checks passed in real time and controlled time; submission bytes unchanged. |
| Clock correspondence | **DIVERGED** on reviewed evidence: relative Fireboy `jump-50` displacement differed by 4.591px, exceeding the frozen 4px tolerance; adaptive settling/landing also produced unmatched samples. No clock equivalence claim. |
| Disabled movement | Both movement checks failed; release/reset prerequisites correctly remained unreached. Independent jumps still passed. |
| Disabled jump | Both jump checks failed with zero rise, no descent or landing; unrelated checks passed. |
| Disabled floor | Floor support failed; all dependent checks remained unreached. |
| Disabled reset | Both R and button checks failed; unrelated checks passed. |
| Disabled key release | Simultaneous independent release failed on continued drift. |
| Existing Ministral v2 submission | Raw canvas captures initially awaited review; reviewed blank startup failed `BOOT`, making dependent checks unreached. Submission unchanged; no browser exceptions or external requests observed. |

The working baseline is a small independent DOM physics arena, **not** a Forest Temple recreation: one broad flat floor, visible actors/timer, no pools, gems, mechanisms, exits, camera, or full route. The upstream reference instead uses Phaser/Box2D canvas rendering, asynchronous level startup, and an adapted host shell. It has no compatible DOM actor/floor selectors, so this assessor requires visual review rather than reference globals. Earlier controlled-clock reference completions do not validate real-time correspondence or make it a known-good candidate for these exact ten checks.

Canvas-path calibration uses `fixtures/assessment-canvas`, a canvas-rendered version of the same small physics arena, with no DOM actor/floor profile:

```sh
npm run assess -- fixtures/assessment-canvas
```

Three fresh real-time captures each received **ten evidence-supported manual PASS decisions** after review. Raw captures remained `AWAITING_REVIEW`; recording video never automatically passed an assertion. Saved viewport video showed independent release, grounded jump arcs and landing, both resets clearing formerly held input, visible timer reset, and stable 60-second idle support. Offline fixture-specific pixel measurements corroborated the review; they are not a general-purpose vision grader.

| Canvas defect | Observed reviewed failure |
|---|---|
| Disabled jump | Both jump checks: zero rise versus the working arena's approximately 54px. |
| Disabled independent release | `SIMULTANEOUS_RELEASE`: released actor drifted 18/32/58px in both release directions, exceeding 2px. |
| Disabled reset | Both R and Restart-button checks: displaced actors continued moving and elapsed timer continued increasing. |

All assessed fixture bytes were unchanged; actor/floor observations remained null, so verdicts did not use candidate globals or DOM actor boxes. Defect reviews resolved the intended failures and their prerequisites; unrelated checks left pending are listed explicitly in `artifacts/canvas-validation/summary.json`. Two concurrent defect captures exceeded the existing 35-second button-reset deadline and remain retained as `EVALUATOR_ERROR`, not behavioral results. Serial captures completed with the same fixtures, criteria and deadlines. The summary, raw actions/screenshots/videos and separately bound reviewed reports are local ignored artifacts. Three working repeats establish only smoke-level repeatability, not a statistical reliability estimate.

This validates the listed basic checks and targeted disabled-behavior detection, not layout fidelity, leftward controls, walls/ceilings, elemental rules, pickups, cooperative mechanisms, exit completion, scoring, or comprehensive anti-cheating. A minimal-assessment pass is not a “fully playable Level 2” verdict.


## Current branch: explicit-contract Ministral benchmark

`experiment/ministral-8b-benchmark-v2` freezes an [explicit public correctness contract and 11-check protocol](task-public/ministral-benchmark-v2/) before generation. It retains the exact same three contact-sheet JPEGs, timestamps, `ministral-8b-latest` alias, temperature 1, and 16,384-token output cap as the earlier Ministral attempt. The model received no prior submission, failure report, execution tools, or feedback. This is a qualitative mechanics benchmark, not a pixel/physics calibration or validated automated grader.

One request returned HTTP 200 in **134.298 seconds**, using 5,517 input tokens and 10,490 output tokens. [Browse the exact response, unchanged served HTML, generation settings, all checklist results, input observations, and screenshots](results/ministral-8b-benchmark-v2/). No assistant repairs or second submission were applied.

| Frozen check | Observed result |
|---|---|
| Boot / output format | FAIL: counters and Restart load, but level/characters are invisible; response contains prose and Markdown |
| Layout | FAIL: normal resize reveals an incorrect rectangular level with exits on opposite sides |
| Controls | FAIL: initial right input does not move either character; later floor overlap jumps Watergirl to the far edge |
| Physics | FAIL: both characters fall through the visible bottom floor and offscreen |
| Reset | FAIL: R does nothing; button restores positions but blanks the level again |
| No playback | PASS for the exercised fresh 60-second no-input interval: no traversal or victory |
| Hazards, diamonds, pressure plates, hanging platforms, exits | NOT REACHED through normal play |

Verdict: **FAIL**, no overall percentage. No JavaScript exceptions or external-network attempts were observed. Read-only state diagnostics supplement screenshots; no candidate state was changed or teleported to reach later mechanics. The neutral-input pass does not imply correct physics or exit completion. One stochastic attempt cannot isolate a causal effect of clearer instructions or establish model reliability.

Inspect the unchanged response locally:

```sh
python3 -m http.server 18871 --bind 127.0.0.1 \
  --directory results/ministral-8b-benchmark-v2/submission
```

Open <http://127.0.0.1:18871/>. The initial blank canvas is the actual submitted behavior; resizing can reveal the incorrect level, but does not repair its physics. No recorder, grader framework, dependencies, permanent tests, or repair loop were added.

## Earlier branch: minimal screenshot pilot

`experiment/screenshot-pilot-next` attempted Groq, checked Mistral Medium/Small access, then generated and exercised one Ministral 8B submission. Candidate providers in scope are Mistral, Gemini, and Groq, not OpenAI. Groq hosts the selected Alibaba model `qwen/qwen3.8-27b`.

- [Browse the 80 original screenshots](task-public/groq-screenshot-pilot/screenshots/) and [three contact sheets](task-public/groq-screenshot-pilot/). Sheets resize and label the frames; they are not equivalent to 80 separate image inputs. Groq's documented limit is three images per request.
- One tiny key-check generation returned HTTP 200 and `OK` (19 tokens). The local key variable was named `GROQ_API_Key`; standard scripts expect `GROQ_API_KEY`. No key values are published.
- Two recreation requests were rejected before any code was generated: first HTTP 413 (7,557 requested input tokens versus a 7,000 ITPM allowance), then HTTP 429 (1,291 expected output tokens versus a 1,000 OTPM allowance). The second request shortened wording and timestamp formatting without changing the images or game requirements.
- [Request settings, responses, and short checklist](results/groq-screenshot-pilot/) are committed directly for inspection. Zero submissions, zero code repairs, no gameplay assessment or percentage score. This is an account-limit blocker, not evidence of the model's reconstruction ability.

No new recorder, grader, agent framework, dependencies, or repair loop was added. Future assessment uses launch, controls, progression, hazards, cooperative mechanisms, restart, and completion as pass/fail/not reached; check-ins occur after evidence preparation, generation, and gameplay assessment.

The quick [Mistral limits check](results/mistral-screenshot-pilot/limits-check.json) authenticated model discovery (HTTP 200). The same three contact sheets fit the documented eight-image, 10 MB per-image, and 10,000-pixel dimension limits. Tiny requests to `mistral-medium-latest` and `mistral-small-latest` returned HTTP 429, code 1300, with a zero request allowance; [the updated-key Medium check](results/mistral-screenshot-pilot/updated-key-check.json) had the same outcome. No recreation images were uploaded in those checks. The exact account-side cause is not established; the subsequent Ministral 8B request worked.

### Exercised Ministral 8B attempt

`ministral-8b-latest` passed a tiny generation check, then returned one submission from the existing three contact sheets in 102.769 seconds (4,599 input tokens, 6,925 output tokens). No assistant repairs or model feedback were applied. The response included prose and Markdown fences against the output contract; it was served exactly as returned.

[Browse the response, unchanged HTML, short report, and assessment screenshots](results/ministral-8b-screenshot-pilot/). Actual Chromium exercises found: sparse incorrect layout; lowercase Watergirl controls ignored; absent idle gravity; a jump continuing upward until loss; R not restarting; button resetting positions but not the displayed timer. A fresh start with no input produced ["You Win!" at displayed 48.5 seconds](results/ministral-8b-screenshot-pilot/assessment/10-win-without-playing.png), with both characters unmoved and all five generated gems remaining. This is explicitly prohibited timed victory, not successful level completion.

Verdict: **FAIL**, no valid overall percentage. Hazard encounters, pickups, and cooperative mechanisms were not reached through a normal route. The earlier Gemini run received separate images, whereas this run received lower-detail contact sheets, so these results are not a controlled provider ranking. No new recorder, grader, dependencies, or runner framework was added.

To inspect the unchanged response locally from the repository root:

```sh
python3 -m http.server 18870 --bind 127.0.0.1 \
  --directory results/ministral-8b-screenshot-pilot/submission
```

Open <http://127.0.0.1:18870/>.

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

For the Gemini experiment, create the key file only if it does not already exist, then set the key locally:

```sh
test -f .env || cp .env.example .env
# Edit .env locally and add: GEMINI_API_KEY=your-key
```

`.env` and other `.env*` files are Git-ignored; only the blank `.env.example` is tracked. Never commit or publish the key. `npm run pilot:gemini` loads this local file; the reference replay runner does not use the key.

Verification requests five separate browser launches/contexts, stops at the first failure, and retains every attempted run. No existing evidence is overwritten. The default reference location is checkout-relative `reference-game/html5`; an identical relocated reference can be selected with `--reference-root /absolute/path/to/reference-game/html5`, and output with `--out artifacts/reference-runs`.

The runner checks the original and runtime bundle hashes and reconstructs the runtime bundle from the exact declared patches in `local-provenance.json`. Each manifest also records a SHA-256 inventory of the full reference directory, startup adapter, entry HTML, trace, dependency versions, and Chromium version. The copied game is trusted preparation material; do not supply its source or private observations to coding-benchmark candidates.

## Screenshot-based Gemini pilot

`task-public/screenshot-pilot/` freezes 40 chronological, unmodified screenshots, their timestamps and hashes, and the exact recreation prompt. It contains no original game source, private reference state, input trace, or mechanic annotations.

```sh
npm run check
npm run pilot:gemini
```

Each invocation makes one Gemini 3.8 Flash API request and can incur API charges. The configuration is recorded: temperature 1, maximum 24,000 output tokens, structured JSON containing a complete self-contained HTML game. The script verifies screenshot hashes, stores the exact request and response under a unique `artifacts/model-pilots/` directory, and extracts the generated HTML without repairing it. It does not automatically score the submission.

The first pilot is `artifacts/model-pilots/2026-10-05T06-39-02-231Z-gemini-3.8-flash-oUx1ze/`. Its `submission/index.html` is the unchanged generated game; `assessment/report.json`, `assessment/keyboard-actions.json`, and PNG captures record the exercise. The request used 43,812 input tokens, 18,466 response tokens, and 2,957 thinking tokens; monetary cost was not measured.

Observed result: the game launches, both characters move/jump, exercised gems are collected, and restart works. Fireboy is blocked beneath the first raised trough; jumping around it reaches the right side, but the staircase cannot reach the middle floor. Source diagnosis: a 52-pixel corridor contains a 56-pixel-tall character; the jump rises about 110 pixels while the next relevant ascent requires 148 pixels. Upper cooperative mechanisms and victory were not reached. No assistant code repairs or model feedback iterations were performed.

To inspect the submission locally, serve only its submission directory:

```sh
python3 -m http.server 18869 --bind 127.0.0.1 \
  --directory artifacts/model-pilots/2026-10-05T06-39-02-231Z-gemini-3.8-flash-oUx1ze/submission
```

Open <http://127.0.0.1:18869/>. A screenshot-first coding pilot is not a full comparative benchmark: there is no validated independent grader or model ranking.

The full first-attempt request, response, unchanged HTML, assessment captures, and input package are also published in the [Gemini pilot release](https://github.com/ParaBellum27/fire_water_coding_bench/releases/tag/gemini-screenshot-pilot-2026-10-05). These results must not be supplied as context to later source-blind candidate attempts.

## Full-level development pilot with per-subtask grading

`task-public/full-level-development-v3/` freezes the three existing contact sheets, an explicit mechanics contract, and eleven weighted rubrics totaling 100 points each. Run `npm run pilot:gemini -- --package task-public/full-level-development-v3 --out artifacts/full-level-development/<unique-run>/generation` to generate one JSON-wrapped standalone HTML submission. This incurs one API request; the runner verifies public-package hashes and does not repair returned code or automatically grade gameplay.

The recorded development attempt is `artifacts/full-level-development/2026-10-06T05-19-53-917Z/`. Its `report.html` links criterion decisions, raw screenshots, timestamped input records, continuous scenario videos, and `report.json`. Before candidate scoring, 57 compact canvas-fixture scenarios exercised known-working and targeted broken hanging-platform, hazard, exit, and full-state reset behavior. All four working-fixture groups received 100/100 with full criterion coverage; these are calibration results, not candidate scores or statistical reliability estimates.

One unchanged Gemini 3.8 Flash submission was generated and exercised in five real Chromium contexts, with 160 raw screenshots and no assistant code repairs or hidden candidate-state reads/writes. `npm run check` passed. Verified candidate points/coverage: boot 85/85%, layout 75/90%, controls 80/80%, physics 75/75%, hazards 85/85%, diamonds 25/45%, pressure plates 0/0%, hanging platforms 0/0%, exits 0/0%, reset 40/50%, and no playback 100/100%. Each score is out of 100; coverage is assessed PASS-or-FAIL weight, not an estimate of correctness. Full conjunctive criteria receive no credit when required subparts remain unverified.

Observed failures: the candidate omits the reference's stacked elemental pools and green-pool dry island, redistributes diamonds, and its header Restart button is obstructed after loss. R and the separate Try Again button recover play. Movement/release/jumps, all six elemental pairings, matching pickups, and lower-plate activation/open-barrier crossing were observed. The complete lower-plate truth table and restored physical blocking were not established; upper bridge, suspended-platform gameplay, exits, and post-victory reset were not reached. Caps Lock and pending-callback isolation also remain unverified. Zero verified points for those groups do not prove that their implementations fail. The approximately 100-second neutral recording establishes only bounded no-input behavior. This is a manually reviewed development pilot, not a released autonomous grader or model ranking.

## Fresh three-configuration full-level comparison

`task-public/full-level-comparison-v1/` freezes identical **text-only** reference geometry, requirements, executable public walkthrough, output contract and 75 granular criteria for Gemini `gemini-3.8-flash`, Cerebras `gpt-oss-120b`, and OpenRouter `openai/gpt-oss-120b`. It is a new condition, separate from all earlier smoke tests and the screenshot-based Gemini development pilot. Category weights total 100 overall points. Native output-token cap: 16,384; temperature: 1; generation timeout: 600 seconds; one request per configuration, no candidate repairs, feedback or generation retries.

The saved run is `artifacts/full-level-comparison/2026-10-06T06-46-15-297Z/`. Open `report.html` for the single comparison table, category scores, confirmed defects and remaining unknowns; `comparison.json` preserves the full criterion data. The run archives the exact public package, hashed hidden scenarios, raw responses, returned/serving identities, usage, available cost, generation time, raw screenshots and native real-time videos. Browser assessments were serial. Public/route-prefix scenarios use the calibrated controlled clock; controls, jumping, reset and a 60-second neutral interval also use real time. Gemini's invalid truncated JSON has no runnable HTML without repair, so its 19 scheduled gameplay scenarios remain blocked rather than being replaced with a fabricated page.

Verified overall scores / weighted coverage: Gemini **0/100 / 1.2%**, Cerebras **1.2/100 / 4.2%**, OpenRouter **30.22/100 / 43.72%**. All three fail full success. Gemini hit `MAX_TOKENS`; Cerebras crashed with an undefined `startsWith` startup error; OpenRouter rendered the full map but failed matching-red-pool support, reset restoration/held-input clearing, adaptive viewport layout, and physical-contact-only barrier activation. Unreached upper mechanisms and exits receive no verified credit, not invented failures.

**Shared evaluator authoring error:** the canonical tile grid places green pools at x256–544 and x736–960, but duplicate public pool metadata is shifted 160 pixels right. The frozen package was not repaired after generation. `LAYOUT/pools` is unscored for every configuration, and `evaluator-issues.json` discloses the ambiguity separately from candidate defects. Controlled-clock callback exceptions from Cerebras are attributed to its native-confirmed startup bug, not counted as independent evaluator infrastructure failures. This package is retained as historical pilot evidence, not a clean released benchmark.

Generation entry point: `npx tsx runner/comparison-generate.ts --package <new-frozen-package> --out <new-run-directory>`; `--dry-run` exercises all provider request schemas without network calls. The runner refuses repeated requests in an existing run. Use a separately versioned, corrected package for any future comparison; do not overwrite this frozen trial. `runner/comparison-capture.mjs`, `comparison-gallery.mjs` and `comparison-report.mjs` provide observable-only capture, evidence galleries and validated weighted reporting. This is a single-attempt pilot, not a statistically reliable model ranking; Cerebras and OpenRouter are two serving configurations of the same reported GPT-OSS model.

### Paper and published evidence

Read [Beyond a Playable Screenshot: Evaluating Functional Game Reconstruction with Evidence and Coverage](docs/benchmark-paper.md). The paper includes the experimental method, weighted-score equations, all category scores/coverage, failure taxonomy, threats to validity, primary-source references and concrete gates for an excellent benchmark. Proposed gates and figures are explicitly not represented as measured results.

[Compact comparison records](results/full-level-comparison-v1/) preserve the requests/responses, returned and serving identities, reviews, hashes, task package and acquisition instructions. Large screenshots/videos are distributed as a checksummed [paper/evidence release](https://github.com/ParaBellum27/fire_water_coding_bench/releases/tag/full-level-comparison-paper-2026-10-06), not Git blobs. This complete archive contains **9,779 original artifact files** across the current comparison and all prior local runs; sharing an archive does not pool their experimental conditions.

```sh
gh release download full-level-comparison-paper-2026-10-06 \
  --repo ParaBellum27/fire_water_coding_bench \
  --pattern 'gameplay-evidence-complete-2026-10-06.tar.gz*'
shasum -a 256 -c gameplay-evidence-complete-2026-10-06.tar.gz.sha256
tar -xzf gameplay-evidence-complete-2026-10-06.tar.gz
open artifacts/full-level-comparison/2026-10-06T06-46-15-297Z/report.html
```

The approximately 1.85 GB archive restores the original `artifacts/` paths, reports, input records and raw media. Credentials, `node_modules/` and the upstream reference executable/assets are excluded. Reference imagery remains observational evidence, not a grant of rights to the original game.

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
