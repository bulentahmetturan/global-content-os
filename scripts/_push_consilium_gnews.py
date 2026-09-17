from pathlib import Path
import re, json, urllib.request

hub = "http://127.0.0.1:8787"
gn = Path(r"C:\Users\W11\AppData\Local\Temp\gn.xml")
print("gn exists", gn.exists(), "size", gn.stat().st_size if gn.exists() else 0)
text = gn.read_text(encoding="utf-8", errors="ignore") if gn.exists() else ""
print("head", text[:200].replace("\n", " "))
print("has rss", "<rss" in text[:500].lower(), "has item", "<item" in text.lower())

items = []
for block in re.findall(r"<item[\s>][\s\S]*?</item>", text, re.I)[:30]:
    title = re.sub(r"<[^>]+>", " ", (re.search(r"<title[^>]*>([\s\S]*?)</title>", block, re.I) or [None, ""])[1])
    title = re.sub(r"\s+", " ", title).strip()
    link = (re.search(r"<link[^>]*>([\s\S]*?)</link>", block, re.I) or [None, ""])[1].strip()
    # Google News links are redirects; keep them as canonical for now, or unwrap
    if title and link and "consilium" in (title + link).lower():
        items.append({"title": title[:280], "url": link, "summary": title[:500], "publishedAt": None})
    elif title and link and ("EPSCO" in title or "health" in title.lower() or "Health" in title):
        items.append({"title": title[:280], "url": link, "summary": title[:500], "publishedAt": None})

print("candidate items", len(items))
for it in items[:5]:
    print("-", it["title"][:90])
    print(" ", it["url"][:120])

# If Google items are thin, also try europa press RSS for Council (official EU institutions feed)
if len(items) < 5:
    # Fetch Google news again with urllib
    url = "https://news.google.com/rss/search?q=EPSCO%20(health%20OR%20%22medical%20device%22%20OR%20pharmaceutical)%20site:consilium.europa.eu&hl=en-US&gl=US&ceid=US:en"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        text2 = r.read().decode("utf-8", "ignore")
    print("refetch", len(text2))
    for block in re.findall(r"<item[\s>][\s\S]*?</item>", text2, re.I)[:20]:
        title = re.sub(r"<[^>]+>", " ", (re.search(r"<title[^>]*>([\s\S]*?)</title>", block, re.I) or [None, ""])[1])
        title = re.sub(r"\s+", " ", title).strip()
        link = (re.search(r"<link[^>]*>([\s\S]*?)</link>", block, re.I) or [None, ""])[1].strip()
        if title and link:
            items.append({"title": title[:280], "url": link, "summary": title[:500], "publishedAt": None})

items = items[:15]
print("final", len(items))
if items:
    body = json.dumps({"feedId": "news-council-eu-epsco-health-scoped", "items": items}).encode()
    req = urllib.request.Request(
        hub + "/api/ingress/feed-items",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        print(r.read().decode())

# coverage
with urllib.request.urlopen(hub + "/api/coverage") as r:
    cov = json.loads(r.read().decode())
print(json.dumps(cov["byRoute"]["kaduse-news"], indent=2))
with urllib.request.urlopen(hub + "/api/feeds/empty") as r:
    empty = json.loads(r.read().decode())
print("empty", [f["id"] for f in empty.get("feeds", [])])
