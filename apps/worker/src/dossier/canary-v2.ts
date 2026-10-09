/**
 * DOSSIER_CANARY_V2 reader registry (LOCAL; nothing here enables, schedules or deploys anything). The V1 registry (canary-control.ts: ClinicalTrials +
 * OECD) is frozen and unchanged; the second-family reader is registered HERE, so the first canary's invariants cannot move.
 *
 * The runner already accepts an explicit registry (`CanaryDeps.registry`) and the V2 profile (`canary-profile.ts`). Enabling the reader is still a
 * runtime operator control (`reader:<id>:enabled`), the master environment switch, the canary / manual-run controls and a verified platform capacity;
 * none of them is set by this file, and the checked-in registration is always disabled.
 */
import type { DossierReaderRegistration } from './canary-control';
import { EUROSTAT_SIGNAL_FAMILY, EUROSTAT_SOURCE_ID } from './eurostat';

export const EUROSTAT_READER_ID = 'dossier-eurostat-tr-causes-of-death';

export const DOSSIER_READER_REGISTRY_V2: readonly DossierReaderRegistration[] = [
  {
    dossier_reader_id: EUROSTAT_READER_ID,
    // Proposed canonical source id: NOT registered in any GCOS catalog. Registration is a separate source-lifecycle step that needs owner approval.
    canonical_source_id: EUROSTAT_SOURCE_ID,
    signal_family: EUROSTAT_SIGNAL_FAMILY,
    reader_class: 'PUBLIC_DATA_API',
    enabled: false,
    state: 'CANARY_DISABLED',
    canary_profile: 'DOSSIER_CANARY_V2',
    legal_status: 'APPROVED',
    technical_access: 'VERIFIED',
    usage_terms: 'VERIFIED',
    rate_guidance: 'NOT_PUBLISHED',
    access_status: 'PUBLIC_API_NO_KEY_TERMS_VERIFIED_ATTRIBUTION_REQUIRED',
    attribution_profile: 'EUROSTAT',
    runtime_mode: 'MANUAL_ONE_SHOT',
    last_reviewed_at: '2026-10-05',
    blocker: 'SOURCE_LIFECYCLE_REGISTRATION_AND_OWNER_ACTIVATION_PENDING: no catalog source exists for this dataset, the reader is disabled, and enabling it needs an explicit owner decision plus a production preflight.',
    evidence: 'Official Eurostat copyright notice (opened 2026-10-05): reuse of statistical data for commercial or non-commercial purposes is authorised if the source is acknowledged, modifications are stated and a disclaimer is included; the commercial-reuse exception for non-EU data excludes official EU candidate countries (Turkiye). Public JSON-stat API, no key. No rate limit published (none assumed).',
  },
];
