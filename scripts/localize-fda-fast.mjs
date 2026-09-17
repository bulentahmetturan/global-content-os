const base = process.argv[2] || 'http://127.0.0.1:8787';
const GTX =
  'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=';

async function tr(text) {
  const url = GTX + encodeURIComponent(String(text).slice(0, 900));
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json,text/plain,*/*',
    },
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`gtx ${res.status}: ${raw.slice(0, 120)}`);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`gtx non-json: ${raw.slice(0, 120)}`);
  }
  return data[0].map((c) => c[0]).join('').trim();
}

(async () => {
  const res = await fetch(`${base}/api/items?route=kaduse-news&status=inbox`);
  const data = await res.json();
  const hits = (data.items || []).filter(
    (it) =>
      /Freeze-Dried|Ezplaz|freeze-dried plasma/i.test(it.title || '') ||
      /Freeze-Dried|Ezplaz/i.test(it.titleOrig || '') ||
      /Ezplaz/i.test(it.summary || '')
  );
  console.log('hits', hits.length);
  const out = [];
  for (const it of hits) {
    const src =
      it.titleOrig && /[A-Za-z]{4}/.test(it.titleOrig) ? it.titleOrig : it.title;
    const titleTr = await tr(src);
    await new Promise((r) => setTimeout(r, 200));
    const take =
      'Ezplaz is the first freeze-dried plasma licensed in the U.S. for adult transfusion when other plasma products are unavailable.';
    const gistTr = await tr(take);
    out.push({
      id: it.id,
      title: titleTr,
      titleOrig: src,
      summary: gistTr,
      gists: [gistTr],
    });
    console.log('TR', titleTr);
    console.log('GIST', gistTr);
  }
  if (!out.length) return;
  const a = await fetch(`${base}/api/localize/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: out }),
  });
  console.log('apply', await a.json());
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
