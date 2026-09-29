// Hub decision → unified editorial feedback input.
// Copies only fields the candidate already has. Does not write canonical rules.
const REASON_OBSERVATION = {
  off_topic: 'LOW_RELEVANCE',
  not_relevant_for_channel: 'LOW_RELEVANCE',
  wrong_category: 'WRONG_CONTENT_FAMILY',
  promotional: 'WRONG_AUDIENCE',
  duplicate: 'DUPLICATE_STORY',
};

function copyIfString(target, key, value) {
  if (typeof value === 'string' && value.length > 0) target[key] = value;
}

/**
 * @param {{id: string, channel_id?: string, source_id?: string, topic?: string, content_family?: string}} item
 * @param {{action: 'promote'|'delete', reason_code?: string, at: string}} decision
 */
export function editorialFeedbackInput(item, decision) {
  const accepted = decision.action === 'promote';
  const data = {};
  copyIfString(data, 'candidate_id', item.id);
  copyIfString(data, 'channel_id', item.channel_id);
  copyIfString(data, 'source_id', item.source_id);
  copyIfString(data, 'topic', item.topic);
  copyIfString(data, 'content_family', item.content_family);
  data.decision = accepted ? 'accepted' : 'rejected';
  if (!accepted) copyIfString(data, 'reason_code', decision.reason_code);
  copyIfString(data, 'timestamp', decision.at);
  const code = accepted ? 'CANDIDATE_ACCEPTED' : (REASON_OBSERVATION[decision.reason_code] ?? 'CANDIDATE_REJECTED');
  return {
    feedback_type: 'EDITORIAL_FEEDBACK',
    origin_system: 'human',
    subject_type: 'candidate',
    subject_id: item.id,
    timestamp: decision.at,
    channel_scope: item.channel_id ? { kind: 'channel', channel_id: item.channel_id } : { kind: 'GLOBAL' },
    observation: { code },
    evidence: { refs: [{ kind: 'candidate', id: item.id }], data },
    ...(item.source_id ? { correlation: { source_id: item.source_id } } : {}),
  };
}
