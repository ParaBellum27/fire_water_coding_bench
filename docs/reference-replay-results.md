# Reference replay results — 5 October 2026

These are retained reference-run observations, not model recreation results or a completed five-run reliability study.

| Suite | Observed completed attempts | Suite ending |
| --- | --- | --- |
| Final walkthrough, with grounded central-diamond approach | Four PASS completions, each collecting all 16 diamonds | Fifth attempt canceled by the user |
| Older walkthrough | Four PASS completions, each collecting 15 diamonds | Suite timed out |

Do not count cancellation, timeout, route-authoring failures, or superseded attempts as successful repeats. No current five-success suite summary is available. The final trace uses keyboard input, with reference state reads for diagnostics rather than forced success.

## Existing capture evidence

The main retained run is `artifacts/reference-runs/2026-10-05T05-28-04-469Z-verify-M2swXV/run-01/`. Its `frames/` directory contains 486 unmodified PNG screenshots spanning 48.54 seconds of simulated gameplay. Timing, actual input transitions, diagnostics, manifests, and review-player files accompany the frames. Preserve the original screenshot filenames and data.

Existing `review.mp4` videos are assembled from controlled-time screenshot captures; no native wall-clock video capture has been completed. Controlled-clock replay has been exercised with the pinned reference, not established as portable or equivalent to real-time candidate execution.

All existing raw screenshot/video artifacts are local in Git-ignored `artifacts/` and are published intact as release asset `gameplay-evidence-2026-10-05.tar.gz` on release `gameplay-evidence-2026-10-05`. See [the README](../README.md#retrieve-existing-evidence) for download and extraction instructions. Upstream game source/assets are not included; `npm run setup:reference` fetches the pinned reference separately for trusted preparation only.

## Desktop repository migration verification

The migrated checkout passed `npm run check`. Reference setup was exercised against a fresh temporary target, then against that existing target and the checkout's default target; matching installations were verified without replacement. The freshly fetched reference rendered Level 2 and responded to Watergirl's D-key movement.

A separate full replay from the Desktop checkout's default reference completed successfully, collecting 16/16 diamonds over 48,540 ms of simulated gameplay, with no cleanup errors. Its retained evidence is under `artifacts/migration-smoke/2026-10-05T06-10-55-706Z-replay-KTrQZU/run-01/`. This is a migration smoke run, not a replacement summary for the canceled five-run suite.

## Experiment boundary

The current user intent is screenshot-first model recreation. The earlier specification-driven benchmark plans remain historical background. These reference results do not establish a validated grader or a five-success replay gate. The separate first Gemini screenshot-based recreation pilot and its progression failures are documented in [the README](../README.md#screenshot-based-gemini-pilot).
