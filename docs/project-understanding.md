# Project understanding and historical status

Context recorded 5 October 2026 from the user's two supplied benchmark documents, the existing Coding Eval project notes, and the work in this conversation. This is an interpretation/status note, not a validated benchmark result. The supplied overview and full protocol are preserved separately as `benchmark-overview.md` and `benchmark-plan.md`.

> Historical interpretation of the earlier specification-driven benchmark, preserved without rewriting its experimental design. The user's current intent is screenshot-first model recreation; sections below (including “next implementation gate”) describe the earlier planning stage, not current implementation status. The trusted runner now has controlled-time captures: four final-trace successes with all 16 diamonds, then user cancellation of the fifth attempt; an older suite timed out after four 15-diamond successes. See [the README](../README.md) and [replay results](reference-replay-results.md). No Gemini integration/key, model trial, native video capture, or validated grader is available.

## 1. Why the game remake was requested

In the context now supplied, recreating Fireboy and Watergirl is a concrete pilot for a coding-agent evaluation project, not merely an end-user entertainment app. The level supplies an executable target: observable rules, interacting mechanics, a route through those mechanics, and outcomes that can be inspected under externally supplied inputs.

The request makes the problem tangible: isolate the intended level, establish a usable local environment, learn the implementation and automation difficulties, and work toward a task on which different agents can be compared. The distinctive two hanging platforms over green pools identify the intended Forest Temple Level 2 more reliably than its number alone.

The earlier request explicitly permitted using the GitHub source. That permission was appropriate for obtaining a local game/testbed. It is NOT the experimental condition described for scored candidate reconstructions. During scored attempts, candidates must reconstruct from the public evidence rather than retrieve or copy the original implementation.

## 2. What the project aims to measure

Central question: given the same gameplay evidence, synchronized inputs, public walkthrough program, requirements, tools, and budget, can a coding agent independently produce a playable implementation that behaves correctly both on the demonstrated route and under withheld variations?

The intended signal is substantive coding competence: implement an explicit mechanics/geometry specification, integrate state and physics, debug the implementation, and satisfy rules beyond the single public trace. The user clarified that this is a coding benchmark, not primarily a rule-inference task. Videos illustrate fully documented requirements rather than conceal rules candidates must guess. A reduced-specification visual-inference condition would be a separate experiment. This is not principally a screenshot imitation task, an AI game-playing competition, or a test of whether an agent can download a working clone.

The six behavioral groups are movement/solid collisions, elemental hazards/death, pressure-plate and barrier cooperation, hanging-platform dynamics/contact, progression/exit dependencies, and restart/state restoration. Presentation is reported separately; it must not compensate for broken mechanics. Audio is out of scope for the benchmark even though the standalone app preserves it.

The [mechanics and equivalent-evidence contract](mechanics-and-evidence-contract.md) now records the written requirements, unresolved reference measurements, identical hashed public-package policy, common inspection/tool access, clarification rules, and release gates. These are authoring decisions; the evidence package has not yet been captured or verified identical across real attempts.

The aim is to expose meaningful, explainable weaknesses, not manufacture failure through unreliable automation or select only bad model attempts. Examples: flat hanging platforms, an always-open gate, incorrect element immunity, completion with only one character at an exit, or a hardcoded animation independent of input.

The project also pursues a useful cost asymmetry: authoring and validating a task is expensive once, but replaying trusted checks should become cheaper than independently implementing each candidate. That asymmetry remains an objective, not an established result of this pilot.

## 3. Where the app built in this conversation fits

The app is a source-derived standalone adaptation. It reuses original runtime code, assets, and the level map. It replaces the startup/pause/result presentation, removes unrelated levels and service dependencies, adds a native macOS wrapper, and changes deferred gameplay work to Phaser's state-owned timers to prevent stale callbacks after restart.

It is therefore useful as an exploratory local testbed and possible reference-adapter starting point. It is not an independently implemented correct replica, a source-blind model trial, or evidence that an agent inferred the game's mechanics from video.

Nor should this modified app silently become the canonical original. Before selecting it as a benchmark reference, document its patches and establish that the relevant behavior matches the selected pinned release. Keep upstream reference identity and adaptation identity distinct.

Observed during app development:

- The level rendered in Chromium and a native WebKit smoke harness.
- Browser checks exercised movement/jumping, elemental contacts, a pressure-plate gate's activation/release, diamond pickup, completion, pause, and replay/restart.
- Late-level checks temporarily repositioned characters through internal state. They were integration smoke checks, not a legitimate benchmark walkthrough.
- A sleeping display suspended animation-frame callbacks during later verification. Temporary timer-backed frame callbacks were used in the smoke harness and were not shipped in the app. This is a concrete timing risk for the planned runner, not proof of deterministic playback.

Not established by that work:

- One complete input-only route from a fresh start.
- Five successful fresh-start repeats of that route.
- A synchronized public walkthrough recording and complete mechanic demonstrations.
- Measured hanging-platform dynamics, timing variability, or calibrated tolerances.
- An independent correct replica accepted by a validated grader.
- Hidden behavioral checks, mutation/defect rejection, candidate isolation, or model-comparison results.

A separate local reference already exists in the synced project mirror at `reference-game/`. Its documentation identifies GitHub commit `a739ccac37516b047c14f38d4989cf1f55e838ed` and describes startup/ad adaptations with upstream gameplay code preserved. Its recorded validation status still leaves repaired browser gameplay pending. Reading that status is not a new verification of that separate reference. A local adaptation also does not establish that the earlier hosted-site security-check problem was resolved.

## 4. Conditions for a defensible benchmark

### Reference reliability comes first

Before scoring a model, the controller must reliably operate the selected reference. Freeze the release, startup procedure, browser version, viewport/scale, clock protocol, and input representation. Record overlapping key-down/key-up actions. Five clean successful repeats are an initial engineering gate, not a statistical guarantee.

A Playwright wait is not necessarily a physics step. Controlled clocks must be validated on this runtime and applied consistently to candidates. If that is unsuitable, use a pinned real-time protocol with measured variation. Do not change timing independently for each candidate to make a route succeed or fail.

### Preparation, construction, and judgment are separate

The trusted preparation environment can inspect original source and establish expectations. Candidate build environments receive only the public package and permitted tools. The evaluator controls reset, input, capture, assertions, and score writing; candidates cannot edit the authoritative controller or access private scenarios.

Directory naming is not isolation. Mounts, process permissions, network controls, and browser-debugging access must enforce the boundary. This conversation and the source-derived app must not be supplied wholesale as context to a supposedly source-blind candidate attempt.

### Successful playback alone is insufficient

A hardcoded animation could imitate the public route. Withheld inputs must test the same disclosed mechanics under different actions, including neutral input, release, failure, and reset. Expectations must be supported by reference observations; hidden inputs must not become hidden requirements.

Candidate-reported state may aid debugging but cannot be the sole authority for a verdict. Capture rendered evidence and validate observers. Separate a failed setup prerequisite from an independently observed local defect. Browser focus loss, reference failure, or an uncertain detector is an infrastructure/adjudication issue, not automatically a model failure.

### Validate the judge, then compare models

Require a correct independent implementation to pass and deliberately broken variants to fail the appropriate checks. In particular, accepting the original source-derived app would not demonstrate tolerance for reasonable independent implementations.

Run development attempts to calibrate ambiguity, difficulty, and resource limits. Then freeze the protocol and run three fresh attempts per model, retaining every attempt. The current project notes name Luna, Mistral Medium 3.5, and Gemini 3.8 Flash as intended labels; exact available provider/API versions and settings must be recorded before execution. No availability or trial results are implied here.

Report strict behavioral pass/fail, equally weighted component scores, separate visual assessment, costs/time, and attributable failure reasons. One level and nine final trials provide a narrow case study, not a broad ranking of intelligence or general coding ability. Known-game familiarity and agent/tool differences must be disclosed.

## 5. Next implementation gate

The next deliverable is reference replay feasibility, not more app decoration, model-provider integration, or a leaderboard:

1. Select and pin the canonical local reference and document its startup-only adaptations.
2. Establish fresh-context startup/reset and verify the initial rendered scene.
3. Produce a complete input-only walkthrough, with no teleportation or internal-state success shortcuts.
4. Replay the same trace successfully from five fresh starts and retain all results.
5. Capture the walkthrough plus verified button-release, hanging-platform, hazard/death, and restart demonstrations.
6. Save a manifest of versions, timing, inputs, recordings, milestones, and observed variability.

Only then proceed to the public package, private scenarios, trusted runner, independent replica/defect calibration, and model trials in the protocol's order.

## Preservation and evidence limits

The supplied full protocol was copied from its existing saved version and the copy compared byte-for-byte successfully. The supplied overview was saved separately. Original synced project files and read-only source material were not modified.

Research links and attributed claims are preserved as supplied. This contextualization did not independently revalidate those external papers or treat their existence as evidence that this project's controller or grader works. No new gameplay run, replay validation, or model evaluation was performed for this save-and-analysis request.
