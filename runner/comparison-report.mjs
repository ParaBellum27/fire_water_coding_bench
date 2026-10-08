import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
const json = value => JSON.stringify(value, null, 2) + '\n';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = value => Math.round(value * 10000) / 10000;
const hash = value => createHash('sha256').update(value).digest('hex');
const load = async path => JSON.parse(await readFile(path, 'utf8'));

export async function publishComparison({ run, publicPackage }) {
  const rubric = await load(join(publicPackage, 'rubric.json'));
  const protocol = await load(join(publicPackage, 'protocol.json'));
  const manifest = await load(join(publicPackage, 'manifest.json'));
  const freeze = await load(join(run, 'freeze.json'));
  const hidden = await readFile(join(run, 'hidden-assessment.json'));
  if (hash(hidden) !== freeze.hiddenAssessmentSha256) throw new Error('Hidden procedures changed after freeze');
  for (const file of manifest.files) if (hash(await readFile(join(publicPackage, file.file))) !== file.sha256) throw new Error('Public package changed after freeze');
  const results = [];
  for (const model of protocol.models) {
    const dir = join(run, model.id), generation = await load(join(dir, 'generation.json'));
    const review = await load(join(dir, 'review.json'));
    const suite = await load(join(dir, 'assessment/suite.json'));
    const decisions = new Map();
    for (const d of review.decisions) {
      const key = `${d.group}/${d.id}`;
      if (decisions.has(key)) throw new Error('Duplicate review decision: ' + key);
      if (!['PASS', 'FAIL', 'NOT_REACHED', 'AWAITING_REVIEW', 'EVALUATOR_ERROR'].includes(d.status)) throw new Error('Unknown status: ' + key);
      if (['PASS', 'FAIL'].includes(d.status) && (!d.evidence?.length || !d.reason)) throw new Error('Assessed decision lacks evidence: ' + key);
      for (const file of d.evidence ?? []) {
        if (isAbsolute(file) || file.split('/').includes('..')) throw new Error('Evidence path must remain inside run');
        await stat(join(run, file));
      }
      decisions.set(key, d);
    }
    const categories = rubric.groups.map(group => {
      const criteria = group.criteria.map(c => {
        const decision = decisions.get(`${group.id}/${c.id}`);
        if (!decision) throw new Error('Missing review criterion: ' + group.id + '/' + c.id);
        return { ...c, ...decision, earnedPoints: decision.status === 'PASS' ? c.weight : 0 };
      });
      const verifiedScore = criteria.reduce((n,c) => n + c.earnedPoints, 0);
      const coverage = criteria.filter(c => c.status === 'PASS' || c.status === 'FAIL').reduce((n,c) => n + c.weight, 0);
      return { id: group.id, overallWeight: group.overallWeight, verifiedScore, coverage,
        possibleScore: [verifiedScore, verifiedScore + 100 - coverage], criteria };
    });
    if (decisions.size !== categories.reduce((n,c) => n + c.criteria.length, 0)) throw new Error('Extraneous review decision');
    const verifiedScore = round(categories.reduce((n,c) => n + c.verifiedScore * c.overallWeight / 100, 0));
    const weightedCoverage = round(categories.reduce((n,c) => n + c.coverage * c.overallWeight / 100, 0));
    const confirmedDefects = categories.flatMap(c => c.criteria.filter(d => d.status === 'FAIL').map(d => ({ category: c.id, ...d })));
    const unknowns = categories.flatMap(c => c.criteria.filter(d => !['PASS','FAIL'].includes(d.status)).map(d => ({ category: c.id, ...d })));
    // Clock.runFor can propagate a candidate callback exception. Preserve the raw capture
    // and bind a manual origin decision to it, rather than calling every wrapper throw
    // an evaluator failure. Unattributed exceptions remain evaluator errors.
    const rawCaptureExceptions = suite.results.flatMap(s => (s.evaluatorErrors ?? []).map((e,index) => ({ scenario: s.id, index, ...e })));
    const candidateRuntimeFailures = [], evaluatorErrors = [];
    for (const error of rawCaptureExceptions) {
      const attribution = (review.errorAttributions ?? []).find(a => a.scenario === error.scenario && a.index === error.index);
      if (attribution?.origin === 'candidate') {
        if (!attribution.evidence?.length || !attribution.reason) throw new Error('Candidate exception attribution needs evidence');
        for (const file of attribution.evidence) await stat(join(run,file));
        candidateRuntimeFailures.push({ ...error, attribution });
      } else evaluatorErrors.push(error);
    }
    const evaluatorIssues = review.evaluatorIssues ?? [];
    const fullSuccess = verifiedScore === 100 && weightedCoverage === 100 && !evaluatorErrors.length && !evaluatorIssues.length && !candidateRuntimeFailures.length && generation.status === 'submitted';
    const result = { ...model, generation, verifiedScore, weightedCoverage, possibleScore: [verifiedScore, round(verifiedScore + 100 - weightedCoverage)],
      fullSuccess, verdict: fullSuccess ? 'FULL_SUCCESS' : confirmedDefects.length ? 'FAIL' : generation.status !== 'submitted' ? 'GENERATION_FAILURE' : 'INCOMPLETE',
      categories, confirmedDefects, unknowns, evaluatorErrors, evaluatorIssues, candidateRuntimeFailures, rawCaptureExceptions, suite,
      evidence: { generation: `${model.id}/generation.json`, response: `${model.id}/response.json`, request: `${model.id}/request.json`,
        review: `${model.id}/review.json`, suite: `${model.id}/assessment/suite.json`, galleries: `${model.id}/review-gallery.html` } };
    await writeFile(join(dir, 'result.json'), json(result));
    results.push(result);
  }
  if (new Set(results.map(r => r.generation.payloadSha256)).size !== 1) throw new Error('Generation payload mismatch');
  const summary = { version: 1, condition: protocol.condition, scope: 'Single-attempt pilot, not a statistically reliable model ranking. Cerebras and OpenRouter are two serving configurations of the same reported GPT-OSS model.',
    priorPilotsExcluded: true, frozenAt: freeze.frozenAt, manifestSha256: freeze.publicManifestSha256,
    generation: protocol.generation, payloadSha256: results[0].generation.payloadSha256,
    scoring: rubric.scoring, categoryWeights: Object.fromEntries(rubric.groups.map(g => [g.id, g.overallWeight])),
    browserAssessmentsSerial: true, assessment: protocol.assessment, evaluatorIssues: (await load(join(run, 'evaluator-issues.json'))).issues,
    limits: ['Identical TEXT reference evidence, not screenshot-conditioned recreation; no extra evidence supplied to Gemini.',
      'Same native output-token cap and temperature; tokenizer/reasoning defaults differ across APIs, so usable code-token allocations need not match.',
      'Source-blind manual review of finite rendered encounters, not a validated autonomous grader or statistical reliability estimate.',
      'Public and route-prefix scenarios use controlled browser time; four scenarios per configuration use real time and native video.',
      'Timed public-route divergence alone is not a failure verdict. Unreached mechanics remain unknown and earn zero verified points.',
      'Common evaluator authoring error: duplicated green-pool coordinates conflict with the exact grid. LAYOUT/pools is unscored for all configurations; frozen inputs were not repaired.',
      'Full working-reference walkthrough was calibrated freshly; earlier compact defect fixtures remain separate evaluator provenance.'],
    results, finishedAt: new Date().toISOString() };
  await writeFile(join(run, 'comparison.json'), json(summary));
  const link = (path, text) => `<a href="${escape(path)}">${escape(text)}</a>`;
  const rows = results.map(r => `<tr><td><strong>${escape(r.id)}</strong><br>Requested: ${escape(r.generation.modelRequested)}<br>Returned: ${escape(r.generation.modelReturned ?? 'unreported')}<br>Serving: ${escape(r.generation.servingProvider)} (${escape(r.generation.servingProviderAttribution)})</td><td>${r.verifiedScore}/100</td><td>${r.weightedCoverage}%</td><td>${escape(r.verdict)}<br>Full success: ${r.fullSuccess ? 'yes' : 'no'}<br>Possible score: ${r.possibleScore.join('–')}</td><td>${(r.generation.durationMs/1000).toFixed(2)}s<br>${r.generation.reportedCost === null ? 'Cost unavailable' : '$'+escape(r.generation.reportedCost)}</td><td>${link(r.evidence.generation,'Generation')} · ${link(r.evidence.response,'Response')} · ${link(r.evidence.review,'Criterion review')} · ${link(r.evidence.suite,'Capture suite')} · ${link(r.evidence.galleries,'Visual evidence')}</td></tr>`).join('');
  const details = results.map(r => `<section><h2>${escape(r.id)}: category scores</h2><p>Each category: verified score /100; assessed coverage%; overall weight.</p><ul>${r.categories.map(c => `<li><strong>${escape(c.id)}</strong>: ${c.verifiedScore}/100; ${c.coverage}% coverage; weight ${c.overallWeight}%.</li>`).join('')}</ul><h3>Confirmed defects</h3><ul>${r.confirmedDefects.map(d => `<li>${escape(d.category+'/'+d.id)}: ${escape(d.reason)} ${d.evidence.map(p=>link(p,'evidence')).join(' · ')}</li>`).join('') || '<li>None established.</li>'}</ul><h3>Remaining unknowns</h3><ul>${r.unknowns.map(d => `<li>${escape(d.category+'/'+d.id)} — ${escape(d.status)}: ${escape(d.reason)}</li>`).join('')}</ul><h3>Evaluator errors versus candidate exceptions</h3><pre>${escape(JSON.stringify({runtimeInfrastructure:r.evaluatorErrors,taskAuthoring:r.evaluatorIssues,candidateCallbackThrows:r.candidateRuntimeFailures.map(e=>({scenario:e.scenario,origin:e.attribution.origin,reason:e.attribution.reason}))},null,2))}</pre><details><summary>All frozen criterion decisions (${r.categories.reduce((n,c)=>n+c.criteria.length,0)})</summary>${r.categories.map(c => `<h4>${escape(c.id)}</h4><ul>${c.criteria.map(d=>`<li><strong>${escape(d.id)}: ${escape(d.status)}</strong> (${d.weight} local points). ${escape(d.reason)} ${d.evidence.map(p=>link(p,'evidence')).join(' · ')}</li>`).join('')}</ul>`).join('')}</details></section>`).join('');
  const evaluatorIssueBanner = `<p><strong>Shared evaluator error:</strong> the frozen reference has conflicting duplicate green-pool locations. That placement criterion is unscored, not a candidate defect. No package or candidate was repaired. ${link('evaluator-issues.json','Exact authoring-error record')} · ${link('task-package/manifest.json','Archived frozen public task package')}</p>`;
  await writeFile(join(run, 'report.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Full Level 2 — three-configuration single-attempt comparison</title><style>body{font:16px/1.45 system-ui;background:#111c23;color:#e7edf0;max-width:1400px;margin:2rem auto;padding:0 1rem}a{color:#8fd0ff}table{border-collapse:collapse;width:100%}th,td{padding:.8rem;border-bottom:1px solid #60717b;text-align:left;vertical-align:top}section{border-top:1px solid #60717b;margin-top:2rem}li{margin:.45rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer}</style><h1>Full Level 2 — fresh three-configuration comparison</h1><p><strong>Single-attempt pilot, not a statistically reliable model ranking.</strong> Cerebras and OpenRouter are two serving configurations of the same reported model. Earlier smoke tests and Gemini development pilot are excluded.</p><p>Same text reference evidence, public executable walkthrough, requirements, output contract, temperature1 and16384-token cap. One request/configuration; no candidate repairs, feedback or generation retries. All browser assessments serial.</p><p>Verified score = weighted PASS points. Coverage = weighted PASS+FAIL points. Unknowns/evaluator errors earn no verified points and are not silently classified as failures. Full success requires100/100 with100% coverage and no evaluator errors.</p><p>${link('comparison.json','Machine-readable comparison')} · ${link('freeze.json','Pre-generation freeze')} · ${link('hidden-assessment.json','Frozen hidden procedures (now disclosed)')} · ${link('calibration-review.json','Working-reference calibration/provenance')}</p>${evaluatorIssueBanner}<table><thead><tr><th>Configuration / identities</th><th>Verified score</th><th>Weighted coverage</th><th>Verdict</th><th>Generation / available cost</th><th>Saved evidence</th></tr></thead><tbody>${rows}</tbody></table><h2>Limits</h2><ul>${summary.limits.map(s=>`<li>${escape(s)}</li>`).join('')}</ul>${details}</html>`);
  return summary;
}
