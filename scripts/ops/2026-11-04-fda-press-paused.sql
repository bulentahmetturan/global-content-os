-- Bible 26.4 / 8.2: news-fda-press-scoped answers http_401 then http_404 from the Worker's egress while the official RSS returns 200 from other networks.
-- A technical block is not a source FAIL and bot protection is not bypassed: the feed is paused (record kept). Re-enable (enabled = 1) once an adapter-push fetcher exists.
UPDATE source_feeds SET enabled = 0 WHERE id = 'news-fda-press-scoped';
