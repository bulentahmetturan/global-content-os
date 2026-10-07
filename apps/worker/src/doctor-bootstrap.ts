/**
 * R1 Phase C — Minimal Doctor bootstrap control plane (non-production work;
 * production invocation needs a separate owner authorization).
 *
 * Registry-keyed (not free-form): the operator sends only a stable
 * identityKey from the frozen APPROVED_BOOTSTRAP_IDENTITIES allowlist plus
 * a reason. All canonical fields come from the allowlist — the request
 * cannot invent persons, URLs, panels, or association types. Unknown keys
 * are rejected. One key per request; no bulk.
 *
 * Composes the frozen D1/D2 store functions (create-or-resolve per entity)
 * so repeats are idempotent and never duplicate canonical rows. Writes
 * identity/association tables only — never activity, ingestability,
 * items, feeds, briefs, protocol, or scheduler state. Bootstrap never
 * implies activation (no evaluation is recorded; latest stays null).
 */

import { createActor, lookupCandidates, normalizeActorName } from './actors/registry';
import { createEndpoint, findEndpointByLocator, linkActorToSource, listActorsForSource } from './actors/sources';
import { getLatestIngestability } from './actors/activity';
import type { Env } from './db/queries';

export interface ApprovedBootstrapIdentity {
  identityKey: string;
  canonicalName: string;
  panel: 'TURKEY_EXPERT_PANEL' | 'GLOBAL_EXPERT_PANEL' | 'OTHER_HEALTH_ACTORS';
  countryCode: string | null;
  channelType: string;
  platform: string;
  canonicalLocator: string;
  displayLabel: string;
  associationType: string;
}

/**
 * Frozen approved list. Each entry mirrors the D1–D4 frozen fixture
 * identity byte-for-byte (no file-backed actor registry exists by D1
 * design; the D1 table is canonical). Additions are code review + deploy.
 */
export const APPROVED_BOOTSTRAP_IDENTITIES: readonly ApprovedBootstrapIdentity[] = [
  {
    identityKey: 'ahmet-ekmekci-official-website',
    canonicalName: 'Ahmet Ekmekçi',
    panel: 'TURKEY_EXPERT_PANEL',
    countryCode: null,
    channelType: 'OFFICIAL_WEBSITE',
    platform: 'web',
    canonicalLocator: 'https://www.drahmetekmekci.com',
    displayLabel: 'Ahmet Ekmekçi resmî sitesi',
    associationType: 'OFFICIAL_PERSONAL',
  },
];

export interface BootstrapResult {
  status: number;
  body: unknown;
}

function invalid(reason: string): BootstrapResult {
  return { status: 400, body: { error: reason } };
}

export async function handleDoctorBootstrapOp(env: Env, rawBody: unknown): Promise<BootstrapResult> {
  const started = Date.now();
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return invalid('INVALID_BODY');
  const body = rawBody as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!['identityKey', 'reason'].includes(key)) return invalid('INVALID_BODY');
  }
  const identityKey = typeof body.identityKey === 'string' ? body.identityKey.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!identityKey || identityKey.length > 200) return invalid('INVALID_BODY');
  if (reason.length < 8 || reason.length > 500) return invalid('INVALID_BODY');
  const approved = APPROVED_BOOTSTRAP_IDENTITIES.find((e) => e.identityKey === identityKey);
  if (!approved) return { status: 404, body: { error: 'UNKNOWN_BOOTSTRAP_IDENTITY' } };

  const audit = { by: 'ops:doctor-bootstrap', reason };
  try {
    // Resolve-first (idempotent): exact normalized name + panel, else fail
    // closed on ambiguity; create only on clean no-match.
    const candidates = await lookupCandidates(env.DB, approved.canonicalName);
    const exact = candidates.filter((a) => a.normalized_name === normalizeActorName(approved.canonicalName) && a.panel === approved.panel);
    if (exact.length > 1) return { status: 409, body: { error: 'AMBIGUOUS_ACTOR', detail: 'multiple actors share this identity; resolve manually' } };
    let actorStatus: 'created' | 'existing' = 'existing';
    const actor =
      exact.length === 1
        ? exact[0]
        : await (async () => {
            actorStatus = 'created';
            return createActor(
              env.DB,
              { canonicalName: approved.canonicalName, panel: approved.panel, countryCode: approved.countryCode },
              audit,
            );
          })();

    // Endpoints dedupe by normalized locator: resolve first for an honest
    // created/existing classification.
    const preExisting = await findEndpointByLocator(env.DB, approved.channelType, approved.canonicalLocator);
    const endpoint =
      preExisting ??
      (await createEndpoint(
        env.DB,
        {
          channelType: approved.channelType,
          platform: approved.platform,
          canonicalLocator: approved.canonicalLocator,
          displayLabel: approved.displayLabel,
        },
        audit,
      ));
    const endpointStatus = preExisting ? 'existing' : 'created';

    let associationStatus: 'created' | 'existing' = 'existing';
    let associationId: string;
    try {
      const linked = await linkActorToSource(
        env.DB,
        { actorId: actor.actor_id, endpointId: endpoint.endpoint_id, associationType: approved.associationType },
        audit,
      );
      associationStatus = 'created';
      associationId = linked.association_id;
    } catch (err) {
      if (!/DUPLICATE_ASSOCIATION/i.test(String(err))) throw err;
      const existing = (await listActorsForSource(env.DB, endpoint.endpoint_id)).find(
        (r) => r.actor_id === actor.actor_id,
      );
      if (!existing) throw err;
      associationId = existing.association_id;
    }

    const latest = await getLatestIngestability(env.DB, associationId);
    console.log(
      JSON.stringify({
        event: 'doctor_bootstrap',
        identityKey,
        actorId: actor.actor_id,
        actorStatus,
        endpointId: endpoint.endpoint_id,
        associationId,
        associationStatus,
        ingestable: latest !== null,
        durationMs: Date.now() - started,
      }),
    );
    return {
      status: 200,
      body: {
        ok: true,
        identityKey,
        actor: { actorId: actor.actor_id, status: actorStatus },
        endpoint: { endpointId: endpoint.endpoint_id, status: endpointStatus },
        association: { associationId, status: associationStatus },
        ingestable: latest !== null,
        activationActivityCreated: false,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/OFFICIAL_PERSONAL_CONFLICT/i.test(message)) {
      return { status: 409, body: { error: 'OWNERSHIP_CONFLICT', detail: message.slice(0, 200) } };
    }
    throw err;
  }
}
