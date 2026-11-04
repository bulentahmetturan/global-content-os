-- Bible 26.4 / SPF-6 (owner hard-gate 2026-11-04): science.org answers http_403 (WAF) on every fetch. A technical block is not a source FAIL
-- and bot protection is not bypassed (8.2): both Science feeds are paused (record kept, history preserved). Re-enable (enabled = 1) when an
-- official feed/API or an adapter-push fetcher exists.
UPDATE source_feeds SET enabled = 0 WHERE id IN ('research-science', 'research-science-translational-medicine');
