// Canonical-owner ledger for relevance adjustments. Separate from the feedback store.
// AUTONOMOUS_RULE_MUTATION=0: this module refuses every caller who is not an authorized owner,
// and it never receives a path that writes the feedback event.
import { createHash } from 'node:crypto';
import { rankCandidates } from './relevance-selection.mjs';

const GCOS_OWNER = 'global-content-os';
const SELECTION = {
  LOWER_TOPIC_PRIORITY: ['topic', 'lower'],
  RAISE_TOPIC_PRIORITY: ['topic', 'raise'],
  LOWER_CONTENT_FAMILY_PRIORITY: ['content_family', 'lower'],
  RAISE_CONTENT_FAMILY_PRIORITY: ['content_family', 'raise'],
  LOWER_SOURCE_PRIORITY: ['source', 'lower'],
};
const REVIEW_ONLY = new Set(['SOURCE_REVALIDATION', 'QUERY_REFINEMENT', 'DUPLICATE_RULE_REVIEW', 'REVIEW_SOURCE', 'REVALIDATE']);
const CCOS_ONLY = new Set(['REVIEW_LAYOUT_RULE', 'REVIEW_FORMAT_PROFILE', 'REVIEW_QA_GATE', 'REVIEW_BRAND_RULE', 'ADD_CONTENT_SHAPE_SUPPORT', 'REVIEW_AUDIENCE_POLICY']);

const deny = (code, detail) => ({ ok: false, code, ...(detail ? { detail } : {}) });

function idFor(parts) {
  return `adj_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

export function createRelevanceLedger({ authorize, rows: initial = [] } = {}) {
  const rows = initial.map((r) => ({ ...r }));

  function gate(owner, action) {
    if (typeof authorize !== 'function') return deny('AUTH_FAIL_CLOSED', 'authorize is required');
    let allowed = false;
    try {
      allowed = authorize(owner, action) === true;
    } catch {
      allowed = false;
    }
    if (!allowed || owner?.kind !== 'canonical_owner') return deny('AUTH_FAIL_CLOSED', 'canonical owner authorization required');
    return null;
  }

  function apply(req) {
    const denied = gate(req.owner, 'apply_relevance');
    if (denied) return denied;
    const { feedback, proposal, pattern, owner, delta = 20, why } = req;
    if (owner.id !== GCOS_OWNER) return deny('FEEDBACK_CANONICAL_OWNER_BOUNDARY', 'relevance selection is owned by global-content-os');
    if (!feedback || feedback.review_state !== 'ACCEPTED') return deny('NOT_ACCEPTED');
    if (feedback.reviewed_by?.kind !== 'human' && feedback.reviewed_by?.kind !== 'review_gate') return deny('NOT_REVIEWED');
    if (!proposal || proposal.status !== 'PROPOSAL') return deny('NOT_A_PROPOSAL');
    if (CCOS_ONLY.has(proposal.action)) return deny('FEEDBACK_CANONICAL_OWNER_BOUNDARY', 'channel production rules are owned by channel-content-os');
    if (feedback.proposed_adjustment?.action !== proposal.action) return deny('ACTION_MISMATCH');
    const minCount = Number.isInteger(req.minCount) ? req.minCount : 3;
    if (!pattern || !Number.isInteger(pattern.count) || pattern.count < minCount) return deny('ONE_SHOT_POLICY_MUTATION');
    if (feedback.channel_scope?.kind !== 'channel') return deny('CHANNEL_REQUIRED');
    const channel_id = feedback.channel_scope.channel_id;
    if (proposal.channel_id && proposal.channel_id !== channel_id) return deny('CHANNEL_MISMATCH');
    const spec = SELECTION[proposal.action];
    const review = REVIEW_ONLY.has(proposal.action);
    if (!spec && !review) return deny('UNSUPPORTED_ACTION', proposal.action);
    const dimension = spec ? spec[0] : proposal.scope?.dimension;
    const direction = spec ? spec[1] : 'review';
    const key = proposal.scope?.key;
    if (!dimension || !key) return deny('SCOPE_REQUIRED');
    if (spec && proposal.scope.dimension !== dimension) return deny('SCOPE_MISMATCH');
    const previous = rows.find((r) => r.kind === 'apply' && !rows.some((x) => x.kind === 'reversal' && x.reverses_id === r.adjustment_id) && r.channel_id === channel_id && r.dimension === dimension && r.key === key) ?? null;
    const adjustment_id = idFor([feedback.feedback_id, proposal.action, key, String(rows.length)]);
    const change_ref = { system: GCOS_OWNER, kind: 'relevance_adjustment', id: adjustment_id };
    const row = {
      kind: 'apply',
      adjustment_id,
      channel_id,
      dimension,
      key,
      direction,
      delta: direction === 'review' ? 0 : delta,
      previous_ref: previous ? previous.adjustment_id : null,
      why: why ?? proposal.rationale,
      pattern_id: pattern?.pattern_id ?? proposal.pattern_id ?? null,
      approved_by: feedback.reviewed_by,
      change_ref,
      feedback_id: feedback.feedback_id,
      edits_selection: direction !== 'review',
    };
    rows.push(row);
    return { ok: true, adjustment: row, change_ref };
  }

  function reverse(req) {
    const denied = gate(req.owner, 'reverse_relevance');
    if (denied) return denied;
    if (req.owner?.id !== GCOS_OWNER) return deny('FEEDBACK_CANONICAL_OWNER_BOUNDARY');
    const target = rows.find((r) => r.kind === 'apply' && r.adjustment_id === req.adjustment_id);
    if (!target) return deny('NOT_FOUND');
    if (rows.some((r) => r.kind === 'reversal' && r.reverses_id === target.adjustment_id)) return deny('ALREADY_REVERSED');
    const reversal_id = idFor(['reverse', target.adjustment_id]);
    const row = {
      kind: 'reversal',
      adjustment_id: reversal_id,
      reverses_id: target.adjustment_id,
      channel_id: target.channel_id,
      previous_ref: target.adjustment_id,
      why: req.why ?? 'owner reversal',
      approved_by: req.owner,
      change_ref: { system: GCOS_OWNER, kind: 'relevance_reversal', id: reversal_id },
      feedback_id: target.feedback_id,
    };
    rows.push(row);
    return { ok: true, reversal: row };
  }

  return Object.freeze({
    apply,
    reverse,
    rank: (candidates) => rankCandidates(candidates, rows),
    rows: () => rows.map((r) => ({ ...r })),
  });
}
