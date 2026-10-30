-- Owner 2026-10-31: Sağlık Bakanlığı Haberler leaves Haber for good (ceremony/visit news, no Turkish audience, no wow). It stored 0 items.
-- Guarded: a disabled-or-open feed row is removed only when nothing references it. The earlier retire SQL for this feed is superseded and was deleted.
UPDATE source_feeds SET enabled = 0 WHERE id = 'news-saglik-bakanligi-whole';
DELETE FROM source_feeds
WHERE id = 'news-saglik-bakanligi-whole'
  AND NOT EXISTS (SELECT 1 FROM source_items i WHERE i.feed_id = source_feeds.id)
  AND NOT EXISTS (SELECT 1 FROM review_feedback r WHERE r.feed_id = source_feeds.id);
