// Fail-closed auth + validation for the approved_brief handoff surfaces (Package 5).
// Pure functions: no D1, no fetch. Invariant: a missing/empty secret NEVER means "no auth required".

export type AuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

/** Constant-time string comparison (length is not secret here, contents are). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function bearerToken(header: string | null | undefined): string {
  return (header || '').replace(/^Bearer\s+/i, '').trim();
}

/** 503 when the server-side secret is not configured (misconfiguration, not a client error), 401 on mismatch. */
export function authorizeToken(
  expected: string | undefined,
  presented: string | null | undefined,
  notConfiguredError: string
): AuthResult {
  const exp = (expected || '').trim();
  if (!exp) return { ok: false, status: 503, error: notConfiguredError };
  const got = (presented || '').trim();
  if (!got || !safeEqual(got, exp)) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  return { ok: true };
}

export const PRODUCTION_STATUSES = ['accepted', 'designing', 'ready', 'published', 'failed'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

const MAX_DETAIL = 2000;

export type StatusCallbackParse =
  | { ok: true; value: { briefId: string; status: ProductionStatus; detail: string | null } }
  | { ok: false; error: string };

/** Strict payload validation for POST /api/handoff/status. */
export function parseStatusCallback(body: unknown): StatusCallbackParse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'INVALID_BODY' };
  const b = body as Record<string, unknown>;
  if (typeof b.briefId !== 'string' || !b.briefId.trim()) return { ok: false, error: 'INVALID_BODY' };
  if (typeof b.status !== 'string' || !(PRODUCTION_STATUSES as readonly string[]).includes(b.status)) {
    return { ok: false, error: 'UNSUPPORTED_STATUS' };
  }
  if (b.detail != null && typeof b.detail !== 'string') return { ok: false, error: 'INVALID_BODY' };
  const detail = b.detail == null ? null : b.detail.slice(0, MAX_DETAIL);
  return { ok: true, value: { briefId: b.briefId.trim(), status: b.status as ProductionStatus, detail } };
}

export type OutboundMode =
  | { mode: 'stub' }
  | { mode: 'send'; url: string; token: string }
  | { mode: 'misconfigured'; reason: string };

/** Live handoff requires BOTH url and token; anything less is a recorded failure, never an unauthenticated send. */
export function resolveOutbound(env: {
  CCOS_HANDOFF_STUB?: string;
  CCOS_HANDOFF_URL?: string;
  CCOS_HANDOFF_TOKEN?: string;
}): OutboundMode {
  if (env.CCOS_HANDOFF_STUB !== 'false') return { mode: 'stub' };
  const url = (env.CCOS_HANDOFF_URL || '').trim();
  const token = (env.CCOS_HANDOFF_TOKEN || '').trim();
  if (!url) return { mode: 'misconfigured', reason: 'CCOS_HANDOFF_URL_NOT_CONFIGURED' };
  if (!token) return { mode: 'misconfigured', reason: 'CCOS_HANDOFF_TOKEN_NOT_CONFIGURED' };
  return { mode: 'send', url, token };
}
