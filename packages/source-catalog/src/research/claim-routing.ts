// Access-scope-aware claim validation (Batch R1 section 22): claim scope
// must never exceed access scope. Fail-closed, no probabilistic score --
// mirrors clinical-education/ and stethoscope-guide/'s claim-routing
// discipline.
import { ACCESS_LEVEL_ALLOWED_LOCATORS, type AccessLevel, type ResearchClaim, type ResearchEvidenceStatus, type IntegrityStatus, type PeerReviewStatus } from './schemas.js';

export interface ClaimValidationResult {
  ok: boolean;
  reason?: string;
}

// A claim is valid only if its locator is actually reachable at the paper's
// access level (e.g. FULL_TEXT_RESULTS is unreachable for an abstract-only
// paper) -- never whether the claim "sounds right".
export function validateClaim(claim: ResearchClaim, accessLevel: AccessLevel): ClaimValidationResult {
  if (accessLevel === 'INSUFFICIENT_PUBLIC_INFORMATION') {
    return { ok: false, reason: 'INSUFFICIENT_PUBLIC_INFORMATION: no claim may be made' };
  }
  const allowedLocators = ACCESS_LEVEL_ALLOWED_LOCATORS[accessLevel];
  if (!allowedLocators.includes(claim.locator)) {
    return { ok: false, reason: `locator ${claim.locator} is not reachable at access level ${accessLevel}` };
  }
  return { ok: true };
}

// Hard rule (section 12/64): a RETRACTED paper is never eligible for a
// normal Research post, regardless of how good its claims otherwise are.
export function checkIntegrityGate(integrityStatus: IntegrityStatus): ClaimValidationResult {
  if (integrityStatus === 'RETRACTED') {
    return { ok: false, reason: 'RETRACTED papers are not eligible for a normal Research post' };
  }
  return { ok: true };
}

// Hard rule (section 18/64): a preprint must never be labeled peer-reviewed.
export function checkPeerReviewLabel(peerReviewStatus: PeerReviewStatus, claimedAsPeerReviewed: boolean): ClaimValidationResult {
  if (peerReviewStatus === 'PREPRINT' && claimedAsPeerReviewed) {
    return { ok: false, reason: 'a PREPRINT can never be labeled/claimed as peer reviewed' };
  }
  return { ok: true };
}

export function resolveEvidenceStatus(
  claims: ResearchClaim[],
  accessLevel: AccessLevel,
  integrityStatus: IntegrityStatus
): ResearchEvidenceStatus {
  if (checkIntegrityGate(integrityStatus).ok === false) return 'BLOCKED';
  if (accessLevel === 'INSUFFICIENT_PUBLIC_INFORMATION') return 'INSUFFICIENT_EVIDENCE';
  if (claims.length === 0) return 'UNVERIFIED';
  const allValid = claims.every((c) => validateClaim(c, accessLevel).ok);
  return allValid ? 'VERIFIED' : 'BLOCKED';
}
