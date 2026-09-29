// Secret/config readiness by NAME only. Values are never read, stored, or printed.
// The only "configured" indicator is an operator-supplied export of `wrangler secret list`
// (JSON array of {name,type} -- names only). Without it, state is 'unknown'.
import { readFileSync } from 'node:fs';

export function namesFromSecretList(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.map((e) => (typeof e === 'string' ? e : e.name)).filter(Boolean);
}

/** state per secret: 'configured' | 'missing' | 'unknown' (no indicator supplied). */
export function secretStates(required, configuredNames) {
  return required.map((s) => ({
    name: s.name,
    requiredFor: s.requiredFor,
    state: configuredNames === null ? 'unknown' : configuredNames.includes(s.name) ? 'configured' : 'missing',
  }));
}
