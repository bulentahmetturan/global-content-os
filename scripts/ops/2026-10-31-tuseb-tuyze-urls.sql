-- Owner 2026-10-31: TÜSEB and TÜYZE Haber point at the real listing pages (the old /haberler and /tuyze paths returned 500/526/404).
-- last_fetched_at is cleared so the next poll runs at once; last_error is cleared with it.
UPDATE source_feeds SET endpoint_url = 'https://tuseb.gov.tr/tr/haberler', last_fetched_at = NULL, last_error = NULL WHERE id = 'news-tuseb-health-tech-innovation';
UPDATE source_feeds SET endpoint_url = 'https://tuyze.tuseb.gov.tr/tr/haberler', last_fetched_at = NULL, last_error = NULL WHERE id = 'news-tuyze-saglikta-yapay-zeka';
