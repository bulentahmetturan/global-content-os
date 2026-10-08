type DiscoveryLink = {
  intent_id: string;
  candidate_id: string;
  domain: 'DOCTOR' | 'PROTOCOL';
  canonical_entity_id: string;
  definition_claim_id: string | null;
  source_id: string;
  source_role: string;
  pipeline_stage: 'ONBOARDING' | 'PIPELINE_ACTIVE' | 'PRODUCTION_ACTIVE';
  candidate_state: string;
};

function eventId(): string {
  return `onboarding_event_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

async function linkProtocolEvidence(
  db: D1Database,
  link: DiscoveryLink,
  itemId: string,
): Promise<void> {
  if (!link.definition_claim_id) throw new Error('DISCOVERY_PROTOCOL_DEFINITION_CLAIM_MISSING');
  const evidenceApi = await import('../protocols/evidence');
  const evidenceId = `ev_discovery_${encodeURIComponent(link.intent_id)}_${encodeURIComponent(link.source_id)}`;
  const locator = `discovery-source:${link.source_role}`;
  let evidence = (await evidenceApi.listSourceItemEvidence(db, itemId))
    .find((item) => item.locator === locator);
  if (!evidence) {
    evidence = await evidenceApi.createEvidence(db, {
      evidence_id: evidenceId,
      source_item_id: itemId,
      locator,
    });
  }
  const links = await evidenceApi.listEvidenceClaims(db, evidence.evidence_id);
  if (!links.some((item) => item.claim_id === link.definition_claim_id)) {
    await evidenceApi.createClaimEvidenceLink(db, {
      claim_id: link.definition_claim_id,
      evidence_id: evidence.evidence_id,
      direction: 'CONTEXT',
    });
  }
}

export async function recordDiscoveryHubItem(
  db: D1Database,
  sourceId: string | null | undefined,
  itemId: string,
  route: string,
): Promise<void> {
  if (!sourceId) return;
  const routed = await db.prepare(
    'SELECT 1 AS ok FROM source_routes WHERE source_item_id = ? AND route = ? LIMIT 1',
  ).bind(itemId, route).first<{ ok: number }>();
  const item = await db.prepare(
    'SELECT 1 AS ok FROM source_items WHERE id = ? AND route = ? LIMIT 1',
  ).bind(itemId, route).first<{ ok: number }>();
  if (!routed || !item) return;
  const matches = await db.prepare(
    `SELECT i.intent_id, i.candidate_id, i.domain, i.canonical_entity_id,
            i.definition_claim_id, i.pipeline_stage, s.source_id, s.source_role,
            c.state AS candidate_state
       FROM onboarding_intents i
       JOIN candidate_ledger c ON c.candidate_id = i.candidate_id
       JOIN onboarding_intent_sources s ON s.intent_id = i.intent_id
       WHERE i.canonical_entity_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM onboarding_source_events e
            WHERE e.intent_id = i.intent_id AND e.source_id = s.source_id AND e.outcome = 'ACTIVE'
         )
         AND (
           s.source_id = ? OR
           (i.domain = 'DOCTOR' AND EXISTS (
             SELECT 1 FROM actor_source_associations a
             JOIN actor_source_endpoints ep ON ep.endpoint_id = a.endpoint_id
              WHERE a.actor_id = i.canonical_entity_id
                AND (ep.endpoint_id = ? OR ep.shared_source_ref = ?)
                AND ep.shared_source_ref = s.source_id
           ))
         )
       ORDER BY i.intent_id, s.source_id`,
  ).bind(sourceId, sourceId, sourceId).all<DiscoveryLink>();

  for (const link of matches.results) {
    if (link.domain === 'PROTOCOL') await linkProtocolEvidence(db, link, itemId);
    await db.prepare(
      `INSERT OR IGNORE INTO onboarding_source_events
       (event_id, intent_id, source_id, outcome, lifecycle_result_json, evidence_ref)
       VALUES (?, ?, ?, 'PIPELINE_INGESTED', ?, ?)` ,
    ).bind(eventId(), link.intent_id, link.source_id, JSON.stringify({ itemId, route }), itemId).run();
    const coverage = await db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN s.source_disposition = 'ACTIVATE' AND EXISTS (
                SELECT 1 FROM onboarding_source_events e
                 WHERE e.intent_id = s.intent_id AND e.source_id = s.source_id AND e.outcome = 'ACTIVE'
              ) THEN 1 ELSE 0 END) AS active
         FROM onboarding_intent_sources s WHERE s.intent_id = ?`,
    ).bind(link.intent_id).first<{ total: number; active: number }>();
    const completeCoverage = (coverage?.total ?? 0) > 0 && coverage?.total === coverage?.active;
    await db.prepare(
      `UPDATE onboarding_intents
          SET pipeline_stage = 'PIPELINE_ACTIVE',
              status = CASE WHEN ? = 1 THEN 'PIPELINE_ACTIVE' ELSE 'PARTIAL_SOURCE_COVERAGE' END,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE intent_id = ? AND pipeline_stage = 'ONBOARDING'`,
    ).bind(completeCoverage ? 1 : 0, link.intent_id).run();
    if (completeCoverage && link.candidate_state === 'ONBOARDING') {
      await db.prepare(
        `UPDATE candidate_ledger SET state = 'PIPELINE_ACTIVE',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE candidate_id = ? AND state = 'ONBOARDING'`,
      ).bind(link.candidate_id).run();
    }

    await db.prepare(
      `INSERT OR IGNORE INTO onboarding_source_events
       (event_id, intent_id, source_id, outcome, lifecycle_result_json, evidence_ref)
       VALUES (?, ?, ?, 'HUB_ITEM_CREATED', ?, ?)` ,
    ).bind(eventId(), link.intent_id, link.source_id, JSON.stringify({ itemId, route, hubItem: true }), itemId).run();
    await db.prepare(
      `UPDATE onboarding_intents
          SET pipeline_stage = 'PRODUCTION_ACTIVE',
              status = CASE WHEN ? = 1 THEN 'PRODUCTION_ACTIVE' ELSE 'PARTIAL_SOURCE_COVERAGE' END,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE intent_id = ? AND pipeline_stage != 'PRODUCTION_ACTIVE'`,
    ).bind(completeCoverage ? 1 : 0, link.intent_id).run();
    if (completeCoverage) {
      await db.prepare(
        `UPDATE candidate_ledger SET state = 'PRODUCTION_ACTIVE',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE candidate_id = ? AND state = 'PIPELINE_ACTIVE'`,
      ).bind(link.candidate_id).run();
    }
  }
}

export async function recordDiscoveryHubItemBestEffort(
  db: D1Database,
  sourceId: string | null | undefined,
  itemId: string,
  route: string,
): Promise<void> {
  try {
    await recordDiscoveryHubItem(db, sourceId, itemId, route);
  } catch (error) {
    console.error('DISCOVERY_PIPELINE_PROGRESS_FAILED', { sourceId, itemId, route, error });
  }
}
