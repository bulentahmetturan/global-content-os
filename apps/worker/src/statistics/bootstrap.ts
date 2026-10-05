/**
 * Minimal registry bootstrap: registers source IDENTITY rows from the frozen source registry. It never creates runtime policy, never activates
 * anything, never registers datasets/mappings. Every source therefore resolves to the frozen default DISABLED (no policy row).
 */
import type { StatisticsRepositories } from './index';
import type { SourceInput } from './repositories/sources';

/** Subset of a frozen registry record that bootstrap needs (docs/generated/statistics-source-registry-v1.json). */
export interface RegistrySource {
  source_id: string;
  display_name: string;
  organization: string;
  area: SourceInput['sourceArea'];
  disposition: SourceInput['disposition'];
  authority_level: string;
  official_homepage?: string | null;
}

/** The frozen registry artifact carries Windows-1252/UTF-8 mojibake in a few display names; repair only when the round-trip is lossless UTF-8. */
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
export function repairMojibake(s: string): string {
  if (!/[Â-Åâ]/.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x100) bytes.push(c);
    else if (CP1252[c] !== undefined) bytes.push(CP1252[c]);
    else return s;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

const ROLE: Record<string, SourceInput['upstreamRole']> = { SECONDARY_NORMALIZED: 'SECONDARY_NORMALIZED', DISCOVERY_CROSSCHECK: 'DISCOVERY', REFERENCE_METHODOLOGY: 'REFERENCE' };
const RELAYS = new Set(['WORLD_BANK_HEALTH', 'UNICEF_DATA', 'UN_WORLD_POPULATION_PROSPECTS']);

export function toSourceInput(r: RegistrySource): SourceInput {
  const ingestible = r.disposition === 'PRIMARY_CANONICAL' || r.disposition === 'CANONICAL_GATED';
  return {
    sourceId: r.source_id,
    displayName: repairMojibake(r.display_name).slice(0, 200),
    organization: repairMojibake(r.organization).slice(0, 200),
    sourceArea: r.area,
    disposition: r.disposition,
    authorityLevel: r.authority_level.slice(0, 80),
    upstreamRole: ROLE[r.disposition] ?? (RELAYS.has(r.source_id) ? 'INTERNATIONAL_RELAY' : 'PRIMARY_PRODUCER'),
    officialHomepage: r.official_homepage && /^https?:\/\//.test(r.official_homepage) ? r.official_homepage : null,
    architectureStatus: ingestible ? 'ARCHITECTURE_READY' : 'NOT_APPLICABLE',
    registryVersion: 'V1',
  };
}

export async function bootstrapSources(repos: StatisticsRepositories, sources: RegistrySource[]): Promise<{ registered: number; alreadyPresent: number; policyRows: number; activeOrGated: number }> {
  let registered = 0;
  let alreadyPresent = 0;
  for (const s of sources) {
    const r = await repos.sources.register(toSourceInput(s));
    if (r.created) registered++;
    else alreadyPresent++;
  }
  const policy = await repos.policy.countByState('DISABLED');
  const active = (await repos.policy.countByState('ACTIVE')) + (await repos.policy.countByState('ACTIVATION_GATED')) + (await repos.policy.countByState('PAUSED'));
  return { registered, alreadyPresent, policyRows: policy + active, activeOrGated: active };
}
