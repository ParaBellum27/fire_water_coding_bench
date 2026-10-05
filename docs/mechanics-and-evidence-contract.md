> Historical authoring contract for the specification-driven benchmark design. It remains background, not a released contract for the current screenshot-first experiment. Its outstanding five-repeat gate has not been satisfied: current reference evidence records four final-trace completions and a canceled fifth attempt. See [the README](../README.md) and [replay results](reference-replay-results.md) for current status.

# Coding benchmark: mechanics and equivalent-evidence contract

Decision recorded 5 October 2026: this is primarily a coding benchmark. Agents implement an explicit behavioral specification; they must not guess required rules from a video. Video and synchronized inputs illustrate the specification and provide executable examples.

Status: authoring contract, not a released candidate package. The required behavior and evidence policy below are explicit. Exact reference measurements and the five-repeat walkthrough gate remain outstanding. No model trial may start until the release checks in section 4 pass. Do not describe unrecorded demonstrations or unmeasured tolerances as available evidence.

## 1. Task boundary

Implement one static browser-playable JavaScript/TypeScript game: Forest Temple Level 2, recognizable by its two hanging platforms above green pools. Both characters use one keyboard and can be controlled simultaneously. Use the published layout, controls, initial state, and behavior definitions; any suitable implementation or physics library in the common environment is permitted.

The public package must contain the written geometry/object-placement specification and annotated screenshots, not require recovery of collision boundaries from decorative pixels. Publish level/world coordinates, screen mapping, collision shapes, spawn points, hazard extents, button-to-mechanism links, diamond locations, and door locations. Author these descriptive data separately; do not distribute the original game implementation or its executable level file to candidates.

In scope: the six behavioral groups below, recognizable layout/characters/objects, and visible feedback for pickup, death, completion, and reset. Collectibles are included in this pilot. Audio, advertising, other levels, original menu artwork, and the original medal/star-ranking presentation are not coding-correctness requirements. Decorative fidelity is assessed separately. The evaluator's timing records, not a candidate-written score, determine replay timing.

## 2. Required mechanics

The table defines the rules to give every candidate. Each ID must link to public evidence and an observable acceptance condition in the frozen package. Local source-derived smoke checks inform authoring but do not replace verification against the selected reference release.

| ID | Required observable behavior | Public demonstration required |
|---|---|---|
| MOV-1 | Fireboy uses ArrowLeft/ArrowRight to move and ArrowUp to jump. Watergirl uses KeyA/KeyD to move and KeyW to jump. Each set controls only its character. Simultaneous and overlapping key holds work; releasing one key does not release the other character's keys. | Each character moving/jumping separately, then both together, with key-down/up annotations. |
| MOV-2 | Gravity, jumping, landing, and solid collisions are simulated. Characters cannot pass through solid floors, walls, or ceilings. Platforms support characters rather than merely being drawn beneath them. Stopping movement does not replay an authored route. | Neutral start, grounded movement, wall contact, jump/landing, and ceiling contact where reachable. |
| HAZ-1 | Red/lava pools are safe for Fireboy and fatal to Watergirl. Blue/water pools are safe for Watergirl and fatal to Fireboy. Green pools are fatal to both. A safe pool is traversable, not an impassable wall. | Safe and fatal contacts for each character/pool pairing, including green. |
| HAZ-2 | Death of either character ends that attempt with visible failure feedback. A dead character cannot continue the route or satisfy completion. Restart remains available. | A fatal contact, failure feedback, and a subsequent fresh attempt. |
| COOP-1 | Pressure plates respond to actual character contact and control their linked mechanisms. They are held controls, not permanent toggles or scripted time triggers. The written package must name each plate, its linked mechanism, and the group's activation truth table. Do not assume a requirement to hold both plates simultaneously. | Each linked mechanism inactive, activated by its plate/group, and released; reveal all group logic in writing. |
| COOP-2 | The central barrier and upper moving platform change collision geometry as they move. An inactive barrier blocks passage; an activated one permits the demonstrated passage. Release returns the associated mechanism toward its resting state according to the reference. An always-open, always-closed, or visual-only mechanism is incorrect. | Passage while activated, blocked passage while inactive, and release/return. |
| LOG-1 | Both hanging platforms respond to the characters' physical placement and movement. Their tilt/rotation, suspension, and supporting contact must follow the published reference behavior. Characters can land on and jump from them. Flat fixed platforms and canned animations independent of contact are incorrect. | Unloaded platform, land near different points, stand, move, jump off, and observe unloading. |
| LOG-2 | Platform motion and character contact remain consistent together: the platform must not visibly tilt while leaving an unrelated invisible flat collision surface. Publish the observed angle/endpoint/support envelopes rather than require a particular physics implementation. | Annotated platform endpoints, character feet/contact, and movement across a tilted surface. |
| PROG-1 | Preserve the level's traversable geometry, route dependencies, mechanisms, hazards, and the two starting positions. The public input trace must be playable, not recognized as a trigger to show a completion animation. With no movement input, the game must not automatically traverse or complete the level. | Initial scene, full route, milestones, and a neutral-input interval. |
| PROG-2 | Include 16 diamonds: eight red for Fireboy and eight blue for Watergirl. Only the matching character collects a diamond; it disappears once collected and cannot be counted twice. Show collectible progress. Collecting every diamond is not a prerequisite for opening both exits/completing the level. | Correct-color pickup, wrong-color non-pickup, revisiting a pickup location, and completion without all diamonds. |
| PROG-3 | Fireboy must reach the Fireboy exit and Watergirl the Watergirl exit. One character reaching an exit, or a character reaching the wrong exit, is not sufficient for team completion. Completion follows the reference's both-exit condition/animation timing, which must be documented before release. | First matching exit alone, wrong-character exit contact, then both matching exits and visible success. |
| RESET-1 | R and the public restart control begin a fresh attempt after progress, failure, or completion. Restore both spawn positions, diamonds/counters, plates, barriers/platforms, hanging-platform state, and terminal state to the documented initial arrangement. Clear stale held inputs and prevent callbacks from the previous attempt mutating the new one. | Restart after progress, after death, after completion, and rapid repeated restarts. |

### Quantitative and boundary behavior: release-blocking measurements

Before candidates receive this specification, replace generic comparisons with published values/ranges and reference evidence. Measure rather than invent:

- Horizontal speed/acceleration/braking, jump height/duration, grounded-jump conditions, held-jump behavior, air control, simultaneous opposite-direction handling, and relevant character-to-character contact behavior.
- Collision boundaries, tolerances, hazard contact boundaries, and death/terminal transition windows.
- Exact plate-to-mechanism mapping, activation truth tables, activation/release delays, movement directions/endpoints/speeds, and obstruction behavior if it will be tested.
- Hanging-platform pivots/anchors, resting positions, observed load response and unloading, rotation direction/range, settling behavior, and character-support tolerance. Do not invent angle limits or an automatic leveling rule.
- Matching-exit activation/deactivation and both-exit completion timing.
- Reset settling interval, initialization/readiness, viewport/scale, and the runner's clock/input protocol.

Every boundary tested privately must have a public written rule. If an unresolved edge is not included in the released specification, it must not be silently tested. Contradictions between the proposed contract and the pinned reference must be resolved before release, not charged to a candidate.

## 3. Equivalent evidence and tool access

### One public release, identical for all agents

Build one versioned public archive and manifest. Give every attempt the same bytes at the same relative paths:

1. The final written mechanics/geometry specification, with stable requirement IDs and published acceptance ranges.
2. One successful walkthrough recording, its JSON key-down/up trace, controller source, and timestamp conventions.
3. The same annotated screenshots, keyframes, extracted-frame sequence, and synchronized input annotations.
4. Short demonstrations covering every rule and tested boundary, including negative cases, release, failure, and reset. Show multiple hanging-platform placements, not one still image.
5. The same permitted reusable assets, or the same explicit permission and visual standard for drawn graphics.
6. The same starter source, dependency lockfile/environment image, optional physics libraries, launch/reset contract, and public smoke checks.
7. The same scoring categories, tool permissions, resource limits, submission procedure, and disclosure that hidden actions test the documented rules.

Use a canonical manifest with SHA-256 hashes for every public file. Record its release ID/hash on each attempt. Check each candidate mount against that manifest before the attempt begins. Different evidence is a different experimental condition, not a comparable run.

### Common inspection interface

The main comparison uses the same frame-extraction/inspection commands and timestamped image evidence for all agents. Do not let one agent receive exclusive native-video information while another receives a few selected stills. If native video is evaluated, put it in a separately labelled condition with equivalent access. All agents must have the same capabilities to run their own implementation, send keyboard input, view screenshots, and inspect runtime errors.

Use the same agent harness/tool semantics, browser/runtime versions, filesystem/network permissions, and preinstalled dependencies. If harnesses differ, report a model-plus-agent-system comparison. Exact model IDs/settings and costs are recorded independently of package parity.

### Clarifications, privacy, and judgments

- No candidate-specific hints, private coaching, or hidden-test feedback during construction.
- Resolve substantive ambiguities during development, revise the common package, then freeze a new release. Do not silently change a frozen task between models. Material clarification during final trials invalidates cross-version pooling; preserve the prior results and label the new release separately.
- Keep original source/runtime, this source-informed conversation, reference reset internals, private probe inputs, detector/calibration code, and expected answers outside candidate access. Supply public observations and specifications, not the private reference implementation.
- Candidates can read/run the public controller, but the evaluator uses its own immutable copy after freezing the submission.
- Hidden probes vary input sequences, not the advertised mechanics. Maintain an internal mapping from every assertion to a public requirement ID and supporting public evidence.
- Verify outcomes from evaluator-captured behavior. A candidate-reported state value is not the sole grading authority.

## 4. Release gate and next step

The next implementation step is a minimal trusted reference runner, not model trials or a full automatic grader. Select the canonical pinned reference, establish fresh-context startup/reset and input focus, investigate the clock protocol, and record one complete input-only route. Late-level setup must be reached through gameplay; no teleportation or internal success-state injection.

Release the task to development model attempts only after:

- The same route succeeds in five consecutive fresh-context runs, with all five input/timing logs and recordings retained. Any failed run is retained and diagnosed; do not cherry-pick five successes.
- Required mechanic demonstrations and initial-scene evidence are captured on the selected reference.
- Every table row and tested boundary has a clear written rule, evidence pointer, observable acceptance check, and measured timing/geometric range where applicable.
- Every remaining measurement/contradiction above is resolved for the scored scope.
- The public evidence archive, manifest, tools, and resource limits are complete and identical across development attempts.

Five repeats establish practical replay feasibility, not a statistical guarantee. Final scored model trials additionally require the plan's independent-correct-replica and deliberate-defect grader-validation gates, followed by protocol freeze. No replay, capture, parity check, or grader validation is claimed to have been completed by writing this contract.
