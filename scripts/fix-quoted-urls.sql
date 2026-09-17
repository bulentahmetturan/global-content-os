-- Strip wrapping single quotes from endpoint URLs
UPDATE source_feeds
SET endpoint_url = substr(endpoint_url, 2, length(endpoint_url) - 2)
WHERE endpoint_url GLOB '''*''' AND length(endpoint_url) >= 2;

UPDATE source_feeds
SET endpoint_url = substr(endpoint_url, 2)
WHERE endpoint_url GLOB '''*' AND endpoint_url NOT GLOB '''*''';

UPDATE source_feeds
SET endpoint_url = substr(endpoint_url, 1, length(endpoint_url) - 1)
WHERE endpoint_url GLOB '*''' AND endpoint_url NOT GLOB '''*''';
