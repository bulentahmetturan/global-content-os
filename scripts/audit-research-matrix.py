#!/usr/bin/env python3
"""Bible 4.3 x Research sources matrix audit (kaduse-research). Reads the LIVE Hub API + repo files; writes
docs/audits/research-matrix-<date>.{md,csv}. Item metrics use a sample (the API caps a page at 500 and ignores offset):
the 500 newest inbox + all hold items shown. Rules marked 'judgement' are heuristics, not proof.
Usage: python scripts/audit-research-matrix.py [YYYY-MM-DD]"""
import csv, datetime, json, re, subprocess, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
B = "https://global-content-os.channel-content-os-mcp.workers.dev"
DATE = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
NOW = datetime.datetime.fromisoformat(DATE + "T23:59:00+00:00")


def get(url):
    r = subprocess.run(["curl", "-s", "-A", "curl/8", url], capture_output=True)
    return json.loads(r.stdout.decode("utf-8"))


feeds = {f["id"]: f for f in get(f"{B}/api/feeds?route=kaduse-research")["feeds"]}
other = []
for route in ("kaduse-news", "tip-ogrencileri"):
    other += get(f"{B}/api/feeds?route={route}")["feeds"]
items = {}
for st in ("inbox", "hold"):
    for x in get(f"{B}/api/items?route=kaduse-research&status={st}&limit=500&days=3650")["items"]:
        x["_st"] = st
        items[x["id"]] = x
by = defaultdict(list)
for x in items.values():
    by[x["feedId"]].append(x)

cfg = {f["id"]: f for f in json.loads((ROOT / "config/feeds.json").read_text(encoding="utf-8"))["feeds"]}
reg = {s["sourceId"]: s for s in json.loads((ROOT / "packages/source-catalog/data/research-sources.json").read_text(encoding="utf-8"))}
audits_text = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in (ROOT / "docs/audits").glob("*.md") if "research-matrix" not in p.name and "research-audit" not in p.name)
bible = (ROOT / "adapters/tip-toplulugu-radar/content/config/bible-config.json").read_text(encoding="utf-8")

NONART = re.compile(r"^(error in|erratum|corrigendum|correction|retraction|reply|letter|editorial|comment on|in this issue|cover|table of contents|opinion)|information for authors|^stat\+|pharmalittle|\(image\)$", re.I)
INTEG = re.compile(r"retraction|retracted|erratum|corrigendum|correction to|error in", re.I)
GENERAL_SCIENCE = {"cell", "nature", "nature-news", "nature-genetics", "nature-biotechnology", "ieee-tbme", "ieee-jbhi"}
NEWSLIKE = {"medical-xpress", "stat-news", "eurekalert", "asn-news"}

CHECKS = [  # id, Bible ref, title
    ("M1", "SPF-1, 24.1", "Kaynak kimliği kayıtlı ve doğrulanmış"),
    ("M2", "24.1/24.2", "Rol doğru (doğrulama vs keşif)"),
    ("M3", "2.3, S66", "Tek yayıncı tek başlık (başka hatla çakışma yok)"),
    ("M4", "26.4/2, SPF-6", "Teknik sağlık (hata yok)"),
    ("M5", "25", "Çekim güncelliği (son çekim <= 2x aralık)"),
    ("M6", "25", "Cadence sınıfı / staleness eşiği tanımlı"),
    ("M7", "26.4/4, 26.1/5", "Kaynak bazlı daraltma kuralı"),
    ("M8", "26.1/5", "Sahip PASS/FAIL tür kararı kayıtlı (docs/audits)"),
    ("M9", "26.2/3", "Pipeline verimi (çekilen -> inbox)"),
    ("M10", "26.6", "Tür kapısı (makale dışı tür sızmıyor)"),
    ("M11", "13.1", "Kanıt üst verisi (çalışma türü dolu)"),
    ("M12", "10, 21", "Kanonik kimlik (DOI/PMID dolu)"),
    ("M13", "13.6", "Medya kaynağı -> özgün çalışma bağlantısı"),
    ("M14", "9", "Yayın tarihi geçerli (boş/gelecek yok)"),
    ("M15", "2.3, 25", "Güncellik (örnekte 90 günden eski <= %10)"),
    ("M16", "13.5", "Erişim seviyesi kaydı"),
    ("M17", "13.4, SPF-28", "Geri çekme/düzeltme ayrı işleniyor"),
    ("M18", "12.0, 1.2", "Hedef kitle uyumu (yargı, örnek bazlı)"),
]
P, F, W, NA = "PASS", "FAIL", "WARN", "n/a"


def host(u):
    m = re.match(r"https?://([^/]+)", u or "")
    return (m.group(1).lower().removeprefix("www.") if m else "")


other_hosts = {host(f.get("endpoint_url")) for f in other if f.get("enabled") and host(f.get("endpoint_url"))}
rows = []
for fid, f in sorted(feeds.items()):
    short = fid.removeprefix("research-")
    c = cfg.get(fid, {})
    ext = c.get("externalRef") or f.get("external_ref")
    r = reg.get(ext) or reg.get(short)
    its = by.get(fid, [])
    n = len(its)
    inbox = [x for x in its if x["_st"] == "inbox"]
    ev = lambda x: x.get("evidence") or {}
    res = {}
    res["M1"] = P if (r and r.get("verificationStatus") == "CANONICAL_ACTIVE") else (W if (r or f.get("transport") == "PUBMED_EUTILS") else F)
    role = (r or {}).get("sourceRole")
    res["M2"] = P if role else W
    h = host(f.get("endpoint_url"))
    res["M3"] = F if (h and h in other_hosts) else P
    res["M4"] = P if (f.get("enabled") and not f.get("last_error")) else F
    lf = f.get("last_fetched_at")
    poll = f.get("poll_minutes") or 1440
    if lf:
        age_min = (NOW - datetime.datetime.fromisoformat(lf.replace("Z", "+00:00"))).total_seconds() / 60
        res["M5"] = P if age_min <= 2 * poll + 60 else F
    else:
        res["M5"] = F
    res["M6"] = P if re.search(r"cadence_class|staleness_threshold", json.dumps(c)) else F
    rules = c.get("rules") or {}
    res["M7"] = P if (rules.get("includeKeywords") or rules.get("excludeKeywords") or rules.get("query") or rules.get("term")) else F
    res["M8"] = P if re.search(r"(?<![\w-])" + re.escape(fid) + r"(?![\w-])", audits_text) else F
    ok = f.get("last_ok_items") or 0
    res["M9"] = F if ok == 0 else (P if (f.get("inbox_count") or 0) > 0 else W)
    if n >= 3:
        bad = sum(1 for x in its if NONART.search((x.get("titleOrig") or x.get("title") or "").strip()))
        res["M10"] = F if bad else P
    else:
        res["M10"] = NA
    if n >= 3:
        pct = 100 * sum(1 for x in its if ev(x).get("studyType")) // n
        res["M11"] = P if pct >= 80 else (W if pct > 0 else F)
        pct = 100 * sum(1 for x in its if ev(x).get("doi") or ev(x).get("pmid")) // n
        res["M12"] = P if pct >= 80 else (W if pct > 0 else F)
        res["M14"] = P if all(x.get("publishedAt") and x["publishedAt"] <= DATE for x in its) else F
        old = 100 * sum(1 for x in its if x.get("publishedAt") and x["publishedAt"] < (NOW - datetime.timedelta(days=90)).date().isoformat()) // n
        res["M15"] = P if old <= 10 else F
        res["M17"] = F if any(INTEG.search(x.get("titleOrig") or x.get("title") or "") for x in its) else P
    else:
        for k in ("M11", "M12", "M14", "M15", "M17"):
            res[k] = NA
    res["M13"] = (F if any(not (ev(x).get("doi") or ev(x).get("pmid")) for x in inbox) else P) if role == "ACCESSIBLE_SCIENCE_MEDIA" else NA
    res["M16"] = F  # item model has no access-level field (13.5) - systemic
    res["M18"] = W if (short in GENERAL_SCIENCE or short in NEWSLIKE) else P
    rows.append((short, f.get("transport"), poll, n, res))

out = ROOT / "docs/audits"
with open(out / f"research-matrix-{DATE}.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["source", "transport", "poll_min", "sample_n"] + [c[0] for c in CHECKS])
    for short, tr, poll, n, res in rows:
        w.writerow([short, tr, poll, n] + [res[c[0]] for c in CHECKS])

sym = {P: "✓", F: "✗", W: "~", NA: "–"}
md = [f"# Research matrisi: Bible 4.3 x {len(rows)} kaynak ({DATE})", "",
      "Canlı Hub API + repo dosyaları. Öğe ölçümleri örneklemdir (en yeni 500 inbox + gösterilen hold). `✓` geçti, `✗` kaldı, `~` uyarı/yargı, `–` ölçülemedi (örnek < 3 veya uygulanmaz).", "",
      "## Kural özeti (kaç kaynak)", "", "| Kural | Bible | Başlık | ✓ | ✗ | ~ | – |", "|---|---|---|---|---|---|---|"]
for cid, ref, title in CHECKS:
    vals = [r[4][cid] for r in rows]
    md.append(f"| {cid} | {ref} | {title} | {vals.count(P)} | {vals.count(F)} | {vals.count(W)} | {vals.count(NA)} |")
md += ["", "## Kaynak x kural", "", "| Kaynak | n | " + " | ".join(c[0] for c in CHECKS) + " | ✗ |", "|---|---|" + "---|" * (len(CHECKS) + 1)]
for short, tr, poll, n, res in sorted(rows, key=lambda r: -sum(1 for v in r[4].values() if v == F)):
    md.append(f"| {short} | {n} | " + " | ".join(sym[res[c[0]]] for c in CHECKS) + f" | {sum(1 for v in res.values() if v == F)} |")
(out / f"research-matrix-{DATE}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("rows", len(rows), "items", len(items))
for cid, ref, title in CHECKS:
    vals = [r[4][cid] for r in rows]
    print(cid, vals.count(P), vals.count(F), vals.count(W), vals.count(NA), title)
