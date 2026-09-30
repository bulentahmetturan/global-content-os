/** Bible v4: one primary category per Tıp Topluluğu item. Burs/egitim prefixes; duyuru is the remainder. */
export function familyClause(family: string | undefined, alias = ''): { sql: string } {
  const sid = `COALESCE(${alias}source_id, '')`;
  const fid = `COALESCE(${alias}feed_id, '')`;
  if (family === 'burs') return { sql: ` AND (${sid} LIKE 'burs_%' OR ${fid} LIKE 'burs_%')` };
  if (family === 'egitim') return { sql: ` AND (${sid} LIKE 'egitim_%' OR ${fid} LIKE 'egitim_%')` };
  if (family === 'duyuru') {
    return {
      sql: ` AND ${sid} NOT LIKE 'burs_%' AND ${fid} NOT LIKE 'burs_%' AND ${sid} NOT LIKE 'egitim_%' AND ${fid} NOT LIKE 'egitim_%'`,
    };
  }
  return { sql: '' };
}
