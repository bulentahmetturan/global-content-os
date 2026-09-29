// Controlled end-to-end harness for the approved_brief pipeline:
//   SOURCE -> FETCH -> PARSE -> DEDUPE -> CANDIDATE -> HUB/TRIAGE -> APPROVAL -> approved_brief
//   -> CCOS INGEST -> PRODUCTION JOB -> RENDER/QA -> STATUS CALLBACK
//
// Every stage is an adapter behind a small interface, so final bindings (real GCOS/CCOS workers, P2-P6 changes)
// can replace the default in-memory simulations one stage at a time without touching scenarios. The default
// adapters are SIMULATIONS of the documented contract (docs/approved-brief-handoff.md, CCOS handoff/approved-brief.ts):
// deterministic, no network, no live third-party dependency. Simulation mode is stated in every run result.
import { createHash } from 'node:crypto';

export const ROUTES = ['kaduse-news', 'kaduse-research', 'tip-ogrencileri'];
export const CHANNELS = ['kaduse-medikal', 'tip-ogrencileri-platformu', 'hekimler-toplulugu'];
export const CONTRACT_VERSION = '1.0.0';
export const BRIEF_KEYS = ['contractVersion', 'briefId', 'route', 'channelId', 'title', 'summary', 'gists', 'canonicalUrl', 'publisher', 'publishedAt', 'dedupeKey', 'approvedAt', 'approvedBy', 'evidence', 'sourceItemId'];
const EVIDENCE_KEYS = ['doi', 'pmid', 'pmcid', 'finding', 'limitation', 'studyType'];

/** Mirror of the CCOS zod contract (strict keys, enums). Parity with CCOS source is asserted in tests. */
export function validateApprovedBrief(b) {
  const errors = [];
  if (!b || typeof b !== 'object' || Array.isArray(b)) return ['not_an_object'];
  for (const k of Object.keys(b)) if (!BRIEF_KEYS.includes(k)) errors.push(`unknown_key:${k}`);
  for (const k of BRIEF_KEYS) if (!(k in b)) errors.push(`missing:${k}`);
  if (b.contractVersion !== CONTRACT_VERSION) errors.push('contractVersion');
  if (!ROUTES.includes(b.route)) errors.push('route');
  if (!CHANNELS.includes(b.channelId)) errors.push('channelId');
  for (const k of ['briefId', 'title', 'canonicalUrl', 'dedupeKey', 'approvedAt', 'approvedBy', 'sourceItemId']) if (typeof b[k] !== 'string' || !b[k]) errors.push(k);
  if (typeof b.summary !== 'string') errors.push('summary');
  if (typeof b.publisher !== 'string') errors.push('publisher');
  if (!Array.isArray(b.gists) || b.gists.some((g) => typeof g !== 'string')) errors.push('gists');
  if (b.publishedAt !== null && typeof b.publishedAt !== 'string') errors.push('publishedAt');
  if (b.evidence !== null && b.evidence !== undefined) {
    if (typeof b.evidence !== 'object') errors.push('evidence');
    else {
      for (const k of Object.keys(b.evidence)) if (!EVIDENCE_KEYS.includes(k)) errors.push(`evidence.unknown:${k}`);
      for (const k of EVIDENCE_KEYS) if (!(k in b.evidence) || (b.evidence[k] !== null && typeof b.evidence[k] !== 'string')) errors.push(`evidence.${k}`);
    }
  }
  return errors;
}

const sha = (o) => createHash('sha256').update(canonical(o)).digest('hex');
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** Fresh in-memory world shared by the default adapters. */
export function newWorld() {
  return {
    seenDedupe: new Set(),
    candidates: [],
    briefs: [],
    handoffLog: [],
    quarantine: [],
    sourceHealth: {},
    ccos: { intake: new Map(), jobs: [], token: 'sim-token', callbacks: [] },
    gcosProduction: new Map(),
  };
}

// ---- default adapters (simulations; each returns {ok, ...}) -----------------------------------------------
export function defaultAdapters(world) {
  return {
    fetch: (ctx) => {
      if (ctx.faults.fetch) {
        world.sourceHealth[ctx.source.id] = 'failing';
        return { ok: false, error: 'fetch_failed' };
      }
      world.sourceHealth[ctx.source.id] = 'ok';
      return { ok: true, raw: ctx.source.rawItems };
    },
    parse: (ctx, raw) => {
      if (ctx.faults.parse) {
        world.quarantine.push({ source: ctx.source.id, reason: 'parse_failed' });
        return { ok: false, error: 'parse_failed' };
      }
      return { ok: true, items: raw.map((r) => ({ ...r })) };
    },
    dedupe: (ctx, items) => {
      const fresh = [];
      for (const it of items) {
        if (world.seenDedupe.has(it.dedupeKey)) continue;
        world.seenDedupe.add(it.dedupeKey);
        fresh.push(it);
      }
      return { ok: true, items: fresh };
    },
    candidate: (ctx, items) => {
      for (const it of items) world.candidates.push({ ...it, state: 'inbox' });
      return { ok: true, candidates: world.candidates.filter((c) => c.state === 'inbox') };
    },
    triage: (ctx, candidates) => {
      const decisions = candidates.map((c) => ({ c, decision: ctx.faults.reject ? 'trash' : 'promote' }));
      for (const d of decisions) d.c.state = d.decision === 'promote' ? 'production' : 'trash';
      return { ok: true, promoted: decisions.filter((d) => d.decision === 'promote').map((d) => d.c) };
    },
    approve: (ctx, c) => {
      const brief = {
        contractVersion: CONTRACT_VERSION, briefId: `brief-${c.sourceItemId}`, route: c.route, channelId: c.channelId, title: c.title, summary: c.summary ?? '', gists: c.gists ?? [],
        canonicalUrl: c.url, publisher: c.publisher ?? '', publishedAt: c.publishedAt ?? null, dedupeKey: c.dedupeKey, approvedAt: '2026-01-01T00:00:00Z', approvedBy: 'e2e-operator', evidence: null, sourceItemId: c.sourceItemId,
      };
      if (ctx.faults.invalidBrief) delete brief.title;
      world.briefs.push(brief);
      return { ok: true, brief };
    },
    handoff: (ctx, brief) => ctx.ccosClient(brief),
    // CCOS side: ingest -> job
    ccosIngest: (ctx, req) => ccosIngest(world, ctx, req),
    render: (ctx, job) => (ctx.faults.render ? { ok: false, error: 'render_failed' } : { ok: true }),
    qa: (ctx, job) => (ctx.faults.qa ? { ok: false, error: 'qa_failed' } : { ok: true }),
    callback: (ctx, briefId, status, detail) => {
      if (ctx.faults.callback) return { ok: false, error: 'callback_failed' };
      world.gcosProduction.set(briefId, { status, detail });
      return { ok: true };
    },
  };
}

/** Simulated CCOS intake with the real contract semantics: 503 unset token, 401 bad token, 400 invalid, 409 conflict, idempotent. */
function ccosIngest(world, ctx, { token, body }) {
  const c = world.ccos;
  if (ctx.faults.ccosDown) return { status: 503, code: 'unavailable', network: true };
  const configured = ctx.faults.tokenUnset ? null : c.token;
  if (!configured) return { status: 503, code: 'handoff_not_configured' };
  if (token !== configured) return { status: 401, code: 'unauthorized' };
  const errs = validateApprovedBrief(body);
  if (errs.length) return { status: 400, code: 'invalid_approved_brief', issues: errs };
  const hash = sha(body);
  const existing = c.intake.get(body.briefId);
  if (existing) {
    if (existing.hash !== hash) return { status: 409, code: 'brief_id_conflict' };
    return { status: 200, outcome: 'duplicate', jobId: existing.jobId };
  }
  const jobId = `job-${c.jobs.length + 1}`;
  c.jobs.push({ jobId, briefId: body.briefId, stage: 'accepted' });
  c.intake.set(body.briefId, { hash, jobId, status: 'accepted' });
  return { status: 201, outcome: 'created', jobId };
}

const defaultSource = () => ({
  id: 'fixture-source',
  rawItems: [{ sourceItemId: 'item-1', title: 'Fixture approved item', url: 'https://example.test/a', route: 'kaduse-news', channelId: 'kaduse-medikal', dedupeKey: 'dk-1', summary: 's', gists: ['g'], publisher: 'Fixture' }],
});

/**
 * Run one scenario through the pipeline. Returns {trace, outcome, world} where outcome summarises terminal state.
 * scenario = { id, faults, options: { presentTwice, retryAfterRecovery, wrongToken } }
 */
export function runScenario(scenario, adapters = null, world = newWorld()) {
  const A = adapters ?? defaultAdapters(world);
  const ctx = { faults: { ...(scenario.faults ?? {}) }, source: scenario.source ?? defaultSource() };
  const opts = scenario.options ?? {};
  const trace = [];
  const step = (stage, r) => { trace.push({ stage, ok: r.ok !== false }); return r; };
  const outcome = { terminal: null, jobs: 0, briefsSent: 0, ccosStatus: [], callback: null };

  ctx.ccosClient = (brief) => {
    outcome.briefsSent++;
    const res = A.ccosIngest(ctx, { token: opts.wrongToken ? 'wrong' : world.ccos.token, body: brief });
    world.handoffLog.push({ briefId: brief.briefId, status: res.status, code: res.code ?? res.outcome });
    outcome.ccosStatus.push(res.status);
    return res;
  };

  const run = () => {
    const f = step('fetch', A.fetch(ctx)); if (!f.ok) return 'fetch_failed';
    const p = step('parse', A.parse(ctx, f.raw)); if (!p.ok) return 'parse_failed';
    const d = step('dedupe', A.dedupe(ctx, p.items));
    if (!d.items.length && !world.candidates.some((c) => c.state === 'inbox')) return 'deduplicated';
    const c = step('candidate', A.candidate(ctx, d.items));
    const t = step('triage', A.triage(ctx, c.candidates));
    if (!t.promoted.length) return 'rejected';
    const ap = step('approve', A.approve(ctx, t.promoted[0]));
    const brief = ap.brief;
    let h = step('handoff', ctx.ccosClient(brief));
    if (h.status === 503 && h.network && opts.retryAfterRecovery) {
      outcome.retryPending = true; // GCOS keeps the brief approved and retries after recovery
      ctx.faults.ccosDown = false;
      h = step('handoff_retry', ctx.ccosClient(brief));
    } else if (h.status === 503 && h.network) return 'ccos_unavailable_retry_pending';
    if (opts.presentTwice) h = step('handoff_dup', ctx.ccosClient(brief));
    if (h.status === 401 || h.status === 503) return `handoff_rejected_${h.status}`;
    if (h.status === 400) return 'handoff_invalid_brief';
    if (h.status === 409) return 'handoff_conflict';
    const job = world.ccos.jobs.find((j) => j.jobId === h.jobId);
    const cb = (status, detail) => {
      world.ccos.intake.get(brief.briefId).status = status;
      const r = step(`callback_${status}`, A.callback(ctx, brief.briefId, status, detail));
      if (!r.ok) { world.ccos.intake.get(brief.briefId).callbackError = r.error; outcome.callback = 'failed'; }
      return r;
    };
    cb('accepted');
    if (h.outcome === 'duplicate' && !opts.presentTwice) return 'duplicate_brief_noop';
    if (opts.presentTwice) { /* second delivery must not create a second job */ }
    cb('designing');
    if (!step('render', A.render(ctx, job)).ok) { cb('failed', 'render_failed'); return 'render_failed'; }
    if (!step('qa', A.qa(ctx, job)).ok) { cb('failed', 'qa_failed'); return 'qa_failed'; }
    cb('ready');
    return 'ready';
  };
  const terminals = [run()];
  if (opts.repeatSource) terminals.push(run());
  outcome.terminals = terminals;
  outcome.terminal = terminals.at(-1);
  outcome.jobs = world.ccos.jobs.length;
  outcome.callback ??= world.gcosProduction.size ? 'delivered' : 'none';
  outcome.callbackErrorRecorded = [...world.ccos.intake.values()].some((i) => i.callbackError);
  outcome.finalBriefStatus = [...world.ccos.intake.values()][0]?.status ?? null;
  return { id: scenario.id, trace, outcome, world };
}
