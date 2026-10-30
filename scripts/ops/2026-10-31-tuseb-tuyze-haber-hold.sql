-- Owner 2026-10-31 (option C): TÜSEB and TÜYZE Haber legs are on hold. Their server sends no intermediate TLS certificate (Certum DV TLS G2 R39),
-- so the Worker gets http_526 on every fetch. Re-enable (enabled = 1) once the chain is fixed or an adapter-push fetcher exists.
UPDATE source_feeds SET enabled = 0 WHERE id IN ('news-tuseb-health-tech-innovation', 'news-tuyze-saglikta-yapay-zeka');
