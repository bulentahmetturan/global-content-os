// LOCAL, NON-PRODUCTION diagnostic: shape of per-invocation and per-concept DERIVE work on the recorded real ClinicalTrials page (in-memory SQLite, Node process CPU).
// Node CPU is NOT Cloudflare Worker CPU and is not comparable in absolute terms; it only shows whether any concept is a data-dependent hotspot. Usage: node scripts/dossier-derive-cpu-profile.mjs
import { bundle } from '../apps/worker/src/sqlite-d1.test-helper.mjs';
import { freshWorld, CR, CT_ID, PF } from '../apps/worker/src/dossier/burnin-support.mjs';
const AG = await bundle('apps/worker/src/dossier/aggregation.ts', 'cpu-agg');
const CA = await bundle('apps/worker/src/dossier/candidates.ts', 'cpu-cand');
const RP = await bundle('apps/worker/src/dossier/repo.ts', 'cpu-repo');
const EL = await bundle('apps/worker/src/dossier/eligibility.ts', 'cpu-elig');
const cpuMs = (f) => { const a = process.cpuUsage(); const t = performance.now(); return f().then((r) => { const b = process.cpuUsage(a); return [r, (b.user + b.system) / 1000, performance.now() - t]; }); };
// 1) per-invocation LOCAL process CPU for the whole run (the Worker's own CPU is NOT comparable; only the shape is)
const w = await freshWorld({ readers: [CT_ID] });
const inv = [];
let runId;
for (let i = 0; i < 40; i++) {
  const [o, cpu, wall] = await cpuMs(() => CR.invokeCanary(w.deps(), { readerId: CT_ID, operator: 'p', runId }));
  runId = o.runId; inv.push({ n: i + 1, phase: o.phase, st: o.statementsThisInvocation, derived: o.progress.derived, cpu: +cpu.toFixed(0), wall: +wall.toFixed(0) });
  if (o.status !== 'PAUSED_BUDGET') break;
}
console.log('per-invocation (local node CPU ms, in-memory sqlite, no network latency):');
for (const x of inv) console.log(JSON.stringify(x));
// 2) per-concept local CPU of the DERIVE unit for every concept (aggregateConcept + evaluateTarget), idempotent re-run
const repo = new RP.DossierRepo(w.db, w.ctx);
const concepts = w.sqlite.prepare("SELECT concept_id, normalized_label FROM dossier_concepts").all();
const policy = PF.canaryPolicy(PF.DOSSIER_CANARY_V1, { promotionEnabled: true, canonicalSourceId: 'clinicaltrials-gov-api-v2' });
const per = [];
for (const c of concepts) {
  const nobs = w.sqlite.prepare('SELECT COUNT(*) n FROM dossier_observations WHERE concept_id = ?').get(c.concept_id).n;
  const [, cpu, wall] = await cpuMs(async () => {
    const ce = EL.deriveConceptEligibility(await repo.conceptEligibilitySummary(c.concept_id));
    if (ce.state === 'ELIGIBLE') { await AG.aggregateConcept(repo, c.concept_id, { version: 'canary-agg-1', now: w.ctx.now(), observationLimit: 2000, platformOf: () => 'TRIAL_REGISTRY' }); await CA.evaluateTarget(repo, { type: 'CONCEPT', id: c.concept_id }, policy, { now: w.ctx.now(), algorithmVersion: 'canary-cand-1', observationLimit: 2000 }); }
  });
  per.push({ label: c.normalized_label, nobs, cpu, wall });
}
per.sort((a, b) => b.cpu - a.cpu);
const sum = per.reduce((a, b) => a + b.cpu, 0);
console.log('concepts', per.length, 'mean cpu ms', (sum / per.length).toFixed(2), 'median', per[Math.floor(per.length / 2)].cpu.toFixed(2), 'max', per[0].cpu.toFixed(2), 'ratio max/median', (per[0].cpu / Math.max(0.01, per[Math.floor(per.length / 2)].cpu)).toFixed(1));
console.log('top5', JSON.stringify(per.slice(0, 5).map((x) => [x.label.slice(0, 40), x.nobs, +x.cpu.toFixed(1)])));
const byObs = {}; for (const p of per) { const k = p.nobs >= 5 ? '5+' : String(p.nobs); (byObs[k] ??= []).push(p.cpu); }
console.log('mean cpu by observations-per-concept', JSON.stringify(Object.fromEntries(Object.entries(byObs).map(([k, v]) => [k, { n: v.length, mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) }]))));
console.log('max observations on one concept', Math.max(...per.map((p) => p.nobs)));
