const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,160}$/.test(value) ? value : undefined;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) ? value : undefined;
const finite = value => Number.isFinite(value) ? value : undefined;
const bool = value => typeof value === 'boolean' ? value : undefined;
const pick = (source, fields) => Object.fromEntries(fields.flatMap(([key, valid]) => {
  const value = source?.[key];
  const safe = valid(value);
  return safe === undefined ? [] : [[key, safe]];
}));
const strings = value => Array.isArray(value) ? value.map(identifier).filter(Boolean) : undefined;
const alert = value => pick(value, [
  ['severity', identifier], ['source', identifier], ['code', identifier], ['since', timestamp],
]);
const alertList = value => Array.isArray(value) ? value.slice(0, 100).map(alert) : undefined;

function projectSummary(body) {
  if (body?.ok !== true || !body.global || !Array.isArray(body.sources) || !Array.isArray(body.alerts)) return null;
  return {
    ok: true,
    generated_at: timestamp(body.generated_at),
    profile: identifier(body.profile),
    global: pick(body.global, [
      ['env_switch', bool], ['recurring_enabled', bool], ['candidate_persistence', bool], ['capacity_verified', bool],
      ['capacity_blockers', strings],
    ]),
    sources: body.sources.slice(0, 50).map(source => pick(source, [
      ['reader_id', identifier], ['canonical_source_id', identifier], ['signal_family', identifier], ['state', identifier],
      ['state_reason', identifier], ['state_since', timestamp], ['next_due_at', timestamp], ['due', bool],
      ['last_success_at', timestamp], ['consecutive_failures', finite], ['last_failure_class', identifier],
      ['circuit', identifier], ['stale_for_ms', finite], ['backlog_token_present', bool], ['backlog_growing', bool],
      ['active_run', value => value === null || typeof value === 'boolean' ? value : undefined],
      ['alerts', alertList],
    ])),
    last_runs: Array.isArray(body.last_runs) ? body.last_runs.slice(0, 20).map(run => pick(run, [
      ['run_id', identifier], ['reader_id', identifier], ['kind', identifier], ['status', identifier], ['phase', identifier],
      ['invocations', finite], ['statements_used', finite], ['items_seen', finite], ['items_total', finite], ['items_new', finite],
      ['concepts_derived', finite], ['watch', finite], ['promotion_eligible', finite], ['platform_terminations', finite],
      ['created_at', timestamp], ['finished_at', timestamp],
    ])) : [],
    alerts: alertList(body.alerts),
    worst_severity: identifier(body.worst_severity),
  };
}

function projectRuns(body) {
  if (body?.ok !== true || !Array.isArray(body.runs)) return null;
  return { ok: true, runs: body.runs.slice(0, 50).map(run => pick(run, [
    ['run_id', identifier], ['reader_id', identifier], ['kind', identifier], ['status', identifier], ['phase', identifier],
    ['invocations', finite], ['statements_used', finite], ['items_seen', finite], ['items_total', finite], ['items_new', finite],
    ['concepts_derived', finite], ['watch', finite], ['promotion_eligible', finite], ['platform_terminations', finite],
    ['created_at', timestamp], ['finished_at', timestamp],
  ])) };
}

function projectAudit(body) {
  if (body?.ok !== true || !Array.isArray(body.audit)) return null;
  return { ok: true, audit: body.audit.slice(0, 50).map(event => pick(event, [
    ['event', identifier], ['key', identifier], ['from', identifier], ['to', identifier], ['at', timestamp],
  ])) };
}

export function classifyOperatorResponse(status, contentType, jsonValid) {
  if (status === 401 || status === 403) return 'AUTHENTICATION_DENIED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'REMOTE_FAILURE';
  if (status < 200 || status >= 300) return 'HTTP_REJECTED';
  if (!contentType?.toLowerCase().includes('application/json')) return 'NON_JSON_RESPONSE';
  if (!jsonValid) return 'INVALID_JSON';
  return 'SUCCESS';
}

export function projectOperatorEvidence(path, body) {
  path = path.split('?')[0];
  if (path === '/api/ops/summary') {
    if (body?.service !== 'global-content-os' || !body.readiness || !Array.isArray(body.signals)) return null;
    return {
      service: 'global-content-os',
      generatedAt: timestamp(body.generatedAt),
      readiness: pick(body.readiness, [['level', identifier], ['blocked', strings], ['degraded', strings]]),
      identity: pick(body.identity, [
        ['service', identifier], ['environment', identifier], ['commit', identifier], ['identityStamped', bool],
        ['expectedSchema', identifier], ['appliedMigration', identifier],
      ]),
      signals: body.signals.slice(0, 100).map(signal => pick(signal, [['id', identifier], ['class', identifier]])),
      highestAlert: identifier(body.highestAlert),
      handoffs: body.handoffs && typeof body.handoffs === 'object' ? pick(body.handoffs, [
        ['byStatus', value => value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).slice(0, 20).filter(([key, count]) => identifier(key) && finite(count) !== undefined)) : undefined],
        ['approved24h', finite], ['failed24h', finite], ['maxAttempts', finite], ['statusCallbacksReceived24h', finite],
      ]) : null,
    };
  }
  if (path === '/api/dossier/ops/summary') return projectSummary(body);
  if (path === '/api/dossier/ops/alerts') {
    if (body?.ok !== true || !Array.isArray(body.alerts)) return null;
    return { ok: true, generated_at: timestamp(body.generated_at), worst_severity: identifier(body.worst_severity), alerts: alertList(body.alerts) };
  }
  if (path === '/api/dossier/ops/audit') return projectAudit(body);
  if (path.startsWith('/api/dossier/ops/runs')) return projectRuns(body);
  return null;
}
