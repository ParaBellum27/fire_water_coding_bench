# Beyond a Playable Screenshot: Evaluating Functional Game Reconstruction with Evidence and Coverage

**Draft research report — 6 October 2026**  
**Status:** single-task, single-attempt development pilot; not a validated benchmark release or model leaderboard.

## Abstract

A browser game can look plausible while failing to support its characters, maintain independent controls, enforce cooperative mechanisms, or recover from death. We study whether a coding evaluation can distinguish rendered resemblance from functional reconstruction using one level of Fireboy and Watergirl: Forest Temple. Three serving configurations received identical text evidence, requirements, a public keyboard walkthrough and a frozen weighted rubric. Each made one generation attempt with temperature 1 and a native 16,384-output-token cap; submitted programs were not repaired. Gemini `gemini-3.8-flash` returned truncated invalid JSON; Cerebras `gpt-oss-120b` returned valid HTML but crashed at startup; OpenRouter `openai/gpt-oss-120b`, served by Mancer 2, rendered the level but exhibited support, reset and mechanism-activation failures. Verified scores were 0, 1.2 and 30.22 out of 100, with weighted assessment coverage of 1.2%, 4.2% and 43.72%, respectively. A contradiction in the shared pool metadata made one placement criterion unscorable. These findings demonstrate useful diagnostic distinctions, not a reliable ranking of model capability. We specify the evidence an excellent benchmark would need: a consistent public contract, a fully assessed independent working control, calibrated defect detection, validated execution conditions, reachability-aware scoring, repeated multi-task trials and reproducible release artifacts.

## 1. Research question and contribution

**Research question:** can a behavior-oriented evaluation distinguish an actually playable cooperative game reconstruction from a program that merely renders its objects and responds to a few keys?

This requires separating at least four outcomes:

1. **Submission validity:** did the provider return the required complete artifact?
2. **Runtime viability:** does that artifact initialize and render a playable scene?
3. **Mechanic correctness:** do actual input and contact produce the documented state transitions?
4. **Assessment coverage:** which mechanics were genuinely encountered and adjudicated?

This report contributes a frozen pilot protocol, inspectable failure evidence, a coverage-aware scoring account and a release-quality checklist. It does **not** contribute a general autonomous visual grader, an established model ranking, a fully correct generated game, or evidence of task-distribution generalization.

An excellent benchmark should make its own mistakes visible as well as candidate mistakes. The shared authoring error reported here is therefore part of the analysis, not a result to hide or silently repair.

## 2. Task and experimental boundary

The target is one Forest Temple level with two independently controlled characters, multi-tier terrain, elemental hazards, 16 diamonds, four pressure plates, linked cooperative mechanisms, two suspended platforms and matching exits. Candidates must produce a standalone HTML document with inline CSS and JavaScript in exactly one JSON field, `html`. External dependencies, network calls and code retrieval are prohibited by the task contract.

The comparison is **text-conditioned reconstruction**, not screenshot-conditioned reconstruction. All three configurations received the same textual geometry and schema-derived facts; Gemini received no extra images. The authoring process was informed by the pinned reference's level data and observed play. Candidate reconstruction was source-blind with respect to the original executable implementation; the evidence itself was not authored without reference-source knowledge.

The target is qualitative functional fidelity, not exact upstream physics constants, pixel-identical artwork, sound, menus or all levels. Hidden checks may exercise only the documented rules. The public walkthrough is evidence and an assessment route, not a requirement that candidates recognize its key sequence or exactly match every original millisecond.

Earlier screenshot pilots, small cooperative-gate smoke tests and the preceding Gemini development pilot are separate conditions. They are not additional samples in this comparison.

**Frozen sources:** [public package](../task-public/full-level-comparison-v1/), [protocol](../task-public/full-level-comparison-v1/protocol.json), [rubric](../task-public/full-level-comparison-v1/rubric.json), [freeze record](../results/full-level-comparison-v1/freeze.json).

## 3. Method

### 3.1 Configurations and generation

The configurations were Gemini `gemini-3.8-flash` through Google's endpoint, Cerebras `gpt-oss-120b` through Cerebras, and `openai/gpt-oss-120b` through OpenRouter. Returned model identifiers matched the requested identifiers. OpenRouter reported **Mancer 2** as its serving provider. Cerebras and OpenRouter therefore represent two serving configurations of the same reported GPT-OSS model, not two independent model families. Reported identifiers do not establish identical deployed weights, precision or inference implementation.

The frozen generation policy specified temperature 1, a native maximum output-token count of 16,384, a 600-second request timeout, one non-streaming request per configuration, zero repairs and zero generation retries. The five public files were included in identical user payload bytes; provider-specific structured-output transport differed.

Equal native token caps do not imply equal usable code budgets. Tokenizers and reasoning defaults differ, and reasoning can consume different portions of the reported allowance. No common unsupported thinking/effort parameter was injected. This is a controlled comparison of the recorded API configurations, not an isolation of model architecture from serving and budget effects.

Generation time measures the recorded request duration, not browser grading time or end-to-end developer productivity. Cost is the provider-reported value when available; missing prices are not treated as zero or estimated from a price sheet.

Native usage fields further illustrate why token counts must retain provider semantics:

| Configuration | Reported prompt tokens | Reported output field | Reported reasoning field | Reported total tokens |
| --- | ---: | --- | --- | ---: |
| Gemini | 12,542 | `candidatesTokenCount`: 642 | `thoughtsTokenCount`: 15,728 | 28,912 |
| Cerebras | 10,140 | `completion_tokens`: 8,025 | Nested `reasoning_tokens`: 985 | 18,165 |
| OpenRouter | 10,021 | `completion_tokens`: 7,362 | Nested `reasoning_tokens`: 2,136 | 17,383 |

The nested reasoning counts are completion details, not additional tokens to add to Cerebras/OpenRouter totals. Gemini's reported 642 candidate-output tokens and 15,728 thought tokens explain the practical delivery-budget concern without showing that a different budget would have produced a correct game.

### 3.2 Browser assessment and evidence

Assessments ran serially in the frozen Gemini–Cerebras–OpenRouter order. Each runnable scenario began in a fresh browser context at 1280×960 with device scale factor 1 and a nominal one-second startup settling interval. The disclosed hidden-assessment file defines 19 scenarios. Public and route-prefix scenarios use controlled browser time; controls, jumping, held-input reset and a 60-second neutral interval also use native real-time captures.

Input consists of ordinary key-down/key-up events and visible Restart clicks. Candidate assessment does not teleport characters, inject velocities, write game state, force success, or use candidate globals as the authority for behavioral verdicts. Decisions are bound to saved screenshots, rendered feedback and timestamped actions. Case-specific offline pixel measurements corroborate some actor observations; they are not a general-purpose visual recognizer.

Invalid JSON prevents a lawful runnable submission under the no-repair policy. Gemini's scheduled gameplay encounters therefore remain blocked, rather than being exercised on an extracted or completed replacement. The absence of that gameplay evidence is not 19 independently demonstrated gameplay defects.

Behavioral scoring used assistant-led visual adjudication, including delegated reviewer agents and case-specific pixel corroboration. The records' term “manual review” denotes evidence-by-evidence adjudication, not independent human expert annotation. This paper was also drafted with AI assistance. Neither process is a validated autonomous grader, and the pilot does not report an inter-rater reliability study or a formal review-blinding experiment.

### 3.3 Calibration and its limits

Before this comparison, the new capture driver completed the public route on the upstream reference. The saved final reward panel shows exit and diamond completion indicators; the time target was missed. This establishes that the public route was executable on that reference under that driver, not that every hidden criterion had a validated working-control encounter.

Separate prior calibration exercised 57 compact known-working and deliberately broken fixture scenarios concerning hanging surfaces, hazards, exits and reset. Those fixtures are not independent full-level replicas. Their successful checks cannot be transferred into a claim that the full-level candidate assessment has 100% coverage or known population-level false-positive/false-negative rates.

Historical reference records retain four successful completions of the final trace and a canceled fifth attempt. Additional smoke/calibration completions are separate observations, not a retroactively completed five-success reliability suite. Earlier baseline clock-comparison evidence also records divergence; controlled and native execution must not be assumed universally equivalent.

**Evidence:** [current calibration review](../results/full-level-comparison-v1/calibration-review.json), [historical replay results](reference-replay-results.md), and the README's [assessment validation](../README.md#minimal-submission-assessment).

## 4. Scoring: verified evidence is not inferred correctness

The rubric contains 75 criterion decisions across 11 categories. Each category has 100 local points; its overall weight determines its contribution to the 100-point aggregate.

Let category weights be $a_g$, with $\sum_g a_g=100$, and local criterion weights be $w_{gi}$, with $\sum_i w_{gi}=100$. Define:

$$S_g=\sum_i w_{gi}\mathbf{1}[d_{gi}=\mathrm{PASS}],\qquad C_g=\sum_i w_{gi}\mathbf{1}[d_{gi}\in\{\mathrm{PASS},\mathrm{FAIL}\}].$$

$$S=\sum_g\frac{a_g S_g}{100},\qquad C=\sum_g\frac{a_g C_g}{100}.$$

`PASS` requires observed evidence for the criterion. `FAIL` requires an observed contradiction. `NOT_REACHED`, `AWAITING_REVIEW` and `EVALUATOR_ERROR` earn no verified credit and remain outside assessed coverage. An early failure may block downstream encounters without demonstrating that those downstream mechanics are separately wrong.

Full success requires 100 verified points, 100% coverage and no evaluator errors. Any observed candidate requirement contradiction yields a failure verdict with the remaining unknowns disclosed. API/generation failures and runtime failures remain distinct diagnostic causes.

The report's interval $[S,S+100-C]$ is an **arithmetic envelope for unassessed rubric weight**, not a confidence interval or an estimated probability of correctness. The metadata contradiction further prevents interpreting the upper endpoint as attainable against a fully well-defined contract. We do not normalize scores to assessed coverage: doing so could reward a candidate whose early failure prevents harder checks.

## 5. Results

### 5.1 Overall outcome

| Configuration / serving provider | Verified score /100 | Weighted coverage | Observed FAIL weight | Unassessed weight | Full success | Generation seconds | Reported cost |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Gemini `gemini-3.8-flash` / Google | 0.00 | 1.20% | 1.20 | 98.80 | No | 117.71 | Unavailable |
| Cerebras `gpt-oss-120b` / Cerebras | 1.20 | 4.20% | 3.00 | 95.80 | No | 4.06 | Unavailable |
| OpenRouter `openai/gpt-oss-120b` / Mancer 2 | 30.22 | 43.72% | 13.50 | 56.28 | No | 221.97 | $0.00229 |

Observed FAIL weight is $C-S$; unassessed weight is $100-C$. Consequently, OpenRouter's 30.22 score is **not** evidence that 69.78% of the implementation was proven wrong: 13.50 points were observed failures and 56.28 points remained unassessed.

### 5.2 Category results

Cells report **verified score / assessed coverage**, each out of 100 within its category. The weight column is the category's share of the overall score.

| Category | Overall weight | Gemini | Cerebras | OpenRouter |
| --- | ---: | ---: | ---: | ---: |
| Boot and interface | 6% | 0 / 20 | 20 / 70 | 57 / 92 |
| Layout | 12% | 0 / 0 | 0 / 0 | 75 / 75 |
| Controls | 10% | 0 / 0 | 0 / 0 | 55 / 55 |
| Physics | 12% | 0 / 0 | 0 / 0 | 25 / 75 |
| Hazards | 12% | 0 / 0 | 0 / 0 | 45 / 60 |
| Diamonds | 8% | 0 / 0 | 0 / 0 | 20 / 20 |
| Pressure plates | 12% | 0 / 0 | 0 / 0 | 0 / 10 |
| Hanging platforms | 12% | 0 / 0 | 0 / 0 | 0 / 0 |
| Exits | 8% | 0 / 0 | 0 / 0 | 0 / 0 |
| Reset | 6% | 0 / 0 | 0 / 0 | 5 / 45 |
| No automatic playback | 2% | 0 / 0 | 0 / 0 | 100 / 100 |

Zero score with zero coverage means no adjudicated encounter, not a proven failure. The 100 no-playback score is limited to the exercised neutral interval and does not certify the absence of hidden route recognition or delayed scripting.

### 5.3 Submission and runtime failure taxonomy

**Gemini — artifact failure.** The response hit `MAX_TOKENS` and failed the required single-field JSON contract. Its raw response remains preserved. Parsing partial HTML or finishing its code would be a repair, so no such intervention was performed. This result tests delivery under the specified API budget; it does not isolate gameplay coding ability after a valid artifact exists.

**Cerebras — startup failure.** The returned artifact satisfied the standalone-output contract, earning 1.2 overall points. Native browser execution crashed with an undefined `startsWith` exception before the scene rendered. Fifteen controlled-capture callback exceptions were attributed to the same native-confirmed candidate startup problem rather than reported as 15 evaluator infrastructure failures or 15 independent game defects.

**OpenRouter — playable start with behavioral failures.** The program rendered the level and exhibited independent movement and simultaneous jumping. However, Fireboy fell through matching-red-pool backing and disappeared; post-death restart did not fully restore the playable characters; reset handling failed held-input expectations; a mechanism activated without required plate contact; and adaptive viewport/interface requirements failed. Matching-color immunity alone is insufficient if safe traversal loses floor support.

Most diamond interaction requirements, complete plate logic/returned blocking, upper cooperative encounters, suspended-platform gameplay, exits and victory reset remained unverified. The evidence does not show that an alternative route or a more adaptive legitimate controller could never reach them.

The comparison retained **1,432 candidate screenshots**: 168 for Cerebras and 1,264 for OpenRouter; Gemini has no lawful runnable submission. Native videos accompany the real-time scenarios. Large frame counts are an audit resource, not 1,432 statistically independent trials.

**Exact decisions and metadata:** [comparison.json](../results/full-level-comparison-v1/comparison.json); [Gemini generation](../results/full-level-comparison-v1/gemini/generation.json); [Cerebras generation](../results/full-level-comparison-v1/cerebras/generation.json); [OpenRouter generation](../results/full-level-comparison-v1/openrouter/generation.json). Consult the published result directory for acquisition of the original screenshot/video report.

## 6. A failure of the benchmark contract itself

The canonical tile grid places the two green pool runs at x256–544 and x736–960. Duplicate descriptive pool metadata instead places them 160 pixels farther right. Every configuration received the same contradiction. Equal inputs therefore preserved experimental parity but did not make the contract correct.

The affected `LAYOUT/pools` criterion has 15 local layout points, or **1.8 overall points**. It is `EVALUATOR_ERROR` for all configurations. The frozen package and original scores were retained; no candidate was charged with a placement failure based on choosing one conflicting representation. Independent failures on unambiguous lower red/blue backing remain admissible. The other 10 unassessed local layout points concern traversal, not the metadata error.

This error has two consequences. First, the pilot cannot claim a release-quality public specification or complete-success certification. Second, authoring consistency belongs in the benchmark's own acceptance tests: one authoritative geometry representation should generate both grid and object descriptions, with contradictions caught before dispatch. A correction must produce a new version and new trials, not alter this comparison after observing the candidates.

**Record:** [evaluator-issues.json](../results/full-level-comparison-v1/evaluator-issues.json).

## 7. What an excellent benchmark would show

The following are proposed **release gates**, not accomplishments of this pilot.

| Quality dimension | Evidence a strong release should publish | Current pilot status |
| --- | --- | --- |
| Contract validity | One internally consistent versioned specification; every private assertion mapped to a public rule and observable tolerance; ambiguity audit before dispatch | Fails the geometry-consistency gate; other exact physics boundaries are not comprehensively measured |
| End-to-end attainability | An independently implemented working full level achieves every applicable criterion through ordinary play, with no state injection; retained repeated starts, death, victory and restart encounters | Upstream public route succeeds; no fully assessed independent full-level working control |
| Evaluator discrimination | Preregistered mutations for each scored mechanic; working controls pass and intended defects fail without collateral false verdicts; confusion matrices and adjudication uncertainty | Useful compact defect calibration; not a full-level sensitivity/specificity study |
| Clock and environment validity | Pinned browser/runtime and environment; paired native/controlled comparisons on representative implementations and all transition-sensitive checks; measured timing/position tolerances | Mixed-clock evidence and a reference completion; universal equivalence unestablished |
| Reachability and grading coverage | A published prerequisite graph; reproducible bounded adaptive controllers or human-control protocol; explicit reasons for every blocked encounter | Unknowns are preserved, but assessment is dominated by early blockers |
| Reset isolation | Demonstrated restoration after progress, death and victory, including physically held inputs, moving mechanisms and callbacks from the previous attempt | Some fixture calibration; candidate full-state coverage incomplete |
| Reviewer reliability | Blinded independent annotations on shared evidence, agreement/error statistics and a frozen disagreement policy; automated detectors separately validated | Manual evidence-backed decisions; no reliability study |
| Resistance to shortcuts | Withheld but publicly specified input variations, neutral intervals, changed action ordering and negative contacts; tests against route playback and self-reported false success | Neutral and route-prefix probes exist; bounded anti-playback evidence only |
| Comparable resources | Identical information/tool permissions; transparent token/reasoning semantics; predefined stopping rules; all billable usage and available cost; separate one-shot and iterative conditions | Equal text payload and native caps; effective budgets and provider defaults differ |
| Statistical conclusions | Multiple independent tasks and repeated fresh attempts per configuration; preregistered sampling; task-level uncertainty and failure taxonomy; provider/model effects separated | One task and one generation per configuration; no defensible ranking uncertainty estimate |
| Reproducibility and publication | Immutable task/evaluator/submission identities, raw observations, code, environment, checksums and portable replay instructions; rights-aware evidence distribution | Extensive saved artifacts; reference redistribution and measurement gaps remain explicit |

An excellent result would not merely show a high mean score. It would show that correct implementations can succeed, known wrong implementations are rejected for the right reasons, all important mechanics were assessed, and uncertainty is small enough for the claimed comparison.

### 7.1 Suggested figures and tables for a mature paper

1. **Coverage-aware performance plot:** verified PASS, observed FAIL, setup-blocked and evaluator-error weight separately, with uncertainty across independently sampled tasks/attempts. Do not plot unassessed weight as incorrect behavior.
2. **Prerequisite/encounter graph:** where controls, support, hazards and cooperation block later probes. This reveals whether an alleged mechanic weakness is actually a reachability bottleneck.
3. **Paired transition evidence:** input annotations plus before/contact/release/return frames for barriers, tilted support and reset. Unmodified native video remains available beside any labeled montage.
4. **Calibration confusion matrix:** known-working controls versus targeted defect families, with accidental/collateral detections and review disagreement counted rather than discarded.
5. **Budget–quality frontier:** success, coverage and latency under explicitly matched budgets, with generation and evaluation costs separated; no efficiency claim when price or coverage is missing.
6. **Task and modality breakdown:** text-specified reconstruction, screenshot-conditioned inference and iterative coding-agent conditions reported separately, with no pooled leaderboard across unequal information access.

These displays would support conclusions about functional fidelity, evaluator validity, efficiency and generalization. The current data support only the first display as a descriptive decomposition and selected transition examples; they do not supply the repeated observations needed for the proposed uncertainty plots.

## 8. Threats to validity

**Construct validity.** This task mixes specification following, output formatting, runtime implementation, interface fidelity and long-horizon mechanics. A weighted scalar obscures which construct failed. Output validity and boot viability should remain explicit gates alongside mechanic diagnostics.

**Assessment censoring.** Later encounters depend on early functionality and controller compatibility. The resulting missingness is not random. Neither dropping blocked criteria from the denominator nor calling all of them wrong yields an unbiased mechanic-capability estimate.

**Budget and provider confounding.** Different tokenizer/reasoning defaults and serving implementations remain despite equal requested settings. The speed difference between Cerebras and OpenRouter is observed for these requests; it is not evidence that either route is generally faster or more capable at matched quality.

**Single-task sampling and contamination.** One well-known game level cannot establish broad coding ability, and the pilot does not measure whether a model has seen related game implementations or benchmark material in training. Repeated seeds on this one task would address within-task variation, not replace a diverse held-out task set.

**Execution validity.** Fixed route timing can disadvantage a correct game with different admissible motion. Native observations reduce some risks but do not prove equivalence of all controlled-clock interactions. A future benchmark must publish acceptable behavior envelopes and validate its controller against more than the original runtime.

**Observer validity.** Assistant-led visual judgments and case-specific pixel analyses may be wrong or style-sensitive; shared model biases can affect both drafting and adjudication. Rendered counters and success messages are corroborating UI, not independent proof of a state transition. Independent human/expert review and detector calibration are required before claiming reliable grading accuracy.

**Contract and legal validity.** The pool contradiction is a measured authoring failure. Upstream game source/assets have no established redistribution license in this project; local reference setup is distinct from permission to distribute the game. Publication excludes the upstream runtime/assets and credentials, preserves provenance, and does not claim new rights over the original game or blanket reuse rights for reference screenshots.

## 9. Recommended next experiment

Before another paid full-level comparison:

1. Author a **new** consistent task version; resolve duplicated geometry and every scored behavioral ambiguity. Preserve this pilot unchanged.
2. Complete the assessment on an independently authored, fully playable control through ordinary input. Demonstrate every rule, failure boundary and reset context; retain all attempts rather than rerunning until a success is obtained.
3. Validate native execution and any controlled-time condition, publish acceptance envelopes, and calibrate the final full-level observer against targeted defects. Keep compact mechanics diagnostics separate from end-to-end reconstruction scores.
4. Freeze adaptive controller limits, scenario prerequisites, review procedures, stopping conditions, resource policy and exclusions before evaluating new candidates.
5. Run repeated fresh attempts across a diverse held-out task set. Determine sample counts from a declared precision/power objective; do not infer a justified fixed number from these three observations. Randomize or counterbalance execution order where appropriate and account for task-level clustering.
6. Publish complete outcomes, including invalid output, startup crashes, genuine behavioral failures, evaluator errors and unreached encounters. Report model-family and serving-route comparisons separately. Add iterative tool-enabled coding as a separately budgeted condition if that is the desired capability.

The immediate aim is not to make all models fail more dramatically. It is to make successes attainable, failures attributable and comparisons interpretable.

## 10. Reproducibility and artifact statement

The committed source tree includes the generation/capture/reporting code, frozen public package, assessment fixtures, compact results and this paper. Large raw observations are published separately as checksummed GitHub release assets. Extraction restores their original `artifacts/` paths; the original report links to screenshot, video and action evidence there. The [result directory](../results/full-level-comparison-v1/) documents acquisition and the distinction between original artifacts and the portable publication view.

The comparison identity is `2026-10-06T06-46-15-297Z`; public freeze time is `2026-10-06T06:52:28.427Z`. The public manifest SHA-256 is `e2c6653954697f223e29a9c33926d936f27d2d24a9c94a7949f26123fe03a931`; hidden assessment SHA-256 is `b8706b0c87a2d563cf2483822f1117eac356687fa5923eef6ce46038657a892b`. The freeze record also identifies the generation and capture runner bytes used for the trial. Post-observation review/report publication is not represented as pre-generation freezing.

API credentials, local dependency installs, upstream executable source and original assets are excluded. No extra generation, candidate repair or gameplay result was produced while drafting this report. Historical pilot evidence remains labeled separately even when distributed in the same archive.

## 11. Related work

[SWE-bench](https://arxiv.org/abs/2310.06770) evaluates issue-resolution edits against executable repository tasks rather than treating generated text as sufficient evidence of a software fix. [WebArena](https://arxiv.org/abs/2307.13854) emphasizes functional task completion in reproducible web environments. [OSWorld](https://arxiv.org/abs/2404.07972) supplies real-computer task setups and execution-based evaluation scripts. These works motivate the importance of executable outcomes and explicit environments; none validates this pilot's observer, controls or scoring policy. Unlike those benchmarks' task collections, the present study has one reconstruction task and cannot support a comparable general capability claim.

### References

1. Carlos E. Jimenez et al. **SWE-bench: Can Language Models Resolve Real-World GitHub Issues?** arXiv:2310.06770, 2023. <https://arxiv.org/abs/2310.06770>.
2. Shuyan Zhou et al. **WebArena: A Realistic Web Environment for Building Autonomous Agents.** arXiv:2307.13854, 2023. <https://arxiv.org/abs/2307.13854>.
3. Tianbao Xie et al. **OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments.** arXiv:2404.07972, 2024. <https://arxiv.org/abs/2404.07972>.

## Conclusion

The pilot distinguishes invalid delivery, startup failure and failures of a rendered interactive implementation. Its strongest result is an auditable diagnostic account, not a model ranking: OpenRouter has more verified behavior in this attempt, while most of its mechanic weight remains unassessed. The common specification error and incomplete working-control coverage prevent benchmark certification. A release-quality benchmark must first demonstrate its own correctness and discrimination, then measure repeated candidate behavior under clearly comparable conditions.
