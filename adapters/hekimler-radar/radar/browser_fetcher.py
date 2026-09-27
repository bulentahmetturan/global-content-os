from __future__ import annotations

from .fetchers import build_result, extract_html_text
from .models import FetchResult, Source


def fetch_with_browser(source: Source, user_agent: str, timeout: int = 30) -> FetchResult:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(user_agent=user_agent, locale="tr-TR")
            response = page.goto(source.url, timeout=timeout * 1000, wait_until="networkidle")
            html = page.content()
            status_code = response.status if response else 0
        finally:
            browser.close()
    text, title = extract_html_text(html, source)
    return build_result(source, text, title, status_code)
