// Owner-approved five-item display contract. Not deployment or write authorization.
export const APPROVED_PROTOCOL_DISPLAY = [
  { id: 'dash-item-booklet', url: 'https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf', title: 'DASH ile Kan Basıncınızı Düşürme Rehberi', summary: "Nisan 2006'da gözden geçirilen NIH Yayını No. 06-4082, resmi DASH beslenme planındaki porsiyonları ve sodyum alımı seçeneklerini açıklar." },
  { id: 'dash-item-sodium-2001', url: 'https://pubmed.ncbi.nlm.nih.gov/11136953/', title: 'Azaltılmış Sodyum Alımının ve DASH Diyetinin Kan Basıncı Üzerindeki Etkileri — DASH-Sodium Ortak Araştırma Grubu', summary: '412 katılımcılı randomize kontrollü DASH-Sodium çalışmasında, DASH diyeti ve azaltılmış sodyum alımı birlikte uygulandığında, yüksek sodyumlu kontrol diyetine kıyasla kan basıncında daha büyük düşüş gözlendi.' },
  { id: 'dash-item-trial-1997', url: 'https://pubmed.ncbi.nlm.nih.gov/9099655/', title: 'Beslenme Örüntülerinin Kan Basıncı Üzerindeki Etkilerine İlişkin Klinik Çalışma — DASH Ortak Araştırma Grubu', summary: '459 katılımcılı randomize kontrollü çalışmada, DASH kombinasyon diyeti sekiz hafta boyunca kontrol diyetine kıyasla kan basıncını düşürdü.' },
  { id: 'med-item-dga-2015', url: 'https://health.gov/dietaryguidelines/2015/guidelines/appendix-4/', title: 'Amerikalılar İçin Beslenme Rehberi 2015–2020: Ek 4 — Sağlıklı Akdeniz Tarzı Beslenme Örüntüsü', summary: "USDA/HHS'nin resmi Akdeniz tarzı beslenme örüntüsü tablosu, 12 farklı günlük enerji düzeyine göre besin grubu miktarlarını; rehberin Bölüm 1'i ise beslenme sınırlarını açıklar." },
  { id: 'med-item-predimed-2018', url: 'https://pubmed.ncbi.nlm.nih.gov/29897866/', title: 'Natürel Sızma Zeytinyağı veya Sert Kabuklu Yemişlerle Desteklenen Akdeniz Diyetiyle Kardiyovasküler Hastalıkların Birincil Önlenmesi', summary: '2018’de randomizasyon sapmaları nedeniyle düzeltilip yeniden yayımlanan 7.447 katılımcılı randomize kontrollü PREDIMED çalışmasında, natürel sızma zeytinyağı veya sert kabuklu yemişlerle desteklenen Akdeniz diyeti gruplarında, yağ azaltma önerili kontrol grubuna göre majör kardiyovasküler olaylar daha seyrek görüldü.' },
] as const;

export function approvedProtocolGist(item: typeof APPROVED_PROTOCOL_DISPLAY[number]): string {
  return item.summary;
}

interface ReadDB { prepare(sql: string): { bind(...args: unknown[]): { first<T>(): Promise<T | null> } } }
const BIBLIOGRAPHIC = [
  { id: 'dash-item-sodium-2001', doi: '10.1056/nejm200101043440101', pmid: '11136953' },
  { id: 'dash-item-trial-1997', doi: '10.1056/nejm199704173361601', pmid: '9099655' },
  { id: 'med-item-predimed-2018', doi: '10.1056/nejmoa1800389', pmid: '29897866' },
];
export async function protectedBibliographicProtocol(db: ReadDB, identity: { doi?: string | null; pmid?: string | null }): Promise<string | null> {
  const doi = (identity.doi || '').trim().toLowerCase().replace(/^https:\/\/(?:www\.)?doi\.org\//, '').replace(/^doi:\s*/, '');
  const pmid = (identity.pmid || '').trim();
  const matched = BIBLIOGRAPHIC.find(x => (doi && x.doi === doi) || (pmid && x.pmid === pmid));
  if (!matched) return null;
  if ((doi && doi !== matched.doi) || (pmid && pmid !== matched.pmid)) throw new Error('BIBLIOGRAPHIC_IDENTITY_CONFLICT');
  return protectedProtocolDisplay(db, { id: matched.id });
}
interface ProtectedRow { id: string; canonical_url: string; route: string; discovery_reason: string; title: string; summary: string; gists_json: string }

export async function protectedProtocolDisplay(db: ReadDB, key: { id?: string; url?: string }): Promise<string | null> {
  const approved = APPROVED_PROTOCOL_DISPLAY.find(x => key.id ? x.id === key.id : x.url === key.url);
  if (!approved) return null;
  const row = await db.prepare('SELECT id,canonical_url,route,discovery_reason,title,summary,gists_json FROM source_items WHERE id = ?').bind(approved.id).first<ProtectedRow>();
  if (!row || row.canonical_url !== approved.url || row.route !== 'kaduse-research' || row.discovery_reason !== (approved.id.startsWith('dash-') ? 'protocol-wave-1-dash-controlled-import' : 'protocol-wave-2-med-controlled-import')) throw new Error('APPROVED_PROTOCOL_IDENTITY_MISMATCH');
  if (row.title !== approved.title || row.summary !== approved.summary || row.gists_json !== JSON.stringify([approvedProtocolGist(approved)])) throw new Error('APPROVED_PROTOCOL_DISPLAY_REMEDIATION_REQUIRED');
  return row.id;
}
