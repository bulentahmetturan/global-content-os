/**
 * Protocol Ingestion Engine — shared contracts (target-agnostic).
 *
 * Deterministic-first, bounded, fail-closed. No network, no AI, no scheduler.
 * Every record carries an explicit source tag so synthetic vs real provenance
 * is never confused at report time.
 */

export const SOURCE_TAGS = [
  'SYNTHETIC_FIXTURE',
  'CONTROLLED_SQL_IMPORT',
  'REAL_SOURCE_LOCAL',
  'REAL_SOURCE_REMOTE_READ',
] as const;
export type SourceTag = (typeof SOURCE_TAGS)[number];

/** Seven firewall-separated evidence classes (P5 owns direction, never this file). */
export const EVIDENCE_CLASSES = [
  'IDENTITY',
  'DEFINITION',
  'VERSION',
  'COMPONENT',
  'CLINICAL_CLAIM',
  'SAFETY',
  'COMMERCIAL',
] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const REVIEW_STATES = [
  'RESOLVED',
  'NEEDS_REVIEW',
  'CONTRADICTORY',
  'MISSING',
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** P-levels this engine may populate. P0 is research-only and never written. */
export const WRITABLE_P_LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'] as const;
export type WritablePLevel = (typeof WRITABLE_P_LEVELS)[number];

/** Bounded-work guardrails: per-run caps, enforced by run-ledger. */
export const INGESTION_BOUNDS = {
  MAX_SOURCES_PER_RUN: 12,
  MAX_COMPONENTS_PER_VERSION: 40,
  MAX_CLAIMS_PER_RUN: 40,
  MAX_EVIDENCE_PER_RUN: 40,
  MAX_SAFETY_RULES_PER_RUN: 40,
  MAX_COMMERCIAL_PER_RUN: 20,
} as const;

export const DIAGNOSTIC_CODES = [
  'INGEST_OK',
  'INGEST_DRY_RUN',
  'IDENTITY_UNRESOLVED',
  'IDENTITY_AMBIGUOUS',
  'SOURCE_UNAUTHORIZED_FOR_P_LEVEL',
  'FETCH_NOT_PERMITTED_BY_POLICY',
  'PARSE_UNSUPPORTED',
  'EVIDENCE_CLASS_MISMATCH',
  'FIREWALL_VIOLATION',
  'SAFETY_FAIL_CLOSED',
  'DIRECTION_MISUSE',
  'DUPLICATE_SKIPPED',
  'LINEAGE_MISMATCH',
  'PARTIAL_SUCCESS',
  'QUARANTINED',
  'REPLAY_BLOCKED',
  'APPROVAL_MISSING',
  'SCHEMA_BEHIND',
  'BOUND_EXCEEDED',
] as const;
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface Diagnostic {
  code: DiagnosticCode;
  detail: string;
  /** Stable machine key for dedupe/replay (e.g. claim dedupe_key, source locator). */
  key?: string;
}

/** Owner approval reference required for any non-dry-run persistence. */
export interface ApprovalRef {
  approvedBy: string;
  decision: 'APPROVE' | 'MERGE_AS_ALIAS' | 'MERGE_AS_VARIANT';
  candidateId: string;
  admissionVersion: string;
}
