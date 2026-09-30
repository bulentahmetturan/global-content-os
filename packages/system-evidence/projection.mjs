// Human-readable projection of USER_REPORTED_ISSUE records into the Tıp Topluluğu issue list
// (adapters/tip-toplulugu-radar/content/SORUN-TESPIT-LISTESI.md, between the markers). The ledger is the only editable truth;
// the table is regenerated, never hand-edited. Legacy rows keep their original markdown while their ledger state is the
// state they were imported with; any later lifecycle change regenerates the row's status cell.
export const BEGIN = '<!-- SYSTEM-EVIDENCE:BEGIN generated from docs/evidence/system-evidence.ndjson by `node scripts/evidence.mjs project`; do not edit -->';
export const END = '<!-- SYSTEM-EVIDENCE:END -->';
export const HEADER = ['| # | Bildirilen sorun | Kök neden | Yapılan | Kontrol | Durum |', '|---|---|---|---|---|---|'];

const cell = (s) => String(s ?? '-').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const day = (iso) => String(iso || '').slice(0, 10);

export function statusText(r) {
  if (r.status === 'CLOSED') return `KAPALI (${day(r.updated_at)}): ${r.resolution}`;
  if (r.status === 'DEFERRED') return `ERTELENDİ: ${r.deferral.reason} (sahip: ${r.deferral.owner}; tetik: ${r.deferral.review_trigger})`;
  if (r.status === 'REJECTED') return `REDDEDİLDİ: ${r.resolution}`;
  if (r.status === 'VERIFIED') return `DOĞRULANDI (${day(r.updated_at)}): ${r.verification_reference?.id || r.verification_reference?.note || ''}`;
  return `AÇIK (${r.status}; sahip: ${r.owning_pillar}/${r.owning_subsystem})`;
}

/** Replaces only the last (Durum) cell of a legacy markdown row. */
export function withStatus(row, text) {
  const trimmed = row.replace(/\s*\|\s*$/, '');
  const cut = trimmed.lastIndexOf('|');
  return `${trimmed.slice(0, cut)}| ${cell(text)} |`;
}

// The one-time legacy import stored at most this many characters of the old status text.
export const LEGACY_STATUS_CAP = 160;

function previousStatus(r, status) {
  const prev = r.legacy_status_text;
  if (!prev || status.includes(prev)) return '';
  return ` — önceki: ${prev}${prev.length >= LEGACY_STATUS_CAP ? '…' : ''}`;
}

export function renderRow(r) {
  if (r.legacy_row) {
    if (r.status === r.legacy_status) return r.legacy_row;
    const status = statusText(r);
    return withStatus(r.legacy_row, `${status}${previousStatus(r, status)}`);
  }
  return `| ${r.evidence_id} | ${cell(r.summary)} | ${cell(r.before_state)} | ${cell(r.implementation_reference?.note || r.implementation_reference?.id || r.implementation_reference?.sha)} | ${cell(r.verification_reference?.id || r.verification_reference?.note)} | ${cell(statusText(r))} |`;
}

export function renderTable(records) {
  const users = [...records.values()].filter((r) => r.type === 'USER_REPORTED_ISSUE');
  users.sort((a, b) => (a.legacy_order ?? 1e9) - (b.legacy_order ?? 1e9) || a.created_at.localeCompare(b.created_at));
  return [BEGIN, ...HEADER, ...users.map(renderRow), END].join('\n');
}

/** Returns the document with the generated region replaced; throws when the markers are missing. */
export function applyProjection(text, table) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lf = text.split('\r\n').join('\n');
  const a = lf.indexOf(BEGIN);
  const b = lf.indexOf(END);
  if (a < 0 || b < a) throw new Error('SYSTEM-EVIDENCE markers not found');
  return (lf.slice(0, a) + table + lf.slice(b + END.length)).split('\n').join(eol);
}

export function extractRegion(text) {
  const lf = text.split('\r\n').join('\n');
  const a = lf.indexOf(BEGIN);
  const b = lf.indexOf(END);
  return a < 0 || b < a ? null : lf.slice(a, b + END.length);
}
