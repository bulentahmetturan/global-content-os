-- Write-amplification cleanup (D1 Free bills every index update as a row write).
-- idx_source_items_route_status is a prefix of idx_source_items_route_status_fetched (same reads, one fewer write per row change).
-- The other three are not referenced by any Worker query (editorial_brand / decision_route / content_family+source_id filters).
DROP INDEX IF EXISTS idx_source_items_route_status;
DROP INDEX IF EXISTS idx_source_items_brand_family_status;
DROP INDEX IF EXISTS idx_source_items_family_source;
DROP INDEX IF EXISTS idx_source_items_decision_route_status;
