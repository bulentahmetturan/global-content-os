import { StatisticsError } from '../errors';
import { geographyId } from '../identity';
import { assertDate } from '../rules';
import type { StatisticsStorage } from '../storage';

export type GeoScheme = 'ISO3' | 'M49' | 'ISO3166_2' | 'NUTS' | 'TUIK_IBBS' | 'WHO_REGION' | 'UN_REGION' | 'AGG' | 'SOURCE_NATIVE';
export type GeoKind = 'COUNTRY' | 'TERRITORY' | 'PROVINCE' | 'NUTS_REGION' | 'SUPRANATIONAL' | 'AGGREGATE' | 'HISTORICAL' | 'OTHER';

export interface GeographyInput {
  scheme: GeoScheme;
  code: string;
  schemeVersion?: string;
  labelEn: string;
  labelTr?: string | null;
  kind: GeoKind;
  iso3?: string | null;
  parentGeographyId?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface GeographyRow {
  geography_id: string;
  scheme: GeoScheme;
  code: string;
  scheme_version: string;
  label_en: string;
  label_tr: string | null;
  kind: GeoKind;
  iso3: string | null;
  parent_geography_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

/**
 * Geography is the SUBJECT of a series. It says nothing about which source family produced the data: a GLOBAL-area source publishing
 * ISO3:TUR keeps source_area GLOBAL_HEALTH_STATISTICS (INV-008). Source-native geography codes use scheme SOURCE_NATIVE.
 */
export function geographyRepository(s: StatisticsStorage) {
  const get = (id: string) => s.first<GeographyRow>('SELECT * FROM statistics_geographies WHERE geography_id = ?1', id);
  return {
    get,

    async register(input: GeographyInput): Promise<{ geography: GeographyRow; created: boolean }> {
      if (input.validFrom) assertDate('validFrom', input.validFrom);
      if (input.validTo) assertDate('validTo', input.validTo);
      const id = geographyId(input.scheme, input.code, input.schemeVersion ?? '');
      const inserted = await s.all<{ geography_id: string }>(
        `INSERT INTO statistics_geographies (geography_id, scheme, code, scheme_version, label_en, label_tr, kind, iso3, parent_geography_id, valid_from, valid_to)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(geography_id) DO NOTHING RETURNING geography_id`,
        id, input.scheme, input.code, input.schemeVersion ?? '', input.labelEn, input.labelTr ?? null, input.kind, input.iso3 ?? null, input.parentGeographyId ?? null, input.validFrom ?? null, input.validTo ?? null,
      );
      const row = (await get(id))!;
      if (inserted.length === 0 && (row.kind !== input.kind || (row.parent_geography_id ?? null) !== (input.parentGeographyId ?? null))) {
        throw new StatisticsError('STATISTICS_IDEMPOTENCY_CONFLICT', 'geography already registered with a different kind or parent', { detail: { geographyId: id } });
      }
      return { geography: row, created: inserted.length === 1 };
    },

    /** Direct children (idx_stat_geo_parent). */
    children: (parentId: string, limit: number) => s.all<GeographyRow>('SELECT * FROM statistics_geographies WHERE parent_geography_id = ?1 ORDER BY geography_id LIMIT ?2', parentId, s.requireLimit(limit)),

    /** Ancestor chain, bounded by maxDepth. */
    async ancestors(id: string, maxDepth = 8): Promise<GeographyRow[]> {
      const out: GeographyRow[] = [];
      let cur = await get(id);
      for (let i = 0; i < maxDepth && cur?.parent_geography_id; i++) {
        cur = await get(cur.parent_geography_id);
        if (!cur) break;
        out.push(cur);
      }
      return out;
    },

    /** True when the geography is valid on the given date (open bounds are unbounded). */
    async isValidOn(id: string, date: string): Promise<boolean> {
      assertDate('date', date);
      const g = await get(id);
      if (!g) return false;
      return (!g.valid_from || g.valid_from <= date) && (!g.valid_to || g.valid_to >= date);
    },
  };
}
