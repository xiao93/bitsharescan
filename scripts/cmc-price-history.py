#!/usr/bin/env python3
"""Fetch full BTS daily price history from CoinMarketCap's public data-api
(server-side; CMC data-api has no CORS allow-origin so the browser can't call it).
Pages backwards in 400-day windows (the endpoint caps at ~400 daily points per call).
Writes public/data/bts-price-history.json."""
import json, time, urllib.request, datetime, os, sys

CMC_ID = 463        # BitShares
CONVERT = 2781      # USD
UA = "Mozilla/5.0 (BitSharesScan price snapshot)"
GENESIS = datetime.date(2014, 7, 19)
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data", "bts-price-history.json")

def fetch(ts_end):
    ts_start = ts_end - 400*86400
    url = (f"https://api.coinmarketcap.com/data-api/v3.1/cryptocurrency/historical"
           f"?id={CMC_ID}&convertId={CONVERT}&timeStart={ts_start}&timeEnd={ts_end}&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def main():
    rows = {}
    ts_end = int(time.time())
    for i in range(40):
        d = fetch(ts_end)
        quotes = (d.get("data") or {}).get("quotes") or []
        if not quotes:
            break
        earliest = None
        for q in quotes:
            day = q["timeOpen"][:10]
            qu = q["quote"]
            rows[day] = {
                "date": day,
                "price": qu.get("close"),
                "marketCap": qu.get("marketCap"),
                "volume": qu.get("volume"),
            }
            dt = datetime.date.fromisoformat(day)
            if earliest is None or dt < earliest:
                earliest = dt
        sys.stderr.write(f"window {i}: {len(quotes)} pts, earliest {earliest}\n")
        if earliest is None or earliest <= GENESIS:
            break
        new_end = int(time.mktime((earliest - datetime.timedelta(days=1)).timetuple()))
        if new_end >= ts_end:
            break
        ts_end = new_end
        time.sleep(1.5)
    out = [rows[k] for k in sorted(rows)]
    out = [r for r in out if r["price"] and r["price"] > 0]
    meta = {
        "source": "CoinMarketCap",
        "asset": "BTS",
        "convert": "USD",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(out),
        "first": out[0]["date"] if out else None,
        "last": out[-1]["date"] if out else None,
        "points": out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(meta, f, separators=(",", ":"))
    sys.stderr.write(f"wrote {len(out)} points {meta['first']}..{meta['last']} -> {OUT}\n")

if __name__ == "__main__":
    main()
