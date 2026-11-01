# Official sources audit — Resmî Gazete, TİTCK (genel + tıbbi cihaz), TÜİK, HSGM (2026-11-01)

Rule used: three Turkish audiences (tıp profesyonelleri, tıp öğrencileri, sağlık takipçisi genel halk) or world-level wow; action lanes follow the announcement rule (dated advance notice = strong accept, outcome = accept, plain news = reject); one source per lane with its own narrow policy.

## Current vs. target

| Source | Before | Problem | After |
|---|---|---|---|
| Resmî Gazete (`resmi_gazete_medical_regulation`, Duyuru) | daily TOC, 20 include words, paths incl. `/ilanlar/` | paid notices and procurement could enter | paths `/fihrist`, `/eskiler/`, `/`; excludes + ilan, ihale, kamulaştırma, atama kararı, personel alım (amend) |
| TİTCK genel (`titck_announcements_general`, Duyuru) | generic card titles ("Kamuoyunun/Firmaların Dikkatine") | title keywords cannot separate audience fit; recalls mixed with manufacturer notices | narrowed to klinik araştırma + hekimlere yönelik; recall/blokaj/firma/mali titles excluded (amend). Known gap: device-inspection "KAMUOYUNUN DİKKATİNE" notices |
| TİTCK blokaj ve geri çekme | none (only generic page) | clinician/public safety signal missing | NEW `titck_geri_cekme` on official recall RSS, daily, include dikkat / geri çek / blokaj, exclude kozmetik / biyosidal / personel; canary PASS 342 dated items |
| TİTCK Tıbbi Cihaz (`news-titck-tibbi-cihaz-duyurulari`, Haber) | enabled, HTTP 404 | dead, manufacturer-facing, weak audience fit | retired (disabled); no replacement source |
| TİTCK general / RG / TÜİK Haber legs | already retired | — | no change |
| TÜİK (`tuik_medical_public_health`, Duyuru) | weekly poll, broad words (yaşam) | bulletins missed up to 6 days; non-health bulletins | daily; include narrowed to health / mortality / birth / disability / obesity / tobacco; excludes + işgücü, dış ticaret, memnuniyet, gelir ve yaşam. Gap: home slider has no dates (undated-exception adapter needed) |
| HSGM | single `hsgm_public_health` | — | already done 2026-10-31 (30 legs); blocked on Türkiye-egress runner (owner) |

## Tooling
`source-lifecycle.mjs amend` (new): reason-required, dry-run default, updates every registry layer, writes history. Shell note: Git Bash rewrites leading-slash arguments (`/fihrist` became a Windows path); run with `MSYS_NO_PATHCONV=1`.

## Owner actions
1. Apply `scripts/ops/2026-11-01-pending-source_lifecycle_retire_titck_tibbi_cihaz_duyurulari.sql` on remote D1 (sets the dead feed to enabled=0).
2. Türkiye-egress runner for HSGM and the `tr` sources.
3. Merge to `main` (review migrations 0031–0040 first).

## Left in place on purpose
S66 `titck.gov.tr` dual-heading exception stays until the retired Haber row is purged; legacy `tip-*` rows are not deleted without `purge-plan` evidence.
