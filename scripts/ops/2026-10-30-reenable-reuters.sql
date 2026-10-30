-- NOT RUN, NOT NEEDED: Reuters was already re-enabled live by scripts/ops/2026-10-30-source-hardening-live.sql, and the
-- fixed rule ships in 7be690e (live 2026-10-30, contains eb34af1). Kept as a record; the UPDATE is a no-op now.
-- Owner decision 2026-10-29: Reuters Healthcare stays, with a content policy (drug approvals / clinical trials and
-- public health only; apps/worker/src/ingress/source-policy.ts). The catalog has it enabled.
-- The live row was switched off on 2026-10-29 by the low-yield rule (pruneLowYieldSources), which counted 137
-- lane-purity / source-policy deletes and 0 owner decisions. Fixed in eb34af1 (only owner Hub decisions count);
-- run this only after that build is live, otherwise the next :07 / :37 housekeeping tick switches it off again.
-- Reversible: set enabled = 0.
-- Run: node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --remote --file scripts/ops/2026-10-30-reenable-reuters.sql
UPDATE source_feeds SET enabled = 1 WHERE id = 'news-reuters-healthcare-scoped' AND enabled = 0;
