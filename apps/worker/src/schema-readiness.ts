import { HISTORICAL_APPLIED_NAME_MAP, HISTORICAL_PROVENANCE_AUDIT_LABEL } from './historical-migration-map';
import { REQUIRED_CONTENT_MIGRATIONS, REQUIRED_STATISTICS_MIGRATIONS, WORKSTREAM_MIGRATIONS, WORKSTREAM_CAPABILITIES, STATISTICS_CAPABILITIES } from './schema-contract';

export type SchemaStatus = { level: 'READY' | 'BLOCKED'; missingMigrations: string[]; missingCapabilities: string[]; mappedMigrations?: string[]; mappedProvenance?: string };
export type SchemaSnapshot = { content: SchemaStatus; workstreams: Record<string, SchemaStatus>; statistics: SchemaStatus };
const cache = new WeakMap<D1Database, { expires: number; result: Promise<{ ledger: string[]; capabilities: Set<string> }> }>();

async function inspect(db: D1Database, names: readonly string[], capabilities: Record<string, string[]>): Promise<{ ledger: string[]; capabilities: Set<string> }> {
  const found = cache.get(db);
  if (found && found.expires > Date.now()) return found.result;
  const result = (async () => {
    const tables = Object.keys(capabilities);
    // Only the closed Gate B list can add counterpart names to the bounded ledger lookup.
    const lookup = [...new Set([...names, ...names.map(n => HISTORICAL_APPLIED_NAME_MAP[n]).filter((n): n is string => !!n)])];
    // Bounded by the generated contract, metadata only; never scans content rows.
    const results = await db.batch([
      db.prepare(`SELECT name FROM d1_migrations WHERE name IN (${lookup.map(() => '?').join(',')})`).bind(...lookup),
      ...tables.map(table => db.prepare(`PRAGMA table_info("${table}")`)),
    ]);
    if (results.some(r => !r.success)) throw new Error('SCHEMA_METADATA_QUERY_FAILED');
    const present = new Set<string>();
    tables.forEach((table, i) => {
      const columns = results[i + 1].results as { name: string }[];
      if (columns.length) present.add(table);
      columns.forEach(column => present.add(`${table}.${column.name}`));
    });
    return { ledger: (results[0].results as { name: string }[]).map(r => r.name), capabilities: present };
  })();
  cache.set(db, { expires: Date.now() + 30_000, result });
  return result;
}
function evaluate(snapshot: { ledger: string[]; capabilities: Set<string> } | null, names: readonly string[], capabilities: Record<string, string[]>): SchemaStatus {
  const applied = new Set(snapshot?.ledger ?? []);
  // Exact name first. The owner-approved historical map may satisfy only its six names, and only via the
  // exact production counterpart present in the ledger; every other name stays exact-filename.
  const mapped = (n: string) => Object.prototype.hasOwnProperty.call(HISTORICAL_APPLIED_NAME_MAP, n) ? HISTORICAL_APPLIED_NAME_MAP[n] : null;
  const satisfied = (n: string) => applied.has(n) || (mapped(n) !== null && applied.has(mapped(n) as string));
  const missingMigrations = names.filter(n => !satisfied(n));
  const mappedMigrations = names.filter(n => !applied.has(n) && satisfied(n));
  const missingCapabilities = Object.entries(capabilities).flatMap(([table, columns]) => [table, ...columns.map(c => `${table}.${c}`)]).filter(c => !snapshot?.capabilities.has(c));
  return { level: missingMigrations.length || missingCapabilities.length ? 'BLOCKED' : 'READY', missingMigrations, missingCapabilities, mappedMigrations, ...(mappedMigrations.length ? { mappedProvenance: HISTORICAL_PROVENANCE_AUDIT_LABEL } : {}) };
}
export async function gatherSchemaReadiness(contentDb: D1Database, statisticsDb?: D1Database): Promise<SchemaSnapshot> {
  const combined = Object.assign({}, ...Object.values(WORKSTREAM_CAPABILITIES));
  const content = await inspect(contentDb, REQUIRED_CONTENT_MIGRATIONS, combined).catch(() => null);
  const statistics = statisticsDb && statisticsDb !== contentDb
    ? await inspect(statisticsDb, REQUIRED_STATISTICS_MIGRATIONS, STATISTICS_CAPABILITIES).catch(() => null) : null;
  return {
    content: evaluate(content, REQUIRED_CONTENT_MIGRATIONS, combined),
    workstreams: Object.fromEntries(Object.entries(WORKSTREAM_CAPABILITIES).map(([name, capabilities]) => [name, evaluate(content, WORKSTREAM_MIGRATIONS[name], capabilities)])),
    statistics: evaluate(statistics, REQUIRED_STATISTICS_MIGRATIONS, STATISTICS_CAPABILITIES),
  };
}
