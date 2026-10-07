# Future production operation — integrated bootstrap + audit-only canary (NOT EXECUTED)

Status: PLAN ONLY against the R2.1 live-baseline release
(`r2-integrated-doctor-protocol-0041`, integrated commit on
`release/r2-live-0041`). Executes only under a separate explicit owner
authorization naming the association AND the release SHA. No fetch, no
parser, no ingestion, no items, no editorial output, no second identity.

## Baseline this plan was proven against

- Integrated release: Doctor control plane (bootstrap + activation + audit,
  byte-identical to frozen R1/d6e2325) on the live 0041 production baseline
  (e6ec142: medikalnews 0041 feed activation included, untouched).
- Readiness EXPECTED 0041 = newest migration; zero pending from the tree.
- Production at proof time: ledger 0041, zero Doctor rows. Re-verify both
  immediately before executing; any drift aborts the canary.

## Identity under test (fixed, allowlist-keyed)

- Key: `ahmet-ekmekci-official-website`
- Actor: Ahmet Ekmekçi, TURKEY_EXPERT_PANEL
- Endpoint: OFFICIAL_WEBSITE `https://ahmetekmekci.com`
- Association: OFFICIAL_PERSONAL
- Abort if the allowlist entry in the deployed code differs by any field.

## Sequence

A. Verify production ledger still equals 0041 (release newest).
B. CODE-ONLY DEPLOY the frozen R2.1 SHA (zero migrations pending).
C. Verify `/api/health` commit, `/api/ready` READY, appliedMigration 0041.
D. Verify production Doctor counts are all zero (bounded metadata reads).
E. BOOTSTRAP `{"identityKey": "ahmet-ekmekci-official-website",
   "reason": "<why>"}` — expect 200, all three `created`.
F. Verify one actor / one endpoint / one OFFICIAL_PERSONAL association.
G. Verify NOT_INGESTABLE (`latestIngestability: null`), zero activation
   activity.
H. ACTIVATE with technical evidence + reason — expect 200 INGESTABLE.
I. GET audit — expect activation evaluation + activity row.
J. Verify INGESTABLE and append-only evidence ids.
K. DISABLE with reason — expect 200 NOT_INGESTABLE.
L. GET audit.
M. Verify NOT_INGESTABLE latest with complete ordered history.
N. Prove forbidden-table non-mutation (feeds incl. the 0041 medikalnews
   row, items, briefs, protocols, scheduler state all unchanged except the
   six Doctor identity/audit rows for this association).
O. STOP. Report ids, counts, timestamps; change nothing else.

## Abort conditions (stop, do not improvise)

Any 4xx/5xx outside the runbook table; any history row that changes; any
write outside the six Doctor rows for this association; any fetch/parser/
item/editorial/scheduler activity; any second identity; any ledger drift
discovered in A–D.
