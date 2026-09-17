from curl_cffi import requests
import re
from pathlib import Path

urls = [
    "https://www.consilium.europa.eu/en/council-eu/configurations/epsco/",
    "https://www.consilium.europa.eu/en/press/press-releases/?page=1&topic=122249",
    "https://www.consilium.europa.eu/en/about-site/rss/",
    "https://www.consilium.europa.eu/en/meetings/epsco/",
    "https://www.consilium.europa.eu/en/press/press-releases/rss/",
    "https://www.consilium.europa.eu/en/press/press-releases/",
]

out = Path(r"C:\Users\W11\AppData\Local\Temp\cons_ok.html")
for url in urls:
    try:
        r = requests.get(url, impersonate="chrome124", timeout=45)
        print(r.status_code, len(r.text), url)
        if r.status_code == 200 and "Just a moment" not in r.text and len(r.text) > 8000:
            out.write_text(r.text, encoding="utf-8")
            print("SAVED", url)
            for m in re.findall(r'href=["\']([^"\']*rss[^"\']*)["\']', r.text, re.I)[:15]:
                print("rss", m)
            # extract article-like anchors
            items = []
            for m in re.finditer(
                r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>([\s\S]*?)</a>', r.text, re.I
            ):
                href, title = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2))
                title = re.sub(r"\s+", " ", title).strip()
                if len(title) < 20 or len(title) > 240:
                    continue
                if "/press/" not in href and "/meetings/" not in href:
                    continue
                if not href.startswith("http"):
                    href = "https://www.consilium.europa.eu" + href
                items.append((title, href))
                if len(items) >= 15:
                    break
            print("items", len(items))
            for t, h in items[:5]:
                print("-", t[:80], h)
            break
    except Exception as e:
        print("ERR", type(e).__name__, e)
