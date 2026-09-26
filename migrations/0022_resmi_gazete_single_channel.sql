-- S57 single-channel-per-source resolution (2026-09-26).
-- resmigazete.gov.tr /fihrist was independently registered on BOTH the
-- Kaduse-side ('news-resmi-gazete-health-scoped', route=kaduse-news) and the
-- Hekimler-side ('tip-resmi_gazete', route=tip-ogrencileri) feeds, each
-- polling the same daily gazette index page with only a downstream keyword
-- filter (health vs. legislation) as the differentiator. User decision:
-- resmigazete.gov.tr belongs to the Duyuru route (Hekimler Topluluğu)
-- exclusively. The Kaduse-side registration is structurally disabled here
-- (enabled=0), not filtered by keyword -- the generic-web ingress fetcher
-- already scopes its SELECT to `enabled = 1`, so this row can no longer be
-- selected for fetch. Row is preserved (not deleted) per Bible §19.2.

UPDATE source_feeds
SET enabled = 0
WHERE id = 'news-resmi-gazete-health-scoped';
