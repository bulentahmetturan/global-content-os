from __future__ import annotations

import html
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .config import settings as default_settings
from .database import Database
from .deadlines import days_until
from .sources import load_sources

NAV = '<nav style="margin-top:10px"><a href="/" style="color:#cfe8ff">Adaylar</a> · <a href="/kaynaklar" style="color:#cfe8ff">Kaynak sağlığı</a></nav>'


def render_health(db: Database) -> str:
    sources = load_sources(default_settings.sources_path)
    health = db.source_health()
    rows = []
    for source in sources:
        info = health.get(source.id, {})
        last_error_at = info.get("last_error_at")
        last_success_at = info.get("last_success_at")
        if not source.enabled:
            state, color = "devre dışı", "#64748b"
        elif last_error_at and (not last_success_at or last_error_at > last_success_at):
            state, color = "hata", "#b91c1c"
        elif last_success_at:
            state, color = "ok", "#15803d"
        else:
            state, color = "hiç çalışmadı", "#b45309"
        rows.append(f"""
        <tr>
          <td>{html.escape(source.institution)}</td>
          <td>{html.escape(source.name)}</td>
          <td><b style="color:{color}">{state}</b></td>
          <td>{html.escape(last_success_at or '—')}</td>
          <td>{html.escape(info.get('last_checked_at') or '—')}</td>
          <td>{html.escape((info.get('last_error_message') or '—')[:160])}</td>
        </tr>""")
    table = "".join(rows) or "<tr><td colspan=6>Kaynak yok.</td></tr>"
    return f"""<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kaynak Sağlığı</title>
    <style>body{{font:16px system-ui;margin:0;background:#f4f7f8;color:#14212b}}header{{background:#0b3654;color:white;padding:28px max(5vw,24px)}}main{{max-width:1200px;margin:30px auto;padding:0 20px;overflow-x:auto}}table{{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;box-shadow:0 7px 22px #15304712}}th,td{{padding:10px 14px;text-align:left;border-bottom:1px solid #eef1f3;font-size:14px}}th{{background:#eef4f7}}</style></head>
    <body><header><h1>Kaynak Sağlığı</h1><p>{len(sources)} kayıtlı kaynak</p>{NAV}</header><main>
    <table><thead><tr><th>Kurum</th><th>Kaynak</th><th>Durum</th><th>Son başarılı</th><th>Son kontrol</th><th>Son hata</th></tr></thead><tbody>{table}</tbody></table>
    </main></body></html>"""


def render(db: Database) -> str:
    cards = []
    for row in db.list_candidates():
        color = "#d97706" if row["status"] == "review" else ("#15803d" if row["status"] == "approved" else "#b91c1c")
        remaining = days_until(row["deadline"])
        if remaining is None:
            deadline_html = ""
        elif remaining < 0:
            deadline_html = f'<div class="deadline" style="color:#b91c1c">Son tarih geçti ({html.escape(row["deadline"])})</div>'
        else:
            deadline_html = f'<div class="deadline" style="color:#b45309">Son {remaining} gün ({html.escape(row["deadline"])})</div>'
        related_ids = json.loads(row["related_ids_json"] or "[]") if "related_ids_json" in row.keys() else []
        related_html = (
            f'<div class="related">🔗 {len(related_ids)} farklı kaynakta da bahsediliyor</div>'
            if related_ids else ""
        )
        meta_bits = []
        for field, label in (("faculty", ""), ("student_year", "Sınıf/Dönem"), ("city", "Şehir"), ("fee", "Ücret"), ("eligibility", "Uygunluk")):
            value = row[field] if field in row.keys() else None
            if value:
                meta_bits.append(f"{label}: {html.escape(value)}" if label else html.escape(value))
        facts_html = f'<div class="facts">{" · ".join(meta_bits)}</div>' if meta_bits else ""
        cards.append(f"""
        <article class="card">
          <div class="meta"><span>{html.escape(row['institution'])}</span><b style="color:{color}">{row['status']}</b></div>
          <h2>{html.escape(row['title'])}</h2>
          <p>{html.escape(row['summary'])}</p>
          {facts_html}
          {deadline_html}
          {related_html}
          <div class="scores">Aciliyet {row['urgency_score']}/100 · Güven {row['confidence_score']}/100 · {html.escape(row['recommended_format'])}</div>
          <a href="{html.escape(row['source_url'])}" target="_blank" rel="noopener">Resmî kaynağı aç</a>
          <form method="post" action="/status">
            <input type="hidden" name="id" value="{row['id']}">
            <button name="status" value="approved">Onayla</button>
            <button class="reject" name="status" value="rejected">Reddet</button>
            <button class="neutral" name="status" value="review">İncelemede</button>
          </form>
        </article>""")
    body = "".join(cards) or "<p>Henüz içerik adayı yok. Önce tarama çalıştırın.</p>"
    return f"""<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tıp Öğrencileri Radar</title>
    <style>body{{font:16px system-ui;margin:0;background:#f4f7f8;color:#14212b}}header{{background:#0b3654;color:white;padding:28px max(5vw,24px)}}main{{max-width:980px;margin:30px auto;padding:0 20px}}.card{{background:white;padding:22px;border-radius:16px;margin:16px 0;box-shadow:0 7px 22px #15304712}}.meta{{display:flex;justify-content:space-between;color:#557}}h2{{margin:.5rem 0}}.scores{{margin:14px 0;color:#0b6480}}.related{{margin-top:6px;color:#0b6480;font-size:14px}}.facts{{margin-top:8px;color:#557;font-size:13px}}a{{color:#1178bb}}form{{margin-top:18px;display:flex;gap:8px}}button{{border:0;border-radius:9px;padding:9px 14px;background:#15803d;color:white;cursor:pointer}}.reject{{background:#b91c1c}}.neutral{{background:#64748b}}</style></head>
    <body><header><h1>Tıp Öğrencileri Editoryal Radar</h1><p>Kaynaklı bulgular · İnsan onaylı yayın</p>{NAV}</header><main>{body}</main></body></html>"""


def serve(db: Database, host: str = "127.0.0.1", port: int = 8765) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/kaynaklar":
                payload = render_health(db).encode("utf-8")
            elif path == "/":
                payload = render(db).encode("utf-8")
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_POST(self):
            if urlparse(self.path).path != "/status":
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length", "0"))
            form = parse_qs(self.rfile.read(length).decode("utf-8"))
            db.set_status(int(form["id"][0]), form["status"][0])
            self.send_response(303)
            self.send_header("Location", "/")
            self.end_headers()

        def log_message(self, format, *args):
            return

    print(f"Panel: http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()

