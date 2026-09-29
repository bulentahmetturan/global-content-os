// Happy + failure-path scenarios with the expected terminal outcome. Adapters may be swapped at reconciliation;
// expectations describe the CONTRACT behaviour (docs/approved-brief-handoff.md), not the simulation.
import { runScenario } from './harness.mjs';

export const SCENARIOS = [
  { id: 'happy_path', expect: { terminal: 'ready', jobs: 1, finalBriefStatus: 'ready', callback: 'delivered' } },
  { id: 'fetch_failure', faults: { fetch: true }, expect: { terminal: 'fetch_failed', jobs: 0, briefsSent: 0 } },
  { id: 'parse_failure', faults: { parse: true }, expect: { terminal: 'parse_failed', jobs: 0, briefsSent: 0 } },
  { id: 'duplicate_item', options: { repeatSource: true }, expect: { terminal: 'deduplicated', jobs: 1, briefsSent: 1 } },
  { id: 'rejected_candidate', faults: { reject: true }, expect: { terminal: 'rejected', jobs: 0, briefsSent: 0 } },
  { id: 'invalid_approved_brief', faults: { invalidBrief: true }, expect: { terminal: 'handoff_invalid_brief', jobs: 0, ccosStatus: [400] } },
  { id: 'duplicate_approved_brief', options: { presentTwice: true }, expect: { terminal: 'ready', jobs: 1, ccosStatus: [201, 200] } },
  { id: 'ccos_unavailable', faults: { ccosDown: true }, expect: { terminal: 'ccos_unavailable_retry_pending', jobs: 0 } },
  { id: 'ccos_unavailable_then_recovers', faults: { ccosDown: true }, options: { retryAfterRecovery: true }, expect: { terminal: 'ready', jobs: 1, ccosStatus: [503, 201] } },
  { id: 'render_failure', faults: { render: true }, expect: { terminal: 'render_failed', jobs: 1, finalBriefStatus: 'failed' } },
  { id: 'qa_failure', faults: { qa: true }, expect: { terminal: 'qa_failed', jobs: 1, finalBriefStatus: 'failed' } },
  { id: 'status_callback_failure', faults: { callback: true }, expect: { terminal: 'ready', jobs: 1, callback: 'failed', callbackErrorRecorded: true } },
  { id: 'auth_failure_bad_token', options: { wrongToken: true }, expect: { terminal: 'handoff_rejected_401', jobs: 0, ccosStatus: [401] } },
  { id: 'auth_failure_unconfigured_fails_closed', faults: { tokenUnset: true }, expect: { terminal: 'handoff_rejected_503', jobs: 0, ccosStatus: [503] } },
];

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Run all scenarios (optionally with substituted adapters factory) and report expectation matches. */
export function runAll({ adapterFactory = null } = {}) {
  const results = SCENARIOS.map((s) => {
    const r = runScenario(s, adapterFactory ? adapterFactory() : null);
    const misses = Object.entries(s.expect).filter(([k, v]) => !eq(r.outcome[k], v)).map(([k, v]) => `${k}: expected ${JSON.stringify(v)} got ${JSON.stringify(r.outcome[k])}`);
    return { id: s.id, ok: misses.length === 0, misses };
  });
  return { total: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).map((r) => r.id), results };
}
