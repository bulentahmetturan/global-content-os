#!/bin/bash
# Structured network diagnosis for one host/URL (no TLS verification disabled).
H=${1:-hsgm.saglik.gov.tr}; U=${2:-https://hsgm.saglik.gov.tr/tr/basin-odasi/basin-odasi-haberler.html}
echo "== DNS"; getent hosts $H 2>/dev/null || nslookup $H 2>/dev/null | tail -4
FMT='dns=%{time_namelookup}s tcp=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s code=%{http_code} size=%{size_download} ip=%{remote_ip} ver=%{http_version} redirect=%{redirect_url}\n'
run(){ echo "-- $1"; shift; timeout 45 curl -sS -o /dev/null -m 40 -w "$FMT" "$@" 2>&1 | tail -1; }
run "GET https http1.1" --http1.1 -A "HekimlerContinuousWorker/1.0 (+review-only)" "$U"
run "GET https http2" --http2 -A "HekimlerContinuousWorker/1.0 (+review-only)" "$U"
run "GET https IPv4" -4 --http1.1 -A "HekimlerContinuousWorker/1.0 (+review-only)" "$U"
run "GET https IPv6" -6 --http1.1 -A "HekimlerContinuousWorker/1.0 (+review-only)" "$U"
run "HEAD https" -I --http1.1 -A "HekimlerContinuousWorker/1.0 (+review-only)" "$U"
run "GET http (plain)" --http1.1 -A "HekimlerContinuousWorker/1.0 (+review-only)" "${U/https:/http:}"
run "GET https gzip" --http1.1 --compressed -A "HekimlerContinuousWorker/1.0 (+review-only)" "$U"
run "GET https ordinary Accept headers" --http1.1 -A "HekimlerContinuousWorker/1.0 (+review-only)" -H "Accept: text/html,application/xhtml+xml" -H "Accept-Language: tr,en;q=0.8" "$U"
run "GET root" --http1.1 -A "HekimlerContinuousWorker/1.0 (+review-only)" "https://$H/"
echo "-- TCP reachability (nc, 10s)"; timeout 15 bash -c "echo > /dev/tcp/$H/443" 2>&1 && echo "tcp/443 open" || echo "tcp/443 FAILED"
echo "-- egress IP"; curl -sS -m 10 https://api.ipify.org 2>&1 | head -1; echo
