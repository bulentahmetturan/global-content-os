/**
 * Acute-vs-structural router (PURE, local). It decides where a signal may feed, never touches production routing:
 *   single / local / acute event            -> TIME_SENSITIVE_CONTEXT
 *   repeated / structural issue             -> EVERGREEN_DOSSIER
 *   global emerging issue + frontier support -> FRONTIER_DOSSIER
 * A source event may feed both without duplicated acquisition (outcomes is a list). Whenever the evidence or the owner's policy
 * is missing the answer is WATCH / not ready; no numeric rule is invented here. For public-health topics a credible anchor
 * (official measurement/statistic, recognized surveillance or international dataset) is required and the qualification is
 * owner-configured: without it the router fails closed.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';
import { policyValue, type DossierPolicy } from './policy';

export type RouterOutcome = 'TIME_SENSITIVE_CONTEXT' | 'EVERGREEN_DOSSIER' | 'FRONTIER_DOSSIER' | 'WATCH';
export type EventKind = 'SINGLE_EVENT' | 'REPEATED_PATTERN' | 'STRUCTURAL_INDICATOR' | 'GLOBAL_EMERGING' | 'UNKNOWN';

export interface RouterEvidence {
  domain: string;
  eventKind: EventKind;
  /** Observed occurrences of the same pattern; only interpreted through the owner's repetition policy. */
  occurrences?: number;
  geographicSpread?: 'LOCAL' | 'REGIONAL' | 'NATIONAL' | 'MULTI_COUNTRY' | 'UNKNOWN';
  credibleAnchor: boolean | 'UNKNOWN';
  globalFrontierSupport: boolean | 'UNKNOWN';
}
export interface RouterDecision {
  outcomes: RouterOutcome[];
  reasons: string[];
  notReady: boolean;
}

const PUBLIC_HEALTH = 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH';

/** Interprets raw occurrences ONLY through the configured repetition policy; without it the answer is UNKNOWN (fail closed). */
export function classifyRepetition(occurrences: number | undefined, policy: DossierPolicy): { kind: 'REPEATED_PATTERN' | 'SINGLE_EVENT' | 'UNKNOWN'; reason?: string } {
  const p = policyValue(policy.repetitionCriteria);
  if (!p) return { kind: 'UNKNOWN', reason: 'POLICY_NOT_SET:repetition_criteria' };
  if (typeof occurrences !== 'number' || !Number.isFinite(occurrences)) return { kind: 'UNKNOWN', reason: 'occurrences_unknown' };
  return { kind: occurrences >= p.minOccurrences ? 'REPEATED_PATTERN' : 'SINGLE_EVENT' };
}

function dossierBranch(ev: RouterEvidence, policy: DossierPolicy, reasons: string[]): RouterOutcome | null {
  if (ev.domain === PUBLIC_HEALTH) {
    if (!policyValue(policy.publicHealthCredibleAnchor)) {
      reasons.push('POLICY_NOT_SET:public_health_credible_anchor');
      return null;
    }
    if (ev.credibleAnchor !== true) {
      reasons.push('NO_CREDIBLE_ANCHOR');
      return null;
    }
  }
  return 'EVERGREEN_DOSSIER';
}

export function routeSignal(ev: RouterEvidence, policy: DossierPolicy): RouterDecision {
  const reasons: string[] = [];
  const outcomes: RouterOutcome[] = [];
  if (!(vocab.router.event_kinds as string[]).includes(ev.eventKind)) return { outcomes: ['WATCH'], reasons: ['event_kind_not_in_vocabulary'], notReady: true };
  if (ev.eventKind === 'UNKNOWN') return { outcomes: ['WATCH'], reasons: ['event_kind_unknown'], notReady: true };
  if (ev.eventKind === 'SINGLE_EVENT') {
    outcomes.push('TIME_SENSITIVE_CONTEXT');
    if (ev.occurrences !== undefined) {
      const rep = classifyRepetition(ev.occurrences, policy);
      if (rep.kind === 'UNKNOWN' && rep.reason) reasons.push(rep.reason);
      if (rep.kind === 'REPEATED_PATTERN') {
        const d = dossierBranch(ev, policy, reasons);
        if (d) outcomes.push(d);
      }
    }
    return { outcomes, reasons, notReady: false };
  }
  if (ev.eventKind === 'GLOBAL_EMERGING') {
    if (ev.globalFrontierSupport === true) return { outcomes: ['FRONTIER_DOSSIER'], reasons, notReady: false };
    reasons.push(ev.globalFrontierSupport === 'UNKNOWN' ? 'GLOBAL_FRONTIER_SUPPORT_UNKNOWN' : 'NO_FRONTIER_SUPPORT');
    return { outcomes: ['WATCH'], reasons, notReady: true };
  }
  // REPEATED_PATTERN | STRUCTURAL_INDICATOR
  const d = dossierBranch(ev, policy, reasons);
  if (d) outcomes.push(d);
  if (ev.globalFrontierSupport === true && d) outcomes.push('FRONTIER_DOSSIER');
  return outcomes.length ? { outcomes, reasons, notReady: false } : { outcomes: ['WATCH'], reasons, notReady: true };
}
