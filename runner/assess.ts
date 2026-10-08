import { resolve } from 'node:path';
import { applyAssessmentReview, runAssessment } from './assessment.js';

const usage = `Usage:
  npm run assess -- <file-or-directory> [--profile <json>] [--out <artifact-root>] [--compare-clocks]
  npm run assess -- <file-or-directory> --review <review.json> --run <run-directory>

Exit codes: 0 all assertions PASS; 1 complete behavioral FAIL; 2 incomplete (pending review or NOT_REACHED); 3 evaluator/configuration/infrastructure error.
Normal assessment uses real time. --compare-clocks captures both real and controlled calibration; it never authorizes controlled time as candidate proof.
Review writes unique report-reviewed-*.json/html and review-*.json; original report.json and capture artifacts remain unchanged.`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(usage); return; }
  let candidate: string | undefined, profile: string | undefined, out: string | undefined, review: string | undefined, run: string | undefined;
  let compareClocks = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--compare-clocks') { if (compareClocks) throw new Error('Duplicate --compare-clocks.'); compareClocks = true; }
    else if (['--profile', '--out', '--review', '--run'].includes(arg)) {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path.`);
      if (arg === '--profile') { if (profile) throw new Error('Duplicate --profile.'); profile = value; }
      if (arg === '--out') { if (out) throw new Error('Duplicate --out.'); out = value; }
      if (arg === '--review') { if (review) throw new Error('Duplicate --review.'); review = value; }
      if (arg === '--run') { if (run) throw new Error('Duplicate --run.'); run = value; }
    } else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}.`);
    else { if (candidate) throw new Error('Only one candidate path is accepted.'); candidate = arg; }
  }
  if (!candidate) throw new Error(`Candidate path is required.\n${usage}`);
  if (Boolean(review) !== Boolean(run)) throw new Error('--review and --run must be supplied together.');
  if (review && (profile || out || compareClocks)) throw new Error('Review application cannot be mixed with capture options.');
  const result = review && run ? await applyAssessmentReview(resolve(candidate), resolve(run), resolve(review)) : await runAssessment({ candidate: resolve(candidate), profile, out, compareClocks });
  console.log(JSON.stringify({ runId: result.runId, runDirectory: result.runDirectory, aggregate: result.aggregate, exitCode: result.exitCode,
    assertions: result.assertions.map(({ id, clock, status, reason }) => ({ id, clock, status, reason })), errors: result.errors,
    reviewArtifacts: result.reviewArtifacts, comparisonStatus: result.comparison?.reviewedStatus ?? result.comparison?.status }, null, 2));
  process.exitCode = result.exitCode;
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 3;
});
