// Source Lifecycle Orchestrator: one entry point for add (G0-G10), retire (O0-O7), reactivate, inspect,
// recalibrate and purge-plan. Canonical owner = GCOS; writes only through store.commitCanonical.
import { loadProjections, normalizeRequest, resolveIdentity, compactProjection } from './catalog.mjs';
import { discoverEndpoint, defaultFetcher, stripBodies } from './discovery.mjs';
import { parseFeed, extractListPage, sitemapTimestamps, runtimeParserFor } from './parse.mjs';
import { resolveRouting, proposeSourceId } from './routing.mjs';
import { deriveCadence, recalibration } from './cadence.mjs';
import { dedupeGate } from './dedupe.mjs';
import { pythonBridge } from './bridge.mjs';
import { commitCanonical, getAt, readRegistry, targetFileFor, writeTrace, authorizeLifecycle } from './store.mjs';
import { newHekimlerRecord, activationPatch, retirementPatch, pushHistory, clearRetirement, canary } from './profile.mjs';
import { inflightPlan, classifyArtifacts, purgePlan, PRESERVED, REGENERATE, HEKIMLER_DERIVATIVES } from './offboard.mjs';
import { stateOf, LANES, ACTIVATION } from './model.mjs';
import { prepareKaduseChange } from './kaduse-change.mjs';

const OBSERVABILITY = {
  fetch_success_last_success_last_error: 'D1 hekimler_source_telemetry (last_success_at, failure_count, last_operator_status) / feed fetch stats (0004)',
  scheduler: 'report/scheduler-state.json (next_due, backoff_until, lateness_min, manual_review) + report/run-report.json rows.failure_class',
  capacity: 'python adapters/hekimler-radar/scripts/hekimler_ops.py capacity --history <run-report dir>',
  duplicate_rate_and_yield: 'source_items per source_id/feed_id + decided_links (0014)',
  editorial_acceptance: 'editorial_decisions + review_feedback (0023); relevance ledger (scripts/relevance-ledger.mjs)',
  revalidation: 'source_revalidation (0024) / source_pass_fail_decisions (0021)',
  rule: 'One rejection never disables a source; SOURCE_FEEDBACK -> reviewed proposal -> canonical owner action only.',
};

const regenerateSteps = () => HEKIMLER_DERIVATIVES.map((path) => ({ path, generator: REGENERATE[path] }));

const pageTitle = (html) => (String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '';

export function createLifecycle(opts) {
  const root = opts.root;
  const fetcher = opts.fetcher || defaultFetcher;
  const bridge = opts.bridge === undefined ? pythonBridge(root) : opts.bridge;
  const clock = opts.now || (() => new Date().toISOString());
  const history = opts.history || [];
  const actor = opts.actor || { kind: 'operator', id: 'cli' };
  const authorize = opts.authorize;
  const traces = opts.writeTraces !== false;

  function finish(trace, result) {
    trace.outcome = result.outcome;
    trace.finished_at = clock();
    const out = { ...result, request_id: trace.request_id };
    if (traces) out.trace_file = writeTrace(root, { ...trace, result: out });
    return out;
  }

  // ---------- shared G2..G8 pipeline for one endpoint -------------------------------------------------------------
  async function validate({ req, identity, url, laneHint, projections, existingRecord = null, trace }) {
    const g = {};
    trace.phases.push({ phase: 'VALIDATING', at: clock() });
    const disc = await discoverEndpoint({ url, lane: laneHint, fetcher });
    trace.discovery = stripBodies(disc);
    g.ACCESS = disc.gate === 'PASS' ? 'PASS' : disc.gate;
    g.ENDPOINT = disc.endpoint ? 'PASS' : 'FAIL';
    if (disc.gate !== 'PASS') return { stop: { outcome: disc.gate, reason: disc.reason, gates: g, next_step: disc.gate === 'BLOCKED_ACCESS' ? 'Access needs credentials/authorization or a documented labelled substitute; ask the user.' : 'Retry later or check the endpoint.' } };

    const page = disc._page;
    const feedItems = disc._feed ? parseFeed(disc._feed.body) : [];
    const listItems = disc._feed && disc._feed.url === page.url ? [] : extractListPage(page.body, page.url);
    const sampleForRouting = feedItems.length ? feedItems : listItems;

    const routing = resolveRouting({ req, identity, endpoint: disc.endpoint, sample: sampleForRouting, pageTitle: pageTitle(page.body), sameDomain: identity.same_domain || [] });
    g.ROUTING = routing.gate === 'PASS' ? 'PASS' : routing.gate;
    if (routing.gate !== 'PASS') return { stop: { outcome: 'NEEDS_USER_DECISION', reason: routing.reason, question: routing.question, gates: g } };

    // G3 parser: preferred transport if the lane's runtime parses it, else the lane's HTML list parser on the page.
    let runtime = runtimeParserFor(routing.lane, disc.endpoint);
    let items = disc.endpoint.transport === 'HTML_LIST' ? listItems : feedItems;
    let transportNote = null;
    if (!runtime && disc.endpoint.transport !== 'HTML_LIST' && listItems.length >= 3) {
      runtime = runtimeParserFor(routing.lane, { transport: 'HTML_LIST', url: page.url });
      items = listItems;
      transportNote = `${disc.endpoint.transport} not parsed by the ${routing.lane} runtime; list page used, feed kept as cadence evidence`;
    }
    if (runtime && disc.endpoint.transport === 'OFFICIAL_API') items = feedItems.length ? feedItems : listItems;
    if (!runtime) {
      g.PARSER = 'ADAPTER_REQUIRED';
      return { stop: { outcome: 'BLOCKED_TECHNICAL', reason: 'ADAPTER_REQUIRED', gates: g, next_step: `No existing ${routing.lane} runtime parser handles ${disc.endpoint.transport}. Write a targeted adapter + fixture test from the trace sample, then re-run add.` }, fixture: page.body.slice(0, 200000) };
    }
    const withFields = items.filter((i) => i.title && i.url);
    g.PARSER = disc.endpoint.transport === 'OFFICIAL_API' || withFields.length >= 3 ? 'PASS' : 'FAIL';
    if (g.PARSER !== 'PASS') return { stop: { outcome: 'BLOCKED_TECHNICAL', reason: 'PARSER_YIELD_BELOW_MINIMUM', gates: g, next_step: 'Page does not expose >= 3 items with title + URL; a targeted adapter + fixture is required.' }, fixture: page.body.slice(0, 200000) };

    // G5 cadence evidence: feed dates > list dates > sitemap lastmod > none (class fallback).
    let ts = feedItems.map((i) => i.published_at).filter(Boolean);
    let evidenceSource = 'feed_published';
    if (ts.length < 5) {
      const lt = listItems.map((i) => i.published_at).filter(Boolean);
      if (lt.length > ts.length) [ts, evidenceSource] = [lt, 'list_page_dates'];
    }
    if (ts.length < 5 && disc.sitemaps?.length && disc._fetchSitemap) {
      try {
        const sm = await disc._fetchSitemap(disc.sitemaps[0]);
        const st = sm.status === 200 ? sitemapTimestamps(sm.body, page.url) : [];
        if (st.length > ts.length) [ts, evidenceSource] = [st, 'sitemap_lastmod'];
      } catch {
        /* sitemap optional */
      }
    }
    const cadence = deriveCadence({ timestamps: ts, lane: routing.lane, heading: routing.heading, now: clock(), evidenceSource });
    g.CADENCE = 'PASS';

    // Candidate profile
    const taken = new Set(projections.map((p) => p.source_id));
    const sourceId = identity.match?.source_id || proposeSourceId({ lane: routing.lane, heading: routing.heading, url: page.url, taken });
    const name = identity.match?.name || pageTitle(page.body).split(/\s[|–-]\s/)[0].slice(0, 120) || sourceId;
    let profile = null;
    if (routing.lane === 'hekimler') {
      profile = existingRecord
        ? activationPatch(existingRecord, { pageUrl: page.url, items, cadence, routing })
        : newHekimlerRecord({ sourceId, name, pageUrl: page.url, items, routing, cadence, feedUrl: disc._feed && disc._feed.url !== page.url ? disc._feed.url : null });
    }

    // G6 dedupe / ownership
    const candidate = { source_id: sourceId, url: page.url, heading: routing.heading, lane: routing.lane };
    const identityCheck = bridge ? (c) => bridge.identity(c) : null;
    const dd = dedupeGate({ candidate, sample: items, projections, identityCheck, knownItemUrls: opts.knownItemUrls || null });
    const bridgeErr = dd.checks.ownership.violations?.find((v) => v.error);
    g.DEDUPE = bridgeErr ? 'BLOCKED_TECHNICAL' : dd.gate === 'PASS' ? 'PASS' : dd.gate;
    trace.dedupe = dd;
    if (bridgeErr) return { stop: { outcome: 'BLOCKED_TECHNICAL', reason: bridgeErr.error, gates: g } };
    if (dd.gate !== 'PASS') return { stop: { outcome: 'NEEDS_USER_DECISION', reason: 'DUPLICATE_OR_OWNERSHIP', question: dd.question, explanation: dd.explanation, gates: g } };

    // G7 capacity (existing guard; only SAFE activates)
    let capacity;
    if (routing.lane === 'hekimler') {
      capacity = bridge ? bridge.capacity({ addCadence: cadence.poll_minutes, history }) : { status: 'BLOCK', reasons: ['BLOCK: capacity guard unavailable -- fail closed'] };
    } else {
      capacity = { status: 'NOT_EVALUATED', reasons: ['Kaduse lane is plan-only here; worker cron capacity is reviewed with the catalog commit'] };
    }
    g.CAPACITY = capacity.status;

    // G8 canary
    trace.phases.push({ phase: 'CANARY', at: clock() });
    const can = canary({ sourceId, items, plan: profile?.fetch_plan || null, routing, profile, gates: bridge && profile ? (p) => bridge.gates(p) : null });
    g.CANARY = can.gate;
    trace.canary = can;
    if (can.gate !== 'PASS') {
      const blockedByPolicy = can.persistence?.computed === ACTIVATION.BLOCKED && !(can.persistence.failures || []).length;
      return {
        stop: blockedByPolicy
          ? { outcome: 'NEEDS_USER_DECISION', reason: 'BLOCKED_BY_CODE_POLICY', question: `${sourceId} is blocked by code policy (radar/hekimler_activation.py BLOCKED_SOURCE_IDS / congress family). Change that policy first?`, gates: g, canary: can }
          : { outcome: 'BLOCKED_TECHNICAL', reason: 'CANARY_FAILED', gates: g, canary: can },
      };
    }
    return {
      gates: g,
      sourceId,
      name,
      routing,
      endpoint: { url: disc.endpoint.url, page_url: page.url, transport: disc.endpoint.transport, runtime: runtime.method, runtime_module: runtime.module, note: transportNote },
      access: disc.access,
      cadence,
      capacity,
      canary: can,
      profile,
    };
  }

  const summary = (v) => ({
    source_id: v.sourceId,
    endpoint: v.endpoint,
    route: { lane: v.routing.lane, channelId: v.routing.channelId, heading: v.routing.heading, source_tier: v.routing.source_tier, evidence_role: v.routing.evidence_role, basis: v.routing.basis },
    cadence: { poll_minutes: v.cadence.poll_minutes, confidence: v.cadence.confidence, flags: v.cadence.flags, evidence: v.cadence.evidence },
    capacity: { status: v.capacity.status, reasons: v.capacity.reasons },
    canary: { gate: v.canary.gate, candidates: v.canary.candidates, dated: v.canary.dated, published: 0 },
  });

  function kadusePlan(op, v, extra = {}) {
    return {
      outcome: 'PLAN_ONLY',
      reason: 'KADUSE_CATALOG_ACTIVATION_IS_A_REVIEWED_COMMIT',
      ...extra,
      plan: [
        op === 'add'
          ? `Add the ${v.routing.lane === 'kaduse-news' ? 'target + subscription to packages/source-catalog/data/news-registry.json + kaduse-subscriptions.json' : 'record to packages/source-catalog/data/research-sources.json'} (endpoint ${v.endpoint.url}, transport ${v.endpoint.runtime})`
          : `Remove the feed id from PENDING_ACTIVATION_FEED_IDS in scripts/sync-feeds.mjs (explicit decision; S66 check must pass)`,
        'node scripts/sync-feeds.mjs  (regenerates config/feeds.json -- never hand-edit)',
        'python adapters/hekimler-radar/scripts/check_source_identity.py  (S66 must print OK)',
        'Forward D1 migration to insert/enable the source_feeds row (Post-Freeze migration requirement; remote apply needs explicit authorization)',
      ],
      recommended_cadence_minutes: v.cadence.poll_minutes,
    };
  }

  const kaduseOk = (c) => !['DENIED', 'BLOCKED_TECHNICAL'].includes(c.outcome);
  const kaduseResult = (c) => ({
    outcome: c.outcome,
    ...(c.reason ? { reason: c.reason } : {}),
    ...(c.code ? { commit: { code: c.code, detail: c.detail } } : {}),
    ...(c.patch ? { catalog_patch: c.patch } : {}),
    ...(c.migration ? { migration: c.migration, d1: c.d1 } : {}),
    ...(c.review_gate ? { review_gate: c.review_gate, remote_applied: false } : {}),
  });

  // ---------- ADD ----------------------------------------------------------------------------------------------------
  async function add(input, { url, channel, apply = false } = {}) {
    const req = normalizeRequest(input, { now: clock(), url, channel });
    const trace = { request_id: req.request_id, op: 'add', input: { raw: req.raw, url: req.url, channel: req.channel_hint, apply }, actor, phases: [{ phase: 'REQUESTED', at: clock() }] };
    const gates = { REQUEST: 'PASS' };
    trace.phases.push({ phase: 'RESOLVING', at: clock() });
    const projections = loadProjections(root);
    const identity = resolveIdentity(req, projections);
    trace.identity = { outcome: identity.outcome, match: identity.match && compactProjection(identity.match), candidates: identity.candidates, same_domain: identity.same_domain };
    gates.IDENTITY = identity.outcome === 'AMBIGUOUS' || identity.outcome === 'UNRESOLVED' ? 'NEEDS_USER_DECISION' : 'PASS';

    if (identity.outcome === 'AMBIGUOUS' || identity.outcome === 'UNRESOLVED') {
      return finish(trace, { ok: false, op: 'add', outcome: 'NEEDS_USER_DECISION', reason: `IDENTITY_${identity.outcome}`, question: identity.question, candidates: identity.candidates, gates });
    }
    if (identity.outcome === 'EXISTING') {
      const m = identity.match;
      const state = stateOf(m);
      if (state === 'ACTIVE') {
        const drift = req.url && !m.urls.includes(req.url) ? { registered: m.urls[0], requested: req.url, next_step: 'Endpoint change is a change_url on the SAME identity (reviewed owner action), never a new source.' } : null;
        return finish(trace, { ok: true, op: 'add', outcome: 'ALREADY_ACTIVE', source_id: m.source_id, state, gates, ...(drift ? { endpoint_drift: drift } : {}) });
      }
      if (state === 'RETIRED') {
        const r = await reactivate(m.source_id, { apply, requestTrace: trace });
        return { ...r, routed_from: 'add' };
      }
      // Registered but inactive: activate the existing identity (never a duplicate).
      if (m.store !== 'hekimler') {
        const v = await validate({ req, identity, url: req.fetch_url || m.fetch_url || m.urls[0], laneHint: m.lane, projections, trace });
        if (v.stop) return finish(trace, { ok: false, op: 'add', source_id: m.source_id, ...v.stop, gates: { ...gates, ...v.stop.gates } });
        return finish(trace, { ok: true, op: 'add', source_id: m.source_id, state, gates: { ...gates, ...v.gates }, ...summary(v), ...kadusePlan('activate', v, { existing_status: m.status }) });
      }
      return activateExisting({ req, identity, projections, trace, gates, apply, op: 'add' });
    }

    // NEW source
    const v = await validate({ req, identity, url: req.fetch_url, laneHint: null, projections, trace });
    if (v.stop) {
      if (v.fixture && traces) trace.fixture_sample = v.fixture;
      return finish(trace, { ok: false, op: 'add', ...v.stop, gates: { ...gates, ...v.stop.gates } });
    }
    if (v.routing.lane !== 'hekimler') {
      const change = prepareKaduseChange({ root, op: 'add', target: v, mutateArgs: { name: v.name, at: clock() }, apply, actor, authorize, requestId: req.request_id, sync: opts.kaduseSync });
      return finish(trace, { ok: kaduseOk(change), op: 'add', gates: { ...gates, ...v.gates }, ...summary(v), ...kaduseResult(change), recommended_cadence_minutes: v.cadence.poll_minutes });
    }

    const safe = v.capacity.status === 'SAFE';
    const record = structuredClone(v.profile);
    if (!safe) {
      record.runtime_activation = ACTIVATION.MANUAL;
      record.manual_intake_reason = `CAPACITY_${v.capacity.status}: ${(v.capacity.reasons || []).join('; ')}`.slice(0, 300);
    }
    const outcome = safe ? 'ACTIVE' : 'BLOCKED_CAPACITY';
    pushHistory(record, { op: 'add', request_id: req.request_id, at: clock(), outcome: safe ? 'ACTIVE' : 'READY', by: actor.id, gates: { ...gates, ...v.gates } });
    const file = targetFileFor({ heading: v.routing.heading, url: v.endpoint.page_url });
    const commit = commitCanonical({ root, file, apply, actor, authorize, op: 'add', mutate: (data) => { data.sources.push(record); return { op: 'insert', source_id: record.source_id, path: `sources[${data.sources.length - 1}]` }; } });
    trace.phases.push({ phase: safe ? 'ACTIVE' : 'READY', at: clock() });
    return finish(trace, {
      ok: commit.outcome !== 'DENIED',
      op: 'add',
      outcome: commit.outcome === 'APPLIED' ? outcome : commit.outcome === 'DENIED' ? 'DENIED' : `${outcome}_DRY_RUN`,
      activation: commit.outcome === 'APPLIED' ? (safe ? 'ACTIVE' : 'READY (MANUAL_INTAKE until capacity SAFE)') : 'NOT_WRITTEN',
      gates: { ...gates, ...v.gates },
      ...summary(v),
      ...(safe ? {} : { next_step: 'Capacity guard is not SAFE: do not activate. Re-run add with --history <run-report dir> once utilization allows, or bring cadence class up.' }),
      commit: { outcome: commit.outcome, file: commit.file, ...(commit.code ? { code: commit.code } : {}), ...(commit.reason ? { reason: commit.reason } : {}) },
      ...(commit.outcome === 'APPLIED' ? { regenerate: regenerateSteps() } : {}),
    });
  }

  async function activateExisting({ req, identity, projections, trace, gates, apply, op, previous = null }) {
    const m = identity.match;
    if (m.layers.length !== 1) return finish(trace, { ok: false, op, source_id: m.source_id, outcome: 'BLOCKED_TECHNICAL', reason: 'MULTI_LAYER_RECORD', detail: m.layers, next_step: 'Shared phase1/v1.1 id: edit the winning layer by reviewed commit.', gates });
    const reg = readRegistry(root, m.file);
    const record = getAt(reg.data, m.path);
    const v = await validate({ req, identity, url: req.fetch_url || m.fetch_url || m.urls[0], laneHint: 'hekimler', projections, existingRecord: record, trace });
    if (v.stop) return finish(trace, { ok: false, op, source_id: m.source_id, ...v.stop, gates: { ...gates, ...v.stop.gates } });
    const safe = v.capacity.status === 'SAFE';
    const commit = commitCanonical({
      root, file: m.file, apply, actor, authorize, op,
      mutate: (data) => {
        const rec = getAt(data, m.path);
        const next = v.profile;
        const archived = clearRetirement(next);
        if (!safe) {
          next.runtime_activation = ACTIVATION.MANUAL;
          next.manual_intake_reason = `CAPACITY_${v.capacity.status}: ${(v.capacity.reasons || []).join('; ')}`.slice(0, 300);
        }
        pushHistory(next, { op, request_id: req.request_id, at: clock(), outcome: safe ? 'ACTIVE' : 'READY', by: actor.id, ...(Object.keys(archived).length ? { archived } : {}), ...(previous ? { previous } : {}) });
        for (const k of Object.keys(rec)) delete rec[k];
        Object.assign(rec, next);
        return { op: 'patch', source_id: m.source_id, path: m.path, runtime_activation: next.runtime_activation, cadence: v.cadence.poll_minutes };
      },
    });
    return finish(trace, {
      ok: commit.outcome !== 'DENIED',
      op,
      outcome: commit.outcome === 'APPLIED' ? (safe ? 'ACTIVE' : 'BLOCKED_CAPACITY') : commit.outcome === 'DENIED' ? 'DENIED' : `${safe ? 'ACTIVE' : 'BLOCKED_CAPACITY'}_DRY_RUN`,
      activation: commit.outcome === 'APPLIED' ? (safe ? 'ACTIVE' : 'READY (MANUAL_INTAKE until capacity SAFE)') : 'NOT_WRITTEN',
      identity_preserved: true,
      gates: { ...gates, ...v.gates },
      ...summary(v),
      commit: { outcome: commit.outcome, file: commit.file, ...(commit.code ? { code: commit.code } : {}) },
      ...(commit.outcome === 'APPLIED' ? { regenerate: regenerateSteps() } : {}),
    });
  }

  function resolveOne(target, trace) {
    const req = normalizeRequest(target, { now: clock() });
    const projections = loadProjections(root);
    const identity = resolveIdentity(req, projections);
    trace.identity = { outcome: identity.outcome, match: identity.match && compactProjection(identity.match), candidates: identity.candidates };
    return { req, projections, identity };
  }

  // ---------- REACTIVATE ---------------------------------------------------------------------------------------------
  async function reactivate(target, { apply = false, requestTrace = null } = {}) {
    const trace = requestTrace || { request_id: normalizeRequest(target, { now: clock() }).request_id, op: 'reactivate', input: { raw: target, apply }, actor, phases: [{ phase: 'REQUESTED', at: clock() }] };
    trace.op = requestTrace ? 'add->reactivate' : 'reactivate';
    const { req, projections, identity } = resolveOne(target, trace);
    const gates = { REQUEST: 'PASS', IDENTITY: identity.outcome === 'EXISTING' ? 'PASS' : 'NEEDS_USER_DECISION' };
    if (identity.outcome !== 'EXISTING') return finish(trace, { ok: false, op: 'reactivate', outcome: identity.outcome === 'AMBIGUOUS' ? 'NEEDS_USER_DECISION' : 'NOT_FOUND', question: identity.question, candidates: identity.candidates, gates });
    const m = identity.match;
    const state = stateOf(m);
    if (state === 'ACTIVE') return finish(trace, { ok: true, op: 'reactivate', outcome: 'ALREADY_ACTIVE', source_id: m.source_id, gates });
    if (state !== 'RETIRED') return finish(trace, { ok: false, op: 'reactivate', outcome: 'NOT_RETIRED', source_id: m.source_id, state, next_step: `use: add ${m.source_id}`, gates });
    if (m.store !== 'hekimler') {
      const change = prepareKaduseChange({ root, op: 'reactivate', target: m, apply, actor, authorize, requestId: trace.request_id, sync: opts.kaduseSync });
      return finish(trace, { ok: kaduseOk(change), op: 'reactivate', source_id: m.source_id, gates, ...kaduseResult(change) });
    }
    return activateExisting({ req: { ...req, url: null, fetch_url: null }, identity, projections, trace, gates, apply, op: 'reactivate', previous: { state: 'RETIRED' } });
  }

  // ---------- RETIRE -------------------------------------------------------------------------------------------------
  async function retire(target, { reason = 'operator: source no longer used', apply = false } = {}) {
    const trace = { request_id: normalizeRequest(target, { now: clock() }).request_id, op: 'retire', input: { raw: target, reason, apply }, actor, phases: [{ phase: 'REQUESTED', at: clock() }] };
    const { projections, identity } = resolveOne(target, trace);
    if (identity.outcome === 'AMBIGUOUS') return finish(trace, { ok: false, op: 'retire', outcome: 'NEEDS_USER_DECISION', question: identity.question, candidates: identity.candidates });
    if (identity.outcome !== 'EXISTING') return finish(trace, { ok: false, op: 'retire', outcome: 'NOT_FOUND', question: identity.question });
    const m = identity.match;
    const base = { op: 'retire', source_id: m.source_id, remove_semantics: 'RETIRE (not purge)' };
    if (m.retired) return finish(trace, { ok: true, ...base, outcome: 'ALREADY_RETIRED', writes: 0 });

    const hekimler = m.store === 'hekimler';
    const layers = hekimler ? projections.filter((p) => p.source_id === m.source_id) : [m];
    const record = hekimler ? getAt(readRegistry(root, m.file).data, m.path) : null;
    const artifacts = classifyArtifacts({ root, projection: m, record, projections, files: opts.files || null });
    const inflight = inflightPlan(m, trace.request_id);
    const at = clock();

    if (!hekimler) {
      const change = prepareKaduseChange({ root, op: 'retire', target: m, apply, actor, authorize, requestId: trace.request_id, sync: opts.kaduseSync });
      return finish(trace, {
        ok: kaduseOk(change), ...base, ...kaduseResult(change),
        steps: {
          O1_stop_new_fetches: change.migration ? [`catalog ${change.patch?.field}: ${change.patch?.before} -> ${change.patch?.after}`, 'config/feeds.json regenerated by scripts/sync-feeds.mjs', `forward migration ${change.migration}`] : change.reason,
          O2_inflight: inflight,
          O3_tombstone: 'catalog record stays (identity, URL, role); only enabled/subscription state changes',
          O5_artifacts: artifacts,
          O6_provenance_preserved: PRESERVED,
          O7_purge: 'not performed (separate explicit purge-plan command)',
        },
      });
    }

    const commits = [];
    for (const layer of layers) {
      commits.push(commitCanonical({
        root, file: layer.file, apply, actor, authorize, op: 'retire',
        mutate: (data) => {
          const rec = getAt(data, layer.path);
          const next = retirementPatch(rec, { reason, at, changeRef: `source-lifecycle:${trace.request_id}` });
          pushHistory(next, { op: 'retire', request_id: trace.request_id, at, outcome: 'RETIRED', by: actor.id, reason });
          for (const k of Object.keys(rec)) delete rec[k];
          Object.assign(rec, next);
          return { op: 'patch', path: layer.path, status: 'retired', runtime_activation: 'BLOCKED' };
        },
      }));
    }
    const applied = commits.every((c) => c.outcome === 'APPLIED');
    let verification = null;
    if (applied && bridge) {
      const rec = getAt(readRegistry(root, m.file).data, m.path);
      const g = bridge.gates(rec);
      verification = { computed_activation: g.computed, scheduler_selects: g.computed === ACTIVATION.READY };
    }
    trace.phases.push({ phase: 'RETIRED', at: clock() });
    const denied = commits.find((c) => c.outcome === 'DENIED');
    return finish(trace, {
      ok: !denied,
      ...base,
      outcome: applied ? 'RETIRED' : denied ? 'DENIED' : commits.some((c) => c.outcome === 'REQUIRES_MANUAL_EDIT') ? 'REQUIRES_MANUAL_EDIT' : 'RETIRED_DRY_RUN',
      steps: {
        O1_stop_new_fetches: { patch: 'status=retired, runtime_activation=BLOCKED, fetch/scheduled/candidate/pipeline flags=false', verification },
        O2_inflight: inflight,
        O3_tombstone: { kept: ['source_id', 'name', 'canonical_url', 'source_url', 'allowed_hostnames', 'source_tier', 'allowed_routes', 'former_status', 'former_runtime_activation'], added: ['retired_reason', 'retired_at', 'retired_change_ref', 'lifecycle_history[]'] },
        O4_runtime_detach: { scheduler_eligibility: 'removed (compute_activation_state -> BLOCKED for status=retired)', regenerate: regenerateSteps() },
        O5_artifacts: artifacts,
        O6_provenance_preserved: PRESERVED,
        O7_purge: 'not performed (separate explicit purge-plan command)',
      },
      commits: commits.map((c) => ({ outcome: c.outcome, file: c.file, ...(c.code ? { code: c.code } : {}) })),
    });
  }

  // ---------- INSPECT / RECALIBRATE / PURGE-PLAN ---------------------------------------------------------------------
  function inspect(target) {
    const trace = { request_id: 'inspect', op: 'inspect', phases: [] };
    const { identity } = resolveOne(target, trace);
    if (identity.outcome !== 'EXISTING') return { ok: false, op: 'inspect', outcome: identity.outcome === 'AMBIGUOUS' ? 'NEEDS_USER_DECISION' : 'NOT_FOUND', question: identity.question, candidates: identity.candidates };
    const m = identity.match;
    return {
      ok: true,
      op: 'inspect',
      outcome: 'FOUND',
      source: { ...compactProjection(m), state: stateOf(m), lane: m.lane, channelId: LANES[m.lane].channelId, status: m.status, runtime_activation: m.runtime_activation, cadence_minutes: m.cadence_min, record: m.layers },
      observability: OBSERVABILITY,
    };
  }

  async function recalibrate(target, { apply = false } = {}) {
    const trace = { request_id: normalizeRequest(`recal:${target}`, { now: clock() }).request_id, op: 'recalibrate', input: { raw: target, apply }, actor, phases: [] };
    const { identity } = resolveOne(target, trace);
    if (identity.outcome !== 'EXISTING') return finish(trace, { ok: false, op: 'recalibrate', outcome: 'NOT_FOUND' });
    const m = identity.match;
    if (m.store !== 'hekimler' || !m.active) return finish(trace, { ok: false, op: 'recalibrate', outcome: 'NOT_APPLICABLE', source_id: m.source_id, reason: m.store !== 'hekimler' ? 'Kaduse cadence is generator-assigned (sync-feeds.mjs)' : 'source is not ACTIVE' });
    const disc = await discoverEndpoint({ url: m.fetch_url || m.urls[0], lane: 'hekimler', fetcher });
    if (disc.gate !== 'PASS') return finish(trace, { ok: false, op: 'recalibrate', outcome: disc.gate, reason: disc.reason, source_id: m.source_id });
    const feed = disc._feed ? parseFeed(disc._feed.body) : [];
    const list = extractListPage(disc._page.body, disc._page.url);
    const ts = (feed.length ? feed : list).map((i) => i.published_at).filter(Boolean);
    const derived = deriveCadence({ timestamps: ts, lane: 'hekimler', heading: m.heading, now: clock(), evidenceSource: feed.length ? 'feed_published' : 'list_page_dates' });
    const proposal = recalibration(m.cadence_min, derived);
    if (proposal.outcome !== 'PROPOSAL' || !apply) return finish(trace, { ok: true, op: 'recalibrate', source_id: m.source_id, outcome: proposal.outcome === 'PROPOSAL' ? 'PROPOSAL' : proposal.outcome, proposal, writes: 0 });
    if (proposal.patch.after < proposal.patch.before) {
      const cap = bridge ? bridge.capacity({ addCadence: proposal.patch.after, history }) : { status: 'BLOCK' };
      if (cap.status !== 'SAFE') return finish(trace, { ok: false, op: 'recalibrate', source_id: m.source_id, outcome: 'BLOCKED_CAPACITY', capacity: cap, proposal });
    }
    if (m.layers.length !== 1) return finish(trace, { ok: false, op: 'recalibrate', source_id: m.source_id, outcome: 'BLOCKED_TECHNICAL', reason: 'MULTI_LAYER_RECORD' });
    const commit = commitCanonical({
      root, file: m.file, apply, actor, authorize, op: 'recalibrate',
      mutate: (data) => {
        const rec = getAt(data, m.path);
        rec.fetch_plan = { ...(rec.fetch_plan || {}), expected_check_interval_minutes: proposal.patch.after };
        rec.cadence_policy = { strategy: 'RECALIBRATED_REVIEWED', bounds: derived.bounds, confidence: derived.confidence, evidence: derived.evidence, flags: derived.flags };
        pushHistory(rec, { op: 'recalibrate', request_id: trace.request_id, at: clock(), outcome: 'ACTIVE', by: actor.id, cadence: proposal.patch });
        return proposal.patch;
      },
    });
    return finish(trace, { ok: commit.outcome === 'APPLIED', op: 'recalibrate', source_id: m.source_id, outcome: commit.outcome === 'APPLIED' ? 'RECALIBRATED' : commit.outcome, proposal, commit: { outcome: commit.outcome, file: commit.file, ...(commit.code ? { code: commit.code } : {}) } });
  }

  function purge(target) {
    const trace = { request_id: 'purge-plan', op: 'purge-plan', phases: [] };
    const { projections, identity } = resolveOne(target, trace);
    if (identity.outcome !== 'EXISTING') return { ok: false, op: 'purge-plan', outcome: 'NOT_FOUND' };
    const m = identity.match;
    const record = m.store === 'hekimler' ? getAt(readRegistry(root, m.file).data, m.path) : null;
    const artifacts = classifyArtifacts({ root, projection: m, record, projections, files: opts.files || null });
    return { ok: true, op: 'purge-plan', source_id: m.source_id, outcome: 'PLAN_ONLY', purge: purgePlan(m, artifacts), writes: 0 };
  }

  return { add, retire, reactivate, inspect, recalibrate, purgePlan: purge, authorizeLifecycle };
}
