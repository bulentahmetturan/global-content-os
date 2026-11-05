# Bible v5 §14.1 envanteri (2026-11-05)

Kaynak: depodaki mevcut kayıtlar (`config/feeds.json`, `packages/source-catalog/data/*`, zaman-ekseni kaydı (source-catalog), `bible-config.json`, `migrations/`, `docs/audits/`). Canlı D1 sayıları YOK (okuma kotası dolu); sayılar kayıt/yapılandırma sayısıdır. Üretici: `scripts/audit/bible-v5-inventory.mjs`; tam satırlar: `data/2026-11-05-bible-v5-inventory.json`.

## 1. Kaynak / hat envanteri

- Toplam akış: **813** (TipTopluluğu 729, Haber 35, Research 49); enabled 787, disabled 26.
- Kayıt defteri kapsamı: tip-radar adapter (feeds.json): 729; news-registry.json: 35; research-sources.json: 48; NONE: 1.
- Research: 49 akış, 48 kayıt-defteri girdisi. Akışsız kayıt: yok. Kayıtsız akış: 1 (europe-pmc-batch).
- Research rol dağılımı: RESEARCH_INDEX 3, BIBLIOGRAPHIC_METADATA 1, PUBLICATION_INTEGRITY 2, OPEN_FULL_TEXT 1, SYSTEMATIC_EVIDENCE 1, TRIAL_REGISTRY 1, PRIMARY_RESEARCH_PUBLISHER 25, ACCESSIBLE_SCIENCE_MEDIA 11, ATTENTION_METRIC 3. Doğrulama: CANONICAL_ACTIVE 16, CONDITIONAL_VERIFIED 29, EXCLUDE 3.
- Yayın hızı sınıfı (Research akışları): daily 15, sparse 4, UNKNOWN 12, weekly 18.

## 2. Evergreen ve Rediscovery

- Zaman-ekseni kaydı olan kaynak: **7** (Haber 4, Duyuru 1, Research 2). Görünümler: health_reference 5, research_rediscovery 2.
- Zaman-duyarlı yolu açık kaynaklar: harvard_nutrition_source, news-cleveland-clinic-health-essentials-sitemap, research-cochrane-library.
- Research kaynaklarında Evergreen/Rediscovery kaydı:
  - `research-cochrane-library`: görünüm `research_rediscovery`, zaman-duyarlı true, rediscovery 72 saat, durum ACTIVE
  - `research-pubmed-eutilities`: görünüm `research_rediscovery`, zaman-duyarlı false, rediscovery 72 saat, durum CANARY_ONLY
- v5 §3.4 Evergreen/modül sözleşmesi ve §3.6 haber türleri bu kayıtlara henüz bağlanmadı; yeniden tasarım bu envanterden sonra, konu onayından sonra yapılır.

## 3. Kararlar (mevcut belgeler)

- Karar belgeleri (12): `2026-10-15-gate-b-option4-owner-risk-package.md`, `2026-10-23-owner-ratings.md`, `2026-10-26-owner-structure-decision.md`, `2026-10-30-owner-source-close-delete.md`, `2026-11-03-backup-list-26-32-owner-decisions.md`, `2026-11-03-haber-gap-10-sources-owner-decisions.md`, `2026-11-03-wave2-haberturk-dw-owner-decisions.md`, `2026-11-05-research-all-sources-scan.md`, `2026-11-05-research-field-gap-report.md`, `2026-11-05-research-todo.md`, `research-decisions-2026-11-04.md`, `research-todo-2026-11-04.md`.
- En az bir karar belgesinde geçen akış: 53 / 813.

## 4. Config

- `bible-config.json` anahtarları: `schemaVersion`, `bibleVersion`, `note`, `auto_publish`, `fail_closed`, `unknown_beats_guess`, `evaluation_tracks`, `ranking_weights`, `score_a_haber_research`, `score_b_pragmatic_utility`, `source_pass_fail`, `revalidation`, `research_discovery_weights`, `eligibility_research_score`, `turkey_umic`, `news_max_age_days`, `semantic_duplicate_threshold`, `low_yield_min_decisions`, `low_yield_delete_ratio`, `error_backoff_hours`, `fetch_retry`, `cadence_defaults_minutes`, `publication_gate`, `source_activation`, `research_scope`.
- `research_scope`: **OWNER_PENDING (all values null until owner interviews)** (sayılar uydurulmaz; sahip kararı gerekir).

## 5. Şema

- Migration'larda 83 tablo. Research ile ilgili: source_feeds (0001_init.sql), source_items (0001_init.sql), evidence_cards (0001_init.sql), source_pass_fail_decisions (0021_source_pass_fail_decisions.sql), source_revalidation (0024_source_revalidation.sql), review_feedback (0023_review_feedback.sql), decided_links (0014_decided_links.sql).
- Topic / Lane Scope / Question / Plan tabloları: **yok** (v5 §14.4 bunların bu teslimde uygulanmadığını söyler).

## 6. v5 kayıtlarına eşleme (kayıpsız)

| v5 kaydı | Bugün var olan | Eksik |
|---|---|---|
| Topic registry (4.1: PROPOSED/ACTIVE/REJECTED/SNOOZED) | research_topic vocabulary in controlled-vocabulary.json (v4.3 11.6); per-source type decisions in docs/audits/*decisions*.md; NO topic table | No topic records; MX owner scores are lane-type answers, not approved topics |
| Lane Scope registry (4.2 PASS/FAIL inside accepted topic) | feed-editorial.ts RULES_BY_FEED, feed-scope.ts, topic-gate.ts (code); source_pass_fail_decisions table (0 Research rows) | Rules live in code, not as decision-linked records; no decision_id |
| Question registry (4.4 no repeat questions) | docs/audits owner-decision markdown files only | No machine-readable question/answer store; repeats not preventable by code |
| Plan registry (6.2 fetch plan, 6.3 SQL/code bound to decisions) | research-sources.json fetchScope + config/feeds.json + scripts/backfill/*.sql | Plans not linked to approved scope; SQL not decision-bound |
| Living approval record (13.4) | docs/audits owner-decision files; BIBLE-INDEX changelog | Not structured; no decision_id |

## 7. Sonraki adım

1. Konu adayları çıkarılır (`PROPOSED`), sahibe "Bu konu takip edilsin mi?" kartı olarak sorulur (§4.1). Soru tekrarını önlemek için önce bu envanterdeki karar belgelerinden mevcut cevaplar yeniden kullanılır (§4.4).
2. Onaylanan konu içinde PASS/FAIL (§4.2), gerçek örnekle (§4.5).
3. Onaydan sonra kural, plan, SQL (§6.1 sırası). Bu envanter hiçbir kural/SQL değiştirmez.
