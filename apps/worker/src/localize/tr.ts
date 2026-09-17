/**
 * Hub localization: Turkish primary title + one-sentence Turkish takeaway gist.
 * Does not invent facts — compresses/translates only what the source already says.
 */

const GTX =
  'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=';

export function looksMostlyEnglish(text: string): boolean {
  const s = (text || '').trim();
  if (s.length < 8) return false;
  if (/[ğüşıöçĞÜŞİÖÇ]/.test(s)) return false;
  // Turkish without diacritics / common TR tokens
  if (
    /\b(icin|ile|bir|ve|veya|duyuru|ogrenci|basvuru|sinav|fakulte|duyurusu|aciklandi|yayinlandi|tum|dikkatine|ruhsat|tedavi|kullanilabilir|urun|ilk)\b/i.test(
      s
    )
  ) {
    return false;
  }
  if (
    /\b(için|ile|bir|ve|veya|duyuru|öğrenci|başvuru|sınav|fakülte|duyurusu|açıklandı|yayınlandı|ruhsat|tedavi|kullanılabilir|ürün)\b/i.test(
      s
    )
  ) {
    return false;
  }
  // Require clear English cues — do not treat all Latin text as English
  return /\b(the|and|for|with|from|this|that|licenses?|licensed|announces?|published|study|patients?|vaccine|device|approval|approved|approves?|authoriz(?:ed|es)?|plasma|first(?:-|\s)?ever|workshop|program|therapy|digital|health|freeze[- ]dried|product|united states|u\.s\.|fda|who|nih|ema|council|press|release|conclusions?|employment|policy|consumer|affairs|newsroom|prequalifies|strategy|partnership|becomes|appointed)\b/i.test(
    s
  );
}

export async function translateToTr(text: string, opts?: { force?: boolean }): Promise<string> {
  const raw = (text || '').trim();
  if (!raw) return raw;
  if (!opts?.force && !looksMostlyEnglish(raw)) return raw;
  try {
    const url = GTX + encodeURIComponent(raw.slice(0, 900));
    const res = await fetch(url, {
      headers: { 'User-Agent': 'global-content-os/0.2', Accept: 'application/json' },
    });
    if (!res.ok) return raw;
    const data = (await res.json()) as unknown;
    // Response shape: [[["translated","original",...],...], ...]
    if (!Array.isArray(data) || !Array.isArray(data[0])) return raw;
    const parts: string[] = [];
    for (const chunk of data[0] as unknown[]) {
      if (Array.isArray(chunk) && typeof chunk[0] === 'string') parts.push(chunk[0]);
    }
    const out = parts.join('').trim();
    return out || raw;
  } catch {
    return raw;
  }
}

/**
 * One English sentence takeaway grounded in title+summary (no new facts).
 * Prefer a short conclusion-style claim when the source already states one.
 */
export function makeTakeawayEn(title: string, summary: string): string {
  const t = (title || '').trim();
  const s = (summary || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 24 && !/appeared first on/i.test(x));

  const conclusionish =
    sentences.find((x) =>
      /\b(can be used|may be used|is useful|improves?|reduces?|increases?|effective|licensed|approved|authoriz(?:ed|es)|first|enables?|allows?|intended for|associated with|suggests?|concludes?|useful for|treat(?:s|ment)?)\b/i.test(
        x
      )
    ) ||
    sentences[0] ||
    '';

  let claim = conclusionish || t;

  // Compress long lead-ins into the outcome clause when present
  const firstEver = claim.match(
    /\b(?:making it|becoming)?\s*(?:the\s+)?first[^.!]{10,140}/i
  );
  if (firstEver && firstEver[0].length < claim.length) {
    const head = claim.match(/\b(FDA|WHO|EMA|NIH)\b[^,]{0,40}/i)?.[0];
    claim = [head, firstEver[0].replace(/^making it\s+/i, '').trim()].filter(Boolean).join(' — ');
  }

  claim = claim
    .replace(/^(The\s+)?(U\.S\.\s+)?Food and Drug Administration(\s+today)?\s+/i, 'FDA ')
    .replace(/^(FDA|WHO|NIH|EMA|TİTCK)\s+today\s+/i, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

  // Hard cap: Hub wants ~1 short sentence
  if (claim.length > 160) {
    const cut = claim.slice(0, 160);
    const sp = cut.lastIndexOf(' ');
    claim = (sp > 80 ? cut.slice(0, sp) : cut).trim() + '…';
  }
  return claim;
}

export async function localizeForHub(input: {
  title: string;
  summary: string;
  titleOrig?: string | null;
  route?: string;
}): Promise<{ title: string; titleOrig: string | null; summary: string; gists: string[] }> {
  const sourceTitle = (input.titleOrig || input.title || '').trim();
  const sourceSummary = (input.summary || sourceTitle).trim();

  // Tip / already-Turkish: keep as-is
  if (!looksMostlyEnglish(sourceTitle) && !looksMostlyEnglish(sourceSummary)) {
    return {
      title: input.title,
      titleOrig: input.titleOrig ?? null,
      summary: sourceSummary.slice(0, 500),
      gists: [sourceSummary.slice(0, 280)],
    };
  }

  const titleTr = await translateToTr(sourceTitle, { force: true });
  const takeawayEn = makeTakeawayEn(sourceTitle, sourceSummary);
  const gistTr = await translateToTr(takeawayEn, { force: true });

  return {
    title: titleTr || sourceTitle,
    titleOrig: sourceTitle !== titleTr ? sourceTitle : input.titleOrig ?? null,
    summary: gistTr || titleTr || sourceSummary,
    gists: [gistTr || titleTr || sourceSummary.slice(0, 280)],
  };
}
