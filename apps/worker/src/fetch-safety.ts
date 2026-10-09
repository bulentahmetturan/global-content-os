/**
 * Fetch-target safety for operator-triggered fetches (SSRF containment).
 *
 * Pure, deterministic, dependency-free: hostname/IP-literal checks only.
 * Blocks loopback, private, link-local, CGNAT, reserved and multicast
 * ranges (IPv4 incl. decimal/octal/hex/single-integer obfuscations, plus
 * the common IPv6 forms), non-HTTP(S) schemes, and hostnames that can
 * never be public feed origins (localhost, single-label, .local/.internal/
 * .lan/.home/.corp/.intranet).
 *
 * What it does NOT cover (documented residual): DNS-rebinding (no DNS
 * resolution is available at this layer) and redirect chains — callers
 * must still use bounded fetch with timeouts and caps. The Doctor vehicle
 * fetches only operator-registered carrier URLs, so this guard is a
 * second barrier, not the first.
 */

const SINGLE_LABEL_ALLOW = new Set(['localhost']);

function ipv4ToInt(parts: number[]): number {
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function parseNum(s: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^0[0-7]+$/.test(s) && s.length > 1) return parseInt(s, 8);
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  return null;
}

/** Normalize an IPv4 literal incl. common obfuscations → 32-bit int, or null when not an IPv4 literal. */
export function normalizeIPv4(host: string): number | null {
  const h = host.replace(/\.$/, '');
  if (/^[0-9]+$/.test(h)) {
    // Single 32-bit integer form (e.g. 2130706433 = 127.0.0.1).
    const v = parseNum(h);
    if (v === null || v < 0 || v > 0xffffffff) return null;
    return v >>> 0;
  }
  const parts = h.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const v = parseNum(p);
    if (v === null || v < 0 || v > 255) return null;
    nums.push(v);
  }
  return ipv4ToInt(nums);
}

function inRange(v: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (v & mask) === (base & mask);
}

export function isBlockedIPv4(v: number): boolean {
  return (
    inRange(v, 0x00000000, 8) || // 0.0.0.0/8 (this network)
    inRange(v, 0x0a000000, 8) || // 10/8 private
    inRange(v, 0x7f000000, 8) || // 127/8 loopback
    inRange(v, 0x64400000, 10) || // 100.64/10 CGNAT
    inRange(v, 0xa9fe0000, 16) || // 169.254/16 link-local
    inRange(v, 0xac100000, 12) || // 172.16/12 private
    inRange(v, 0xc0a80000, 16) || // 192.168/16 private
    inRange(v, 0xe0000000, 4) || // 224/4 multicast
    inRange(v, 0xf0000000, 4) // 240/4 reserved
  );
}

function normalizedIPv6(host: string): string {
  let h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  // zone id (fe80::1%eth0) never denotes a distinct public host
  h = h.split('%')[0];
  return h;
}

export function isBlockedIPv6(host: string): boolean {
  const h = normalizedIPv6(host);
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fe80:') || h === 'fe80::') return true; // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local fc00::/7
  if (h.startsWith('ff')) return true; // multicast ff00::/8
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (SINGLE_LABEL_ALLOW.has(h)) return true;
  if (!h.includes('.')) return true; // single-label intranet names
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  for (const suffix of ['.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.test', '.example', '.invalid']) {
    if (h.endsWith(suffix)) return true;
  }
  return false;
}

export interface TargetVerdict {
  blocked: boolean;
  reason: 'BAD_URL' | 'BAD_SCHEME' | 'BLOCKED_HOST' | null;
}

/** Full verdict for a fetch target URL string. Fail-closed on unparseable input. */
export function checkFetchTarget(raw: string): TargetVerdict {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { blocked: true, reason: 'BAD_URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { blocked: true, reason: 'BAD_SCHEME' };
  }
  const host = u.hostname;
  const v4 = normalizeIPv4(host);
  if (v4 !== null) {
    return isBlockedIPv4(v4) ? { blocked: true, reason: 'BLOCKED_HOST' } : { blocked: false, reason: null };
  }
  if (host.includes(':')) {
    return isBlockedIPv6(host) ? { blocked: true, reason: 'BLOCKED_HOST' } : { blocked: false, reason: null };
  }
  return isBlockedHostname(host) ? { blocked: true, reason: 'BLOCKED_HOST' } : { blocked: false, reason: null };
}
