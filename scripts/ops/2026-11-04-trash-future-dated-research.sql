-- Issue-check S04b: OpenAlex sorts publication_date:desc, so scheduled/placeholder dates (2026-12-16 .. 2027-01-12) entered the inbox first.
-- 23 inbox rows dated > 2 days ahead (ISO dates only) are discarded the standard way (trash + archive_kind 'deleted', as lane-purity does). Code fix: research-apis.ts.
UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE triage_status = 'inbox' AND published_at GLOB '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' AND substr(published_at,1,10) > date('now','+2 days');
