/**
 * Node-side Hub localization (reliable gtx from host, not Worker).
 * Translates English titles → TR + 1-sentence TR takeaway, then POSTs /api/localize/apply.
 *
 * Usage: node scripts/localize-hub-node.mjs [baseUrl] [route]
 */
const base = process.argv[2] || 'http://127.0.0.1:8787';
const routeArg = process.argv[3] || 'all';
const routes =
  routeArg === 'all'
    ? ['kaduse-news', 'kaduse-research', 'tip-ogrencileri']
    : [routeArg];

const GTX =
  'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=';

function looksMostlyEnglish(text) {
  const s = (text || '').trim();
  if (s.length < 8) return false;
  if (/[ğüşıöçĞÜŞİÖÇ]/.test(s)) return false;
  if (
    /\b(icin|ile|bir|ve|veya|duyuru|ogrenci|basvuru|sinav|fakulte|duyurusu|aciklandi|yayinlandi|tum|dikkatine|ruhsat|tedavi|kullanilabilir|urun|ilk|için|öğrenci|başvuru|sınav|fakülte|açıklandı|yayınlandı|kullanılabilir|ürün)\b/i.test(
      s
    )
  ) {
    return false;
  }
  return /\b(the|and|for|with|from|this|that|licenses?|licensed|announces?|published|study|patients?|vaccine|device|approval|approved|approves?|authoriz(?:ed|es)?|plasma|first(?:-|\s)?ever|workshop|program|therapy|digital|health|freeze[- ]dried|product|united states|u\.s\.|fda|who|nih|ema)\b/i.test(
    s
  );
}

async function translateToTr(text) {
  const raw = (text || '').trim();
  if (!raw) return raw;
  const url = GTX + encodeURIComponent(raw.slice(0, 900));
  const res = await fetch(url, {
    headers: { 'User-Agent': 'global-content-os-node/0.2', Accept: 'application/json' },
  });
  if (!res.ok) return raw;
  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) return raw;
  return data[0].map((c) => (Array.isArray(c) ? c[0] : '')).join('').trim() || raw;
}

function makeTakeawayEn(title, summary) {
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
  const firstEver = claim.match(/\b(?:making it|becoming)?\s*(?:the\s+)?first[^.!]{10,140}/i);
  if (firstEver && firstEver[0].length < claim.length) {
    const head = claim.match(/\b(FDA|WHO|EMA|NIH)\b[^,]{0,40}/i)?.[0];
    claim = [head, firstEver[0].replace(/^making it\s+/i, '').trim()].filter(Boolean).join(' — ');
  }
  claim = claim
    .replace(/^(The\s+)?(U\.S\.\s+)?Food and Drug Administration(\s+today)?\s+/i, 'FDA ')
    .replace(/^(FDA|WHO|NIH|EMA)\s+today\s+/i, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  if (claim.length > 160) {
    const cut = claim.slice(0, 160);
    const sp = cut.lastIndexOf(' ');
    claim = (sp > 80 ? cut.slice(0, sp) : cut).trim() + '…';
  }
  return claim;
}

async function localizeItem(it) {
  const sourceTitle = (it.titleOrig && looksMostlyEnglish(it.titleOrig)
    ? it.titleOrig
    : looksMostlyEnglish(it.title)
      ? it.title
      : it.titleOrig || it.title || ''
  ).trim();
  const sourceSummary = (it.summary || (it.gists && it.gists[0]) || sourceTitle).trim();
  if (!looksMostlyEnglish(sourceTitle) && !looksMostlyEnglish(sourceSummary.slice(0, 160))) {
    return null;
  }
  if (
    !looksMostlyEnglish(it.title) &&
    it.titleOrig &&
    it.titleOrig !== it.title &&
    !looksMostlyEnglish((it.gists && it.gists[0]) || it.summary || '')
  ) {
    return null;
  }

  const titleTr = await translateToTr(sourceTitle);
  await new Promise((r) => setTimeout(r, 80));
  const takeawayEn = makeTakeawayEn(sourceTitle, sourceSummary);
  const gistTr = await translateToTr(takeawayEn);
  if (titleTr === sourceTitle && looksMostlyEnglish(sourceTitle)) return null;

  return {
    id: it.id,
    title: titleTr || sourceTitle,
    titleOrig: sourceTitle !== titleTr ? sourceTitle : it.titleOrig || null,
    summary: gistTr || titleTr || sourceSummary.slice(0, 500),
    gists: [gistTr || titleTr || sourceSummary.slice(0, 280)],
  };
}

async function applyBatch(items) {
  const res = await fetch(`${base}/api/localize/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`apply ${res.status} ${await res.text()}`);
  return res.json();
}

async function runRoute(route) {
  const res = await fetch(
    `${base}/api/items?route=${encodeURIComponent(route)}&status=inbox`
  );
  if (!res.ok) throw new Error(`items ${res.status}`);
  const data = await res.json();
  const items = data.items || [];
  const english = items.filter(
    (it) =>
      looksMostlyEnglish(it.title) ||
      looksMostlyEnglish((it.gists && it.gists[0]) || '') ||
      looksMostlyEnglish((it.summary || '').slice(0, 160))
  );
  console.log(route, 'inbox', items.length, 'english', english.length);

  let updated = 0;
  let skipped = 0;
  const batch = [];
  for (const it of english) {
    try {
      const loc = await localizeItem(it);
      if (!loc) {
        skipped += 1;
        continue;
      }
      batch.push(loc);
      updated += 1;
      if (batch.length >= 15) {
        const r = await applyBatch(batch.splice(0, batch.length));
        console.log(route, 'applied', r.updated);
      }
      if (updated % 20 === 0) console.log(route, 'progress', updated, '/', english.length);
    } catch (e) {
      console.error(route, it.id, e.message || e);
      skipped += 1;
    }
  }
  if (batch.length) {
    const r = await applyBatch(batch);
    console.log(route, 'applied', r.updated);
  }
  console.log(route, 'done updated', updated, 'skipped', skipped);
}

async function main() {
  for (const route of routes) {
    await runRoute(route);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
