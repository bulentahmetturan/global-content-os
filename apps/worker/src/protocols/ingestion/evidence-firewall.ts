/**
 * Scientific evidence firewall — the binding constraint of this sprint.
 *
 * Discovery provenance NEVER becomes scientific evidence. Each evidence class
 * is firewall-separated:
 *   IDENTITY / DEFINITION / VERSION / COMPONENT / CLINICAL_CLAIM / SAFETY / COMMERCIAL
 *
 * Rules enforced here (pure, no DB):
 * - describing a protocol ≠ proving efficacy (DEFINITION source ⇒ CONTEXT only)
 * - actor↔protocol edge ≠ clinical evidence (P4 never yields SUPPORTS)
 * - commercial assertion ≠ independent verification (COMMERCIAL ⇒ CONTEXT only)
 * - SAFETY links are stance-free; severity states importance, never certainty
 * - missing evidence ⇒ NEEDS_REVIEW/MISSING, never fabrication (fail-closed)
 */

import type { EvidenceClass } from './types';
import type { LinkDirection } from '../evidence';

export interface FirewallLink {
  evidenceClass: EvidenceClass;
  direction: LinkDirection;
  claimType: string;
}

const DIRECTION_ALLOWLIST: Readonly<Record<EvidenceClass, readonly LinkDirection[]>> = {
  IDENTITY: ['CONTEXT'],
  DEFINITION: ['CONTEXT'],
  VERSION: ['CONTEXT'],
  COMPONENT: ['CONTEXT'],
  CLINICAL_CLAIM: ['SUPPORTS', 'CONTRADICTS', 'CONTEXT'],
  SAFETY: ['CONTEXT'],
  COMMERCIAL: ['CONTEXT'],
};

export function assertFirewallLink(link: FirewallLink): void {
  const allowed = DIRECTION_ALLOWLIST[link.evidenceClass];
  if (!allowed.includes(link.direction)) {
    throw new Error(`FIREWALL_VIOLATION:${link.evidenceClass} cannot use ${link.direction}`);
  }
  if (link.evidenceClass !== 'CLINICAL_CLAIM' && link.direction !== 'CONTEXT') {
    throw new Error(`DIRECTION_MISUSE:${link.evidenceClass}→${link.direction}`);
  }
}

/** Safety-critical content without verified provenance fails closed. */
export function assertSafetyAdmissible(input: { hasVerifiedProvenance: boolean; title: string }): void {
  if (!input.hasVerifiedProvenance) {
    throw new Error(`SAFETY_FAIL_CLOSED:${input.title.slice(0, 80)}`);
  }
}

/** Definition material may only ever link as CONTEXT (never efficacy). */
export function definitionDirection(): LinkDirection {
  return 'CONTEXT';
}
