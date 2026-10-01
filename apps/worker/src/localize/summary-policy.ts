/**
 * Bounded summary policy per source type: what the grounded summary may say, and what the grounding judge additionally
 * rejects for that type. There is no universal summary prompt. Common rules (evidence only, no new facts / numbers /
 * entities, Turkish only, 1-2 sentences) are in pipeline.ts and contract.ts and apply to every type.
 */
import type { SourceType } from './source-type';

export interface SummaryPolicy {
  type: SourceType;
  /** Turkish instructions for the generator (appended to the common rules). */
  focus: string;
  /** English rules appended to the grounding judge (UNSUPPORTED conditions specific to this type). */
  judge: string;
}

export const SUMMARY_POLICIES: Record<SourceType, SummaryPolicy> = {
  news: {
    type: 'news',
    focus:
      '- Haber: kim ne yaptı / ne oldu; EVIDENCE\'da varsa nerede ve ne zaman. ' +
      'Önem, etki, tepki, neden veya sonuç yorumu ekleme; "çığır açan", "önemli" gibi değerlendirme sözcükleri kullanma.',
    judge:
      'News rules: UNSUPPORTED if the summary adds significance, motive, consequence, reaction or an evaluation that the SOURCE does not state, ' +
      'or attributes a statement or action to a different actor.',
  },
  research: {
    type: 'research',
    focus:
      '- Araştırma: EVIDENCE\'da varsa çalışmanın türü ve örneklemi, sonra bildirilen ana bulgu. ' +
      'İlişkiyi nedensellik gibi yazma ("ilişkili" bulgu "neden olur" olmaz); "olabilir", "düşündürüyor" gibi temkinli ifadeleri koru. ' +
      'Protokol, kayıt veya veri seti ise sonuç varmış gibi yazma; yalnız neyi incelediğini/içerdiğini söyle.',
    judge:
      'Research rules: UNSUPPORTED if an association is presented as causation, a hedge (may, might, could, suggests, associated) is dropped, ' +
      'a protocol, registration or dataset is presented as having results, or the population, sample size or comparison differs from the SOURCE.',
  },
  consumer_health: {
    type: 'consumer_health',
    focus:
      '- Tüketici sağlığı / başvuru içeriği: sayfanın neyi anlattığını betimle (ör. "... anlatılıyor", "... açıklanıyor"). ' +
      'Kaynakta olmayan tavsiye, doz, tanı, tedavi veya fayda iddiası ekleme; kaynaktaki tavsiyeyi genelleştirme veya kesinleştirme.',
    judge:
      'Consumer health rules: UNSUPPORTED if the summary gives advice, a dose, a diagnosis or a benefit/safety claim that the SOURCE does not state, ' +
      'turns a description into a recommendation, or makes a hedged statement certain.',
  },
  regulation: {
    type: 'regulation',
    focus:
      '- Düzenleme / duyuru: hangi kurum, hangi işlem (onay, izin, taslak, görüş, rapor, duyuru, geri çağırma, sürüm notu) ve neyle ilgili. ' +
      'İşlem türünü değiştirme (taslak ≠ nihai, görüş ≠ karar, izin ≠ onay, değerlendirme ≠ yasak); kapsamı genişletme.',
    judge:
      'Regulation / announcement rules: UNSUPPORTED if the authority, the type of action (draft vs final, opinion vs decision, clearance vs approval, ' +
      'evaluation vs ban), the product or the scope differs from the SOURCE.',
  },
};

export function summaryPolicy(type: SourceType): SummaryPolicy {
  return SUMMARY_POLICIES[type] || SUMMARY_POLICIES.news;
}
