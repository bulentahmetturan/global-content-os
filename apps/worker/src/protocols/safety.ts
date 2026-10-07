/**
 * Safety rules + contexts + claim/evidence linkage for PROTOCOL_INTELLIGENCE
 * (sprint P6).
 *
 * A safety rule is an explicit constraint on a protocol context — storage +
 * integrity + deterministic retrieval only. Not a decision engine, not
 * personalized advice, not eligibility evaluation. Severity states importance,
 * never evidentiary certainty (no scores exist anywhere in P6).
 *
 * Separation (tested): rule creation creates no claim/evidence; claim and
 * evidence creation create no rule; linkage is optional, explicit, and
 * stance-free (P5 owns direction). Contexts describe applicability
 * (population/condition/medication/life-stage), never any specific user.
 */

import type { Env } from '../db/queries';
import { getProtocolComponent, getProtocolPhase, getProtocolVersion } from './registry';

export const SAFETY_TYPES = [
  'CONTRAINDICATION',
  'PRECAUTION',
  'INTERACTION',
  'ADVERSE_EFFECT',
  'MONITORING',
  'POPULATION_RESTRICTION',
  'STOP_CONDITION',
] as const;
export type SafetyType = (typeof SAFETY_TYPES)[number];

export const SEVERITIES = ['INFO', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SAFETY_ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type SafetyActiveStatus = (typeof SAFETY_ACTIVE_STATUSES)[number];

export interface SafetyRule {
  rule_id: string;
  protocol_id: string;
  protocol_version_id: string | null;
  phase_id: string | null;
  component_id: string | null;
  safety_type: SafetyType;
  severity: Severity;
  title: string;
  detail: string;
  active_status: SafetyActiveStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateSafetyRuleInput {
  rule_id: string;
  protocol_id: string;
  protocol_version_id?: string | null;
  phase_id?: string | null;
  component_id?: string | null;
  safety_type: SafetyType;
  severity: Severity;
  title: string;
  detail?: string;
  active_status?: SafetyActiveStatus;
}

export const SAFETY_CONTEXT_TYPES = ['POPULATION', 'CONDITION', 'MEDICATION', 'LIFE_STAGE', 'OTHER'] as const;
export type SafetyContextType = (typeof SAFETY_CONTEXT_TYPES)[number];

export interface SafetyRuleContext {
  context_id: string;
  rule_id: string;
  context_type: SafetyContextType;
  context_label: string;
  created_at: string;
}

/** Fail-fast lineage validation; trg_safety_lineage_* backstops it in SQL. */
async function checkSafetyLineage(
  db: Env['DB'],
  protocolId: string,
  versionId: string | null,
  phaseId: string | null,
  componentId: string | null,
): Promise<void> {
  if (versionId === null) {
    if (phaseId !== null || componentId !== null) throw new Error('SAFETY_LINEAGE_MISMATCH');
    return;
  }
  const version = await getProtocolVersion(db, versionId);
  if (!version) throw new Error('SAFETY_VERSION_NOT_FOUND');
  if (version.protocol_id !== protocolId) throw new Error('SAFETY_LINEAGE_MISMATCH');
  if (phaseId !== null) {
    const phase = await getProtocolPhase(db, phaseId);
    if (!phase || phase.version_id !== versionId) throw new Error('SAFETY_LINEAGE_MISMATCH');
  }
  if (componentId !== null) {
    const component = await getProtocolComponent(db, componentId);
    if (!component || component.version_id !== versionId) throw new Error('SAFETY_LINEAGE_MISMATCH');
    if (phaseId !== null && component.phase_id !== null && component.phase_id !== phaseId) {
      throw new Error('SAFETY_LINEAGE_MISMATCH');
    }
  }
}

export async function createSafetyRule(db: Env['DB'], input: CreateSafetyRuleInput): Promise<SafetyRule> {
  const versionId = input.protocol_version_id ?? null;
  const phaseId = input.phase_id ?? null;
  const componentId = input.component_id ?? null;
  if (!input.title.trim()) throw new Error('SAFETY_TITLE_EMPTY');
  await checkSafetyLineage(db, input.protocol_id, versionId, phaseId, componentId);
  await db
    .prepare(
      `INSERT INTO safety_rules
         (rule_id, protocol_id, protocol_version_id, phase_id, component_id,
          safety_type, severity, title, detail, active_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.rule_id, input.protocol_id, versionId, phaseId, componentId,
      input.safety_type, input.severity, input.title,
      input.detail ?? '', input.active_status ?? 'ACTIVE',
    )
    .run()
    .catch((err: unknown) => {
      if (err instanceof Error && /UNIQUE constraint failed: safety_rules\.dedupe_key/.test(err.message)) {
        throw new Error('SAFETY_RULE_DUPLICATE');
      }
      throw err;
    });
  const created = await getSafetyRule(db, input.rule_id);
  if (!created) throw new Error('SAFETY_RULE_CREATE_FAILED');
  return created;
}

export async function getSafetyRule(db: Env['DB'], ruleId: string): Promise<SafetyRule | null> {
  return db
    .prepare('SELECT * FROM safety_rules WHERE rule_id = ?')
    .bind(ruleId)
    .first<SafetyRule>();
}

const RULE_ORDER = 'ORDER BY created_at, rule_id';

export async function listProtocolSafetyRules(db: Env['DB'], protocolId: string): Promise<SafetyRule[]> {
  return db
    .prepare(`SELECT * FROM safety_rules WHERE protocol_id = ? ${RULE_ORDER}`)
    .bind(protocolId)
    .all<SafetyRule>()
    .then((r) => r.results);
}

export async function listProtocolVersionSafetyRules(db: Env['DB'], versionId: string): Promise<SafetyRule[]> {
  return db
    .prepare(`SELECT * FROM safety_rules WHERE protocol_version_id = ? ${RULE_ORDER}`)
    .bind(versionId)
    .all<SafetyRule>()
    .then((r) => r.results);
}

export async function listPhaseSafetyRules(db: Env['DB'], phaseId: string): Promise<SafetyRule[]> {
  return db
    .prepare(`SELECT * FROM safety_rules WHERE phase_id = ? ${RULE_ORDER}`)
    .bind(phaseId)
    .all<SafetyRule>()
    .then((r) => r.results);
}

export async function listComponentSafetyRules(db: Env['DB'], componentId: string): Promise<SafetyRule[]> {
  return db
    .prepare(`SELECT * FROM safety_rules WHERE component_id = ? ${RULE_ORDER}`)
    .bind(componentId)
    .all<SafetyRule>()
    .then((r) => r.results);
}

/** Edge lifecycle only; protocol topology and endpoints untouched (tested). */
export async function setSafetyRuleActiveStatus(
  db: Env['DB'],
  ruleId: string,
  status: SafetyActiveStatus,
): Promise<SafetyRule> {
  await db
    .prepare(`UPDATE safety_rules SET active_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rule_id = ?`)
    .bind(status, ruleId)
    .run();
  const updated = await getSafetyRule(db, ruleId);
  if (!updated) throw new Error('SAFETY_RULE_NOT_FOUND');
  return updated;
}

export async function createSafetyRuleContext(
  db: Env['DB'],
  input: { context_id: string; rule_id: string; context_type: SafetyContextType; context_label: string },
): Promise<SafetyRuleContext> {
  if (!input.context_label.trim()) throw new Error('SAFETY_CONTEXT_LABEL_EMPTY');
  await db
    .prepare(
      `INSERT INTO safety_rule_contexts (context_id, rule_id, context_type, context_label)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.context_id, input.rule_id, input.context_type, input.context_label)
    .run();
  const created = await db
    .prepare('SELECT * FROM safety_rule_contexts WHERE context_id = ?')
    .bind(input.context_id)
    .first<SafetyRuleContext>();
  if (!created) throw new Error('SAFETY_CONTEXT_CREATE_FAILED');
  return created;
}

export async function listSafetyRuleContexts(db: Env['DB'], ruleId: string): Promise<SafetyRuleContext[]> {
  return db
    .prepare('SELECT * FROM safety_rule_contexts WHERE rule_id = ? ORDER BY context_type, context_label, context_id')
    .bind(ruleId)
    .all<SafetyRuleContext>()
    .then((r) => r.results);
}

export async function linkSafetyRuleClaim(
  db: Env['DB'],
  input: { rule_id: string; claim_id: string },
): Promise<{ rule_id: string; claim_id: string }> {
  await db
    .prepare('INSERT INTO safety_rule_claims (rule_id, claim_id) VALUES (?, ?)')
    .bind(input.rule_id, input.claim_id)
    .run();
  return { rule_id: input.rule_id, claim_id: input.claim_id };
}

export async function listSafetyRuleClaims(db: Env['DB'], ruleId: string): Promise<{ rule_id: string; claim_id: string }[]> {
  return db
    .prepare('SELECT rule_id, claim_id FROM safety_rule_claims WHERE rule_id = ? ORDER BY claim_id')
    .bind(ruleId)
    .all<{ rule_id: string; claim_id: string }>()
    .then((r) => r.results);
}

export async function linkSafetyRuleEvidence(
  db: Env['DB'],
  input: { rule_id: string; evidence_id: string },
): Promise<{ rule_id: string; evidence_id: string }> {
  await db
    .prepare('INSERT INTO safety_rule_evidence (rule_id, evidence_id) VALUES (?, ?)')
    .bind(input.rule_id, input.evidence_id)
    .run();
  return { rule_id: input.rule_id, evidence_id: input.evidence_id };
}

export async function listSafetyRuleEvidence(db: Env['DB'], ruleId: string): Promise<{ rule_id: string; evidence_id: string }[]> {
  return db
    .prepare('SELECT rule_id, evidence_id FROM safety_rule_evidence WHERE rule_id = ? ORDER BY evidence_id')
    .bind(ruleId)
    .all<{ rule_id: string; evidence_id: string }>()
    .then((r) => r.results);
}
