-- EVERGREEN > DOSSIER_DISCOVERY durable foundation (LOCAL-ONLY in this phase; not applied remotely).
-- Contract: packages/contracts/dossier-discovery.json, doc: docs/DOSSIER-DISCOVERY.md.
--
-- Additive only: 18 new tables, their indexes and triggers. No existing table, row, column, trigger or index is read or
-- rewritten; no source_items backfill; nothing here changes TIME_SENSITIVE or EVERGREEN behavior. DOSSIER is a subsystem of
-- EVERGREEN, not a temporal path: nothing here touches acquisition_path / evergreen_view and no dossier row lives in
-- source_items. No topic, supplement, protocol, technology, expert or alias is seeded: this is identity STRUCTURE only.
--
-- CHECK policy: SQL CHECKs only for true architectural invariants (candidate temporal identity is EVERGREEN, candidate target
-- is a concept or a relation, a relation has >= 2 members, an UNKNOWN value is never a number, exactly one of concept/label,
-- merged <=> resolved-to). Evolving vocabularies (domains, signal families, window kinds, identity strategies, alias types,
-- observation kinds, states) are validated by the application contract, not by closed SQL lists.
--
-- Purge safety: no dossier table has a foreign key to source_items, source_feeds or any purgeable GCOS row. Hub-native
-- material is referenced by a plain TEXT id; historical snapshot provenance is self-describing (source identity + locator +
-- time + bounded evidence span) so it stays explainable if a source item is purged or raw observations are compacted.
--
-- Not here (deferred): scheduler/runtime state (lease, cursor, next_due, claim), research handoff, any retention/compaction/
-- cap numbers (policy values stay unset), any reader or job.

-- ---------------------------------------------------------------------------------------------------------------------
-- Signal run provenance: append-only record of one reader/source execution. NOT scheduler state.
CREATE TABLE IF NOT EXISTS dossier_signal_runs (
  run_id TEXT PRIMARY KEY,
  reader_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  items_seen INTEGER,
  items_new INTEGER,
  observations_written INTEGER,
  reader_version TEXT NOT NULL,
  error_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_dossier_runs_source ON dossier_signal_runs(source_ref, started_at);

-- External (non-Hub) source item: thin provenance/dedupe reference. Strategy-based identity, never URL-only. No body.
CREATE TABLE IF NOT EXISTS dossier_external_source_items (
  origin_item_id TEXT PRIMARY KEY,
  acquisition_source_id TEXT NOT NULL,
  identity_strategy TEXT NOT NULL,
  identity_value TEXT NOT NULL,
  external_ref TEXT,
  url TEXT,
  content_hash TEXT,
  published_at TEXT,
  content_class TEXT,
  commercial_context TEXT,
  evidence_span TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (acquisition_source_id, identity_strategy, identity_value)
);

-- content_hash carries the near-duplicate FINGERPRINT the reader supplies (equal fingerprint = likely same original); the partial
-- index lets a later repost find its earlier siblings without scanning the table.
CREATE INDEX IF NOT EXISTS idx_dossier_ext_items_hash ON dossier_external_source_items(content_hash) WHERE content_hash IS NOT NULL;

-- Origin clusters: likely original + duplicates/derivatives so reposts are not independent signals. Small, bounded purpose.
CREATE TABLE IF NOT EXISTS dossier_origin_clusters (
  cluster_id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS dossier_origin_cluster_members (
  cluster_id TEXT NOT NULL REFERENCES dossier_origin_clusters(cluster_id),
  member_kind TEXT NOT NULL,
  member_ref TEXT NOT NULL,
  acquisition_source_id TEXT,
  is_representative INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (cluster_id, member_kind, member_ref)
);
CREATE INDEX IF NOT EXISTS idx_dossier_cluster_members_ref ON dossier_origin_cluster_members(member_kind, member_ref);

-- ---------------------------------------------------------------------------------------------------------------------
-- Identity tables (mutable current state; lifecycle PROPOSED / ACTIVE / PAUSED / REJECTED / MERGED; never deleted).

CREATE TABLE IF NOT EXISTS dossier_concepts (
  concept_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  domain TEXT,
  concept_class TEXT,
  proposal_family TEXT,
  parent_concept_id TEXT REFERENCES dossier_concepts(concept_id),
  state TEXT NOT NULL DEFAULT 'PROPOSED',
  resolved_to_concept_id TEXT REFERENCES dossier_concepts(concept_id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((state = 'MERGED' AND resolved_to_concept_id IS NOT NULL AND resolved_to_concept_id <> concept_id)
      OR (state <> 'MERGED' AND resolved_to_concept_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_dossier_concepts_norm ON dossier_concepts(normalized_label);
CREATE INDEX IF NOT EXISTS idx_dossier_concepts_state ON dossier_concepts(state, created_at);

-- A normalized alias is NOT globally unique: the same surface form may map to several concepts, domains or languages.
CREATE TABLE IF NOT EXISTS dossier_aliases (
  alias_id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES dossier_concepts(concept_id),
  alias_text TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  alias_type TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (concept_id, normalized_alias, language)
);
CREATE INDEX IF NOT EXISTS idx_dossier_aliases_norm ON dossier_aliases(normalized_alias);

-- Source actor / expert: DOSSIER-owned identity. NOT an acquisition source; accepting an actor never activates a source.
CREATE TABLE IF NOT EXISTS dossier_source_actors (
  actor_id TEXT PRIMARY KEY,
  actor_kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PROPOSED',
  resolved_to_actor_id TEXT REFERENCES dossier_source_actors(actor_id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((state = 'MERGED' AND resolved_to_actor_id IS NOT NULL AND resolved_to_actor_id <> actor_id)
      OR (state <> 'MERGED' AND resolved_to_actor_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_dossier_actors_state ON dossier_source_actors(state, created_at);
CREATE INDEX IF NOT EXISTS idx_dossier_actors_norm ON dossier_source_actors(normalized_name);

-- One actor -> many canonical acquisition sources (plain TEXT id into existing source truth; no copy, no FK, no activation).
CREATE TABLE IF NOT EXISTS dossier_actor_source_mappings (
  mapping_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES dossier_source_actors(actor_id),
  acquisition_source_id TEXT NOT NULL,
  platform TEXT,
  handle TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT,
  UNIQUE (actor_id, acquisition_source_id, handle)
);
CREATE INDEX IF NOT EXISTS idx_dossier_actor_map_source ON dossier_actor_source_mappings(acquisition_source_id);

-- Relation identity. identity_key = relation type + order-normalized survivor member identities, computed by the contract
-- (packages/contracts/src/dossier-discovery.ts relationIdentityKey): A x B and B x A are the same key for symmetric semantics.
CREATE TABLE IF NOT EXISTS dossier_relations (
  relation_id TEXT PRIMARY KEY,
  semantic TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 2),
  identity_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'PROPOSED',
  resolved_to_relation_id TEXT REFERENCES dossier_relations(relation_id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((state = 'MERGED' AND resolved_to_relation_id IS NOT NULL AND resolved_to_relation_id <> relation_id)
      OR (state <> 'MERGED' AND resolved_to_relation_id IS NULL))
);

-- Explicit member rows (never an opaque list). Pair = depth 2, triple = depth 3, composite = 4+ (never automatic).
CREATE TABLE IF NOT EXISTS dossier_relation_members (
  relation_id TEXT NOT NULL REFERENCES dossier_relations(relation_id),
  concept_id TEXT NOT NULL REFERENCES dossier_concepts(concept_id),
  position INTEGER NOT NULL CHECK (position >= 1),
  PRIMARY KEY (relation_id, concept_id),
  UNIQUE (relation_id, position)
);
CREATE INDEX IF NOT EXISTS idx_dossier_relation_members_concept ON dossier_relation_members(concept_id);

-- ---------------------------------------------------------------------------------------------------------------------
-- Observations: append-only discovery evidence. One source item may create many. Raw rows may later be compacted by policy
-- (DELETE is allowed, UPDATE is not); nothing historical depends on them. observation_id references elsewhere are soft.
CREATE TABLE IF NOT EXISTS dossier_observations (
  observation_id TEXT PRIMARY KEY,
  run_id TEXT, -- soft reference: the append-only run row is written once, at the end of the run, after its observations
  acquisition_source_id TEXT,
  source_item_id TEXT,
  origin_item_id TEXT REFERENCES dossier_external_source_items(origin_item_id),
  actor_id TEXT REFERENCES dossier_source_actors(actor_id),
  concept_id TEXT REFERENCES dossier_concepts(concept_id),
  unresolved_label TEXT,
  observation_kind TEXT NOT NULL,
  signal_family TEXT NOT NULL,
  signal_subfamily TEXT NOT NULL DEFAULT '',
  geo_scope TEXT NOT NULL DEFAULT '',
  window_kind TEXT,
  window_start TEXT,
  window_end TEXT,
  measurement_provenance TEXT NOT NULL,
  value REAL,
  value_unit TEXT,
  value_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  evidence_span TEXT,
  -- Editorial eligibility of THIS observation as a candidate-generating signal (derived from the source-semantic role; vocabulary lives in the contract).
  -- An ineligible observation is retained (provenance, relation/actor/source context) but is excluded from candidate aggregates.
  source_role TEXT,
  candidate_signal_eligible TEXT NOT NULL DEFAULT 'TRUE' CHECK (candidate_signal_eligible IN ('TRUE', 'FALSE', 'REVIEW_REQUIRED')),
  eligibility_reason TEXT,
  -- Editorial granularity of the topic AS EXPOSED BY THE SOURCE structure (NULL = the source exposes nothing). Vocabulary lives in the contract.
  topic_granularity TEXT,
  granularity_reason TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  extractor_version TEXT,
  observed_at TEXT NOT NULL,
  fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((concept_id IS NOT NULL AND unresolved_label IS NULL) OR (concept_id IS NULL AND unresolved_label IS NOT NULL)),
  CHECK ((value IS NULL AND value_status IN ('UNKNOWN', 'NOT_APPLICABLE')) OR (value IS NOT NULL AND value_status = 'MEASURED'))
);
CREATE INDEX IF NOT EXISTS idx_dossier_obs_target ON dossier_observations(concept_id, signal_family, window_kind, window_end);
CREATE INDEX IF NOT EXISTS idx_dossier_obs_run ON dossier_observations(run_id);

-- Relation observation: the actual JOINT signal for a relation. Independent popularity is not relation evidence.
CREATE TABLE IF NOT EXISTS dossier_relation_observations (
  relation_observation_id TEXT PRIMARY KEY,
  relation_id TEXT NOT NULL REFERENCES dossier_relations(relation_id),
  observation_id TEXT,
  run_id TEXT,
  joint_signal_kind TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (relation_id, observation_id, joint_signal_kind)
);

-- Live signal aggregate: DERIVED, RECOMPUTABLE, VERSIONED. Not canonical evidence and no universal score. Fast windows and
-- structural/release periods are distinguished by window_kind (contract-validated); superseded generations may be compacted.
CREATE TABLE IF NOT EXISTS dossier_signal_aggregates (
  aggregate_id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('CONCEPT', 'RELATION')),
  target_id TEXT NOT NULL,
  signal_family TEXT NOT NULL,
  signal_subfamily TEXT NOT NULL DEFAULT '',
  geo_scope TEXT NOT NULL DEFAULT '',
  window_kind TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  measurement_provenance TEXT NOT NULL,
  aggregation_version TEXT NOT NULL,
  observation_count INTEGER NOT NULL,
  independent_source_count INTEGER,
  unique_actor_count INTEGER,
  unique_platform_count INTEGER,
  commercial_context_summary_json TEXT,
  persistence_inputs_json TEXT,
  momentum_inputs_json TEXT,
  value REAL,
  value_unit TEXT,
  value_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  generated_at TEXT NOT NULL,
  CHECK ((value IS NULL AND value_status IN ('UNKNOWN', 'NOT_APPLICABLE')) OR (value IS NOT NULL AND value_status = 'MEASURED')),
  UNIQUE (target_type, target_id, signal_family, window_kind, window_start, window_end, signal_subfamily, geo_scope, measurement_provenance, aggregation_version)
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Candidate: ONE stable editorial opportunity per target (concept or relation). Evaluations append snapshots, never candidates.
-- Temporal identity is the architectural invariant: always EVERGREEN. The target's identity state is read from the target
-- row, not stored here (no stale copy). Candidate review/reject never changes the target's own state.
CREATE TABLE IF NOT EXISTS dossier_candidates (
  candidate_id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('CONCEPT', 'RELATION')),
  target_id TEXT NOT NULL,
  temporal_identity TEXT NOT NULL DEFAULT 'EVERGREEN' CHECK (temporal_identity = 'EVERGREEN'),
  domain TEXT,
  state TEXT NOT NULL DEFAULT 'DISCOVERED',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (target_type, target_id)
);

-- Candidate snapshot: immutable historical WHY-NOW at one evaluation. Candidate class is a discovery state, not a verdict.
CREATE TABLE IF NOT EXISTS dossier_candidate_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES dossier_candidates(candidate_id),
  generated_at TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  candidate_class TEXT NOT NULL,
  why_now_json TEXT NOT NULL,
  quality_dimensions_json TEXT,
  reason_codes_json TEXT,
  summary_signal_metrics_json TEXT,
  UNIQUE (candidate_id, generated_at)
);

-- Immutable aggregate state a snapshot actually used (owned by exactly one snapshot, so it doubles as the aggregate ref).
-- live_aggregate_id is informational only (soft, no FK): the live aggregate may later be recomputed or compacted.
CREATE TABLE IF NOT EXISTS dossier_candidate_aggregate_states (
  aggregate_state_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES dossier_candidate_snapshots(snapshot_id),
  live_aggregate_id TEXT,
  aggregation_version TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('CONCEPT', 'RELATION')),
  target_id TEXT NOT NULL,
  signal_family TEXT NOT NULL,
  signal_subfamily TEXT NOT NULL DEFAULT '',
  geo_scope TEXT NOT NULL DEFAULT '',
  window_kind TEXT NOT NULL,
  window_start TEXT,
  window_end TEXT,
  observation_count INTEGER NOT NULL,
  independent_source_count INTEGER,
  unique_actor_count INTEGER,
  unique_platform_count INTEGER,
  commercial_context_summary_json TEXT,
  measurement_provenance TEXT NOT NULL,
  value REAL,
  value_unit TEXT,
  value_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  generated_at TEXT NOT NULL,
  CHECK ((value IS NULL AND value_status IN ('UNKNOWN', 'NOT_APPLICABLE')) OR (value IS NOT NULL AND value_status = 'MEASURED'))
);
CREATE INDEX IF NOT EXISTS idx_dossier_agg_states_snapshot ON dossier_candidate_aggregate_states(snapshot_id);

-- Bounded, SELF-DESCRIBING supporting provenance for a snapshot. observation_id / source_item_id / origin_item_id are plain
-- soft references (no FK): the row stays understandable from acquisition_source_id + locator + times + evidence span even if
-- the raw observation is compacted or the Hub source item is purged. No comments, transcripts or article bodies.
CREATE TABLE IF NOT EXISTS dossier_snapshot_provenance_refs (
  provenance_ref_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES dossier_candidate_snapshots(snapshot_id),
  aggregate_state_id TEXT REFERENCES dossier_candidate_aggregate_states(aggregate_state_id),
  ref_kind TEXT NOT NULL,
  acquisition_source_id TEXT NOT NULL,
  observation_id TEXT,
  relation_observation_id TEXT,
  source_item_id TEXT,
  origin_item_id TEXT,
  item_locator TEXT,
  run_id TEXT,
  published_at TEXT,
  observed_at TEXT NOT NULL,
  evidence_span TEXT,
  CHECK (source_item_id IS NULL OR origin_item_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_dossier_prov_refs_snapshot ON dossier_snapshot_provenance_refs(snapshot_id);

-- ---------------------------------------------------------------------------------------------------------------------
-- Human review: append-only event on ONE object. target_id is polymorphic (no FK). A review never mutates any other row:
-- the application applies a scoped identity/candidate state change as an explicit separate step.
CREATE TABLE IF NOT EXISTS dossier_reviews (
  review_id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_code TEXT,
  reason_note TEXT,
  effect TEXT,
  reviewer TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  CHECK (decision <> 'REJECT' OR reason_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_dossier_reviews_target ON dossier_reviews(target_type, target_id, reviewed_at);

-- Operator controls (kill switches). An ABSENT key means OFF: nothing is enabled until an operator explicitly sets it.
-- Keys: canary_enabled, manual_runs_allowed, promotion_enabled, reader:<dossier_reader_id>:enabled. Switching them never touches canonical sources,
-- provenance, TIME_SENSITIVE or any Evergreen reader, and needs no schema change.
CREATE TABLE IF NOT EXISTS dossier_control (
  control_key TEXT PRIMARY KEY,
  control_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Manual one-shot canary runs (namespace DOSSIER). Read and written ONLY by the dossier runner; the Evergreen runner never touches these tables, so a
-- dossier job can never be claimed by it and neither can claim the other. runtime_key is 'dossier:<dossier_reader_id>' and cannot collide with a canonical
-- Evergreen source id. A run is resumable in bounded steps (phase + progress), holds one lease at a time and records its own checkpoint.
CREATE TABLE IF NOT EXISTS dossier_canary_runs (
  run_id TEXT PRIMARY KEY,
  runtime_key TEXT NOT NULL CHECK (runtime_key LIKE 'dossier:%'),
  reader_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  progress_json TEXT NOT NULL,
  checkpoint_json TEXT,
  lease_holder TEXT,
  lease_expires_at TEXT,
  invocations INTEGER NOT NULL DEFAULT 0,
  statements_used INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  started_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dossier_canary_one_active_run ON dossier_canary_runs(runtime_key) WHERE status IN ('RUNNING', 'PAUSED_BUDGET');
CREATE INDEX IF NOT EXISTS idx_dossier_canary_runs_reader ON dossier_canary_runs(reader_id, status);

-- Bounded work list of one run (the normalized thin items of ONE fetch, at most the profile item cap): lets a run resume across invocations without a second fetch.
CREATE TABLE IF NOT EXISTS dossier_canary_work (
  run_id TEXT NOT NULL REFERENCES dossier_canary_runs(run_id),
  seq INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  PRIMARY KEY (run_id, seq)
);

-- =====================================================================================================================
-- Triggers: only true architectural invariants.

-- Append-only provenance / history (no UPDATE, no DELETE).
CREATE TRIGGER IF NOT EXISTS trg_dossier_runs_append_only_u BEFORE UPDATE ON dossier_signal_runs BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_runs_append_only_d BEFORE DELETE ON dossier_signal_runs BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_snapshots_immutable_u BEFORE UPDATE ON dossier_candidate_snapshots BEGIN SELECT RAISE(ABORT, 'DOSSIER_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_snapshots_immutable_d BEFORE DELETE ON dossier_candidate_snapshots BEGIN SELECT RAISE(ABORT, 'DOSSIER_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_agg_states_immutable_u BEFORE UPDATE ON dossier_candidate_aggregate_states BEGIN SELECT RAISE(ABORT, 'DOSSIER_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_agg_states_immutable_d BEFORE DELETE ON dossier_candidate_aggregate_states BEGIN SELECT RAISE(ABORT, 'DOSSIER_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_prov_refs_immutable_u BEFORE UPDATE ON dossier_snapshot_provenance_refs BEGIN SELECT RAISE(ABORT, 'DOSSIER_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_prov_refs_immutable_d BEFORE DELETE ON dossier_snapshot_provenance_refs BEGIN SELECT RAISE(ABORT, 'DOSSIER_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_reviews_append_only_u BEFORE UPDATE ON dossier_reviews BEGIN SELECT RAISE(ABORT, 'DOSSIER_REVIEW_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_reviews_append_only_d BEFORE DELETE ON dossier_reviews BEGIN SELECT RAISE(ABORT, 'DOSSIER_REVIEW_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_clusters_append_only_u BEFORE UPDATE ON dossier_origin_clusters BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_clusters_append_only_d BEFORE DELETE ON dossier_origin_clusters BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_cluster_members_append_only_u BEFORE UPDATE ON dossier_origin_cluster_members BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_cluster_members_append_only_d BEFORE DELETE ON dossier_origin_cluster_members BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relation_members_append_only_u BEFORE UPDATE ON dossier_relation_members BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relation_members_append_only_d BEFORE DELETE ON dossier_relation_members BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;

-- Raw evidence rows: never rewritten; DELETE stays possible so policy-driven compaction is not blocked by the schema.
CREATE TRIGGER IF NOT EXISTS trg_dossier_observations_no_update BEFORE UPDATE ON dossier_observations BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relation_obs_no_update BEFORE UPDATE ON dossier_relation_observations BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_external_items_no_update BEFORE UPDATE ON dossier_external_source_items BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;

-- Actor-source mapping: append-only except closing a mapping once (ended_at NULL -> value). Never activates a source.
CREATE TRIGGER IF NOT EXISTS trg_dossier_actor_map_limited_update BEFORE UPDATE ON dossier_actor_source_mappings
WHEN NEW.mapping_id IS NOT OLD.mapping_id OR NEW.actor_id IS NOT OLD.actor_id OR NEW.acquisition_source_id IS NOT OLD.acquisition_source_id
  OR NEW.platform IS NOT OLD.platform OR NEW.handle IS NOT OLD.handle OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS NOT OLD.ended_at)
BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_actor_map_no_delete BEFORE DELETE ON dossier_actor_source_mappings BEGIN SELECT RAISE(ABORT, 'DOSSIER_APPEND_ONLY'); END;

-- Identities are never deleted (rejected and merged identities stay as durable history).
CREATE TRIGGER IF NOT EXISTS trg_dossier_concepts_no_delete BEFORE DELETE ON dossier_concepts BEGIN SELECT RAISE(ABORT, 'DOSSIER_IDENTITY_NOT_DELETABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_actors_no_delete BEFORE DELETE ON dossier_source_actors BEGIN SELECT RAISE(ABORT, 'DOSSIER_IDENTITY_NOT_DELETABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relations_no_delete BEFORE DELETE ON dossier_relations BEGIN SELECT RAISE(ABORT, 'DOSSIER_IDENTITY_NOT_DELETABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_candidates_no_delete BEFORE DELETE ON dossier_candidates BEGIN SELECT RAISE(ABORT, 'DOSSIER_IDENTITY_NOT_DELETABLE'); END;

-- P5: PROPOSED never becomes ACTIVE autonomously. A concept / actor / relation can be ACTIVE only while its LATEST human review
-- is an ACCEPT for that object. (The review table is append-only; this only reads it.)
CREATE TRIGGER IF NOT EXISTS trg_dossier_concepts_active_needs_accept_i BEFORE INSERT ON dossier_concepts
WHEN NEW.state = 'ACTIVE' AND (SELECT decision FROM dossier_reviews WHERE target_type = 'CONCEPT_PROPOSAL' AND target_id = NEW.concept_id ORDER BY reviewed_at DESC, rowid DESC LIMIT 1) IS NOT 'ACCEPT'
BEGIN SELECT RAISE(ABORT, 'DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_concepts_active_needs_accept_u BEFORE UPDATE OF state ON dossier_concepts
WHEN NEW.state = 'ACTIVE' AND OLD.state IS NOT 'ACTIVE' AND (SELECT decision FROM dossier_reviews WHERE target_type = 'CONCEPT_PROPOSAL' AND target_id = NEW.concept_id ORDER BY reviewed_at DESC, rowid DESC LIMIT 1) IS NOT 'ACCEPT'
BEGIN SELECT RAISE(ABORT, 'DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_actors_active_needs_accept_i BEFORE INSERT ON dossier_source_actors
WHEN NEW.state = 'ACTIVE' AND (SELECT decision FROM dossier_reviews WHERE target_type = 'ACTOR_PROPOSAL' AND target_id = NEW.actor_id ORDER BY reviewed_at DESC, rowid DESC LIMIT 1) IS NOT 'ACCEPT'
BEGIN SELECT RAISE(ABORT, 'DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_actors_active_needs_accept_u BEFORE UPDATE OF state ON dossier_source_actors
WHEN NEW.state = 'ACTIVE' AND OLD.state IS NOT 'ACTIVE' AND (SELECT decision FROM dossier_reviews WHERE target_type = 'ACTOR_PROPOSAL' AND target_id = NEW.actor_id ORDER BY reviewed_at DESC, rowid DESC LIMIT 1) IS NOT 'ACCEPT'
BEGIN SELECT RAISE(ABORT, 'DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relations_active_needs_accept_i BEFORE INSERT ON dossier_relations
WHEN NEW.state = 'ACTIVE' AND (SELECT decision FROM dossier_reviews WHERE target_type = 'RELATION_PROPOSAL' AND target_id = NEW.relation_id ORDER BY reviewed_at DESC, rowid DESC LIMIT 1) IS NOT 'ACCEPT'
BEGIN SELECT RAISE(ABORT, 'DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relations_active_needs_accept_u BEFORE UPDATE OF state ON dossier_relations
WHEN NEW.state = 'ACTIVE' AND OLD.state IS NOT 'ACTIVE' AND (SELECT decision FROM dossier_reviews WHERE target_type = 'RELATION_PROPOSAL' AND target_id = NEW.relation_id ORDER BY reviewed_at DESC, rowid DESC LIMIT 1) IS NOT 'ACCEPT'
BEGIN SELECT RAISE(ABORT, 'DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT'); END;

-- A merge target (survivor) must exist and be neither MERGED nor REJECTED (history stays resolvable).
CREATE TRIGGER IF NOT EXISTS trg_dossier_concepts_merge_survivor_i BEFORE INSERT ON dossier_concepts
WHEN NEW.state = 'MERGED' AND NOT EXISTS (SELECT 1 FROM dossier_concepts WHERE concept_id = NEW.resolved_to_concept_id AND state IN ('PROPOSED', 'ACTIVE', 'PAUSED'))
BEGIN SELECT RAISE(ABORT, 'DOSSIER_MERGE_SURVIVOR_INVALID'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_concepts_merge_survivor_u BEFORE UPDATE OF state, resolved_to_concept_id ON dossier_concepts
WHEN NEW.state = 'MERGED' AND NOT EXISTS (SELECT 1 FROM dossier_concepts WHERE concept_id = NEW.resolved_to_concept_id AND state IN ('PROPOSED', 'ACTIVE', 'PAUSED'))
BEGIN SELECT RAISE(ABORT, 'DOSSIER_MERGE_SURVIVOR_INVALID'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_actors_merge_survivor_u BEFORE UPDATE OF state, resolved_to_actor_id ON dossier_source_actors
WHEN NEW.state = 'MERGED' AND NOT EXISTS (SELECT 1 FROM dossier_source_actors WHERE actor_id = NEW.resolved_to_actor_id AND state IN ('PROPOSED', 'ACTIVE', 'PAUSED'))
BEGIN SELECT RAISE(ABORT, 'DOSSIER_MERGE_SURVIVOR_INVALID'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relations_merge_survivor_u BEFORE UPDATE OF state, resolved_to_relation_id ON dossier_relations
WHEN NEW.state = 'MERGED' AND NOT EXISTS (SELECT 1 FROM dossier_relations WHERE relation_id = NEW.resolved_to_relation_id AND state IN ('PROPOSED', 'ACTIVE', 'PAUSED'))
BEGIN SELECT RAISE(ABORT, 'DOSSIER_MERGE_SURVIVOR_INVALID'); END;

-- Relation members: position within the relation's depth; a relation with a PROPOSED member cannot be ACTIVE.
CREATE TRIGGER IF NOT EXISTS trg_dossier_relation_members_depth BEFORE INSERT ON dossier_relation_members
WHEN NEW.position > (SELECT depth FROM dossier_relations WHERE relation_id = NEW.relation_id)
BEGIN SELECT RAISE(ABORT, 'DOSSIER_RELATION_MEMBER_BEYOND_DEPTH'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relation_members_proposed_vs_active BEFORE INSERT ON dossier_relation_members
WHEN (SELECT state FROM dossier_relations WHERE relation_id = NEW.relation_id) = 'ACTIVE'
 AND (SELECT state FROM dossier_concepts WHERE concept_id = NEW.concept_id) = 'PROPOSED'
BEGIN SELECT RAISE(ABORT, 'DOSSIER_ACTIVE_RELATION_WITH_PROPOSED_MEMBER'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_relations_active_members BEFORE UPDATE OF state ON dossier_relations
WHEN NEW.state = 'ACTIVE' AND EXISTS (
  SELECT 1 FROM dossier_relation_members m JOIN dossier_concepts c ON c.concept_id = m.concept_id
  WHERE m.relation_id = NEW.relation_id AND c.state = 'PROPOSED')
BEGIN SELECT RAISE(ABORT, 'DOSSIER_ACTIVE_RELATION_WITH_PROPOSED_MEMBER'); END;

-- Candidate: stable target identity; the target must exist; temporal identity and target are never rewritten.
CREATE TRIGGER IF NOT EXISTS trg_dossier_candidates_target_exists BEFORE INSERT ON dossier_candidates
WHEN (NEW.target_type = 'CONCEPT' AND NOT EXISTS (SELECT 1 FROM dossier_concepts WHERE concept_id = NEW.target_id))
  OR (NEW.target_type = 'RELATION' AND NOT EXISTS (SELECT 1 FROM dossier_relations WHERE relation_id = NEW.target_id))
BEGIN SELECT RAISE(ABORT, 'DOSSIER_CANDIDATE_TARGET_NOT_FOUND'); END;
CREATE TRIGGER IF NOT EXISTS trg_dossier_candidates_identity_stable BEFORE UPDATE OF target_type, target_id, temporal_identity ON dossier_candidates
BEGIN SELECT RAISE(ABORT, 'DOSSIER_CANDIDATE_IDENTITY_IMMUTABLE'); END;
