-- Bible 2.3 / S66 (hard-gate decision 2026-11-04): sciencedaily.com is owned by DUYURU (`sciencedaily_nutrition`). The three Research rows were
-- enabled in prod D1 although the catalog marked them pending, so the publisher was fetched under two headings. Disabled (records kept).
UPDATE source_feeds SET enabled = 0 WHERE id IN ('research-sciencedaily-healthy-aging','research-sciencedaily-alternative-medicine','research-sciencedaily-dietary-supplements');
