#!/usr/bin/env python3
"""Apply BitSharesScan bundle-level patches to the de-minified source.

Reads src/app.js and src/patches/proposals.js, writes src/app.patched.js.
Run from any working directory; paths are resolved relative to this file.
"""
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_SRC_DIR = _ROOT / "src"
_PATCH_DIR = Path(__file__).resolve().parent

import sys, re

src = (_SRC_DIR / 'app.js').read_text()
def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit(f"MATCH {n} != {count} for: {old[:120]!r}")
    src = src.replace(old, new)

# ---------- 1) per-network op-total cache ----------
rep("""    let e = sessionStorage.getItem(Dd);""",
    """    sessionStorage.removeItem(Dd);
    let e = sessionStorage.getItem(`${Dd}.${Ls()}`);""")
rep("""    sessionStorage.setItem(Dd, JSON.stringify({ at: Date.now(), value: e }));""",
    """    sessionStorage.setItem(
      `${Dd}.${Ls()}`,
      JSON.stringify({ at: Date.now(), value: e, network: Ls() }),
    );""")
rep("""      if (t.at && typeof t.value == `number` && Date.now() - t.at < 18e5)""",
    """      if (
        t.at &&
        t.network === Ls() &&
        typeof t.value == `number` &&
        Date.now() - t.at < 18e5
      )""")

# ---------- 2) multi-node failover ----------
rep("""var Tl = class {
    url;
    httpUrl;""", """var bxNodes = {
    mainnet: [
      `wss://api.bitshares.dev/ws`,
      `wss://node.xbts.io/ws`,
      `wss://api.bts.mobi/ws`,
      `wss://api.dex.trading/ws`,
      `wss://dex.iobanker.com/ws`,
    ],
    testnet: [`wss://testnet.dex.trading/ws`, `wss://testnet.xbts.io/ws`],
  },
  bxOkKey = `bitscan.ws-ok`;
function bxCandidates(e, t, n) {
  let r = Ls(),
    i = null;
  try {
    i = sessionStorage.getItem(`${bxOkKey}.${r}`);
  } catch {}
  let a = [t, e, i, ...(bxNodes[r] ?? [])].filter(
      (e) => typeof e == `string` && /^wss?:\\/\\//.test(e),
    ),
    o = [...new Set(a)];
  return n ? [...o.filter((e) => e !== n), n] : o;
}
var Tl = class {
    url;
    baseUrl;
    badUrl = null;
    timeouts = 0;
    httpUrl;""")
rep("""      ((this.url = e), (this.httpUrl = t));
    }""", """      ((this.url = e), (this.baseUrl = e), (this.httpUrl = t));
    }""")
rep("""        let s = window.setTimeout(() => {
          (this.pending.delete(i), o(Error(`Timed out calling ${t}`)));
        }, 2e4);""", """        let s = window.setTimeout(() => {
          (this.pending.delete(i),
            o(Error(`Timed out calling ${t}`)),
            (this.timeouts += 1),
            this.timeouts >= 2 &&
              ((this.timeouts = 0), (this.badUrl = this.url), this.close()));
        }, 2e4);""")
rep("""            if (t.id == null) return;
            let n = this.pending.get(t.id);""", """            if (t.id == null) return;
            this.timeouts = 0;
            let n = this.pending.get(t.id);""")
rep("""      let e = await this.raw(1, `database`, []),
        t = await this.raw(1, `history`, []);
      ((this.dbApi = typeof e == `number` ? e : 0),""", """      let e = await this.raw(1, `database`, []),
        t = await this.raw(1, `history`, []),
        n = await this.raw(typeof e == `number` ? e : 0, `get_chain_id`, []),
        r = Rs().chainId;
      if (r && n !== r) throw Error(`Node is on a different chain`);
      ((this.dbApi = typeof e == `number` ? e : 0),""")
rep("""    async ensure() {
      if (!(this.ws?.readyState === WebSocket.OPEN && this.opened)) {
        if (this.failedAt && Date.now() - this.failedAt < 12e3)
          throw Error(this.lastError || `WebSocket unavailable`);
        if (this.connecting) return this.connecting;
        this.connecting = this.connect();
        try {
          await this.connecting;
        } finally {
          this.connecting = null;
        }
      }
    }""", """    async ensure() {
      if (!(this.ws?.readyState === WebSocket.OPEN && this.opened)) {
        if (this.connecting) return this.connecting;
        if (this.failedAt && Date.now() - this.failedAt < 12e3)
          throw Error(this.lastError || `WebSocket unavailable`);
        this.connecting = (async () => {
          let e = bxCandidates(this.baseUrl, this.url, this.badUrl),
            t = null;
          for (let n of e) {
            this.url = n;
            try {
              await this.connect();
              ((this.badUrl = null), (this.timeouts = 0));
              try {
                sessionStorage.setItem(`${bxOkKey}.${Ls()}`, n);
              } catch {}
              return;
            } catch (e) {
              t = e;
            }
          }
          throw ((this.failedAt = Date.now()), t || Error(`WebSocket unavailable`));
        })();
        try {
          await this.connecting;
        } finally {
          this.connecting = null;
        }
      }
    }""")
rep("""    (El && El.url === e.ws && El.httpUrl === e.http) ||""",
    """    (El && El.baseUrl === e.ws && El.httpUrl === e.http) ||""")
# status bar: show node host
rep("""    v = e(
      o === `online`
        ? `WebSocket`""", """    bxHost = (() => {
      try {
        return new URL(Dl().url).host;
      } catch {
        return ``;
      }
    })(),
    v = (o === `online` && bxHost ? (e) => `${e} · ${bxHost}` : (e) => e)(e(
      o === `online`
        ? `WebSocket`""")
rep("""          : o === `connecting`
            ? `Connecting`
            : `Offline`,
    );
  return (0, N.jsx)(ku, {""", """          : o === `connecting`
            ? `Connecting`
            : `Offline`,
    ));
  return (0, N.jsx)(ku, {""")

# ---------- 3) price: CoinGecko reference + DEX VWAP with caveat ----------
rep("""var Dh = 10,
  Oh = null;""", """var Dh = 10,
  Oh = null,
  bxThinUsd = 1e3;
async function bxCoinGecko() {
  try {
    let e = new AbortController(),
      t = window.setTimeout(() => e.abort(), 6e3),
      n = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=bitshares&vs_currencies=usd`,
        { signal: e.signal },
      );
    window.clearTimeout(t);
    let r = await n.json(),
      i = Number(r.bitshares?.usd);
    return n.ok && i > 0 ? i : null;
  } catch {
    return null;
  }
}""")
rep("""async function jh() {
  let e = await z(`get_top_markets`, [100]).catch(() => []),
    t = [];""", """async function jh() {
  let [e, bxCg] = await Promise.all([
      z(`get_top_markets`, [100]).catch(() => []),
      bxCoinGecko(),
    ]),
    t = [];""")
rep("""  if (t.length) {
    let e = t.reduce((e, t) => e + t.volume, 0),
      n = t.reduce((e, t) => e + t.usdPerBts * t.volume, 0) / e,
      r = [...t].sort((e, t) => t.volume - e.volume);
    return {
      price: n,
      source: r
        .map((t) => {
          let n = (t.volume / e) * 100,
            r = n >= 10 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;
          return `${t.symbol} ${r}`;
        })
        .join(`, `),
      anchor: r[0]?.symbol ?? null,
    };
  }
  try {
    let e = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=bitshares&vs_currencies=usd`,
      ),
      t = await e.json(),
      n = Number(t.bitshares?.usd);
    if (e.ok && n > 0)
      return { price: n, source: `CoinGecko`, anchor: `XBTSX.USDT` };
  } catch {}
  return { price: null, source: ``, anchor: null };
}""", """  let bxDex = null;
  if (t.length) {
    let e = t.reduce((e, t) => e + t.volume, 0),
      n = t.reduce((e, t) => e + t.usdPerBts * t.volume, 0) / e,
      r = [...t].sort((e, t) => t.volume - e.volume);
    bxDex = {
      price: n,
      volumeBts: e,
      volumeUsd: e * n,
      mix: r
        .map((t) => {
          let n = (t.volume / e) * 100,
            r = n >= 10 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;
          return `${t.symbol} ${r}`;
        })
        .join(`, `),
      anchor: r[0]?.symbol ?? null,
    };
  }
  if (bxCg != null)
    return {
      price: bxCg,
      source: bxDex
        ? `CoinGecko · DEX VWAP $${bxDex.price.toPrecision(3)} (${bxDex.mix})`
        : `CoinGecko`,
      anchor: bxDex?.anchor ?? `XBTSX.USDT`,
      kind: `coingecko`,
      cg: bxCg,
      dex: bxDex,
    };
  if (bxDex)
    return {
      price: bxDex.price,
      source: `DEX VWAP (${bxDex.mix})`,
      anchor: bxDex.anchor,
      kind: `dex`,
      cg: null,
      dex: bxDex,
      thin: bxDex.volumeUsd < bxThinUsd,
    };
  return { price: null, source: ``, anchor: null };
}
function bxPriceHint(e) {
  let t = Oh?.value;
  if (!t || t.price == null) return null;
  if (t.kind === `coingecko`) {
    if (!t.dex) return e(`Source: CoinGecko`);
    let n = ((t.dex.price - t.cg) / t.cg) * 100;
    return e(`Source: CoinGecko · DEX {price} ({diff})`, {
      price: `$${t.dex.price.toPrecision(3)}`,
      diff: `${n >= 0 ? `+` : ``}${n.toFixed(0)}%`,
    });
  }
  return t.thin
    ? e(`Source: on-chain DEX, 24h volume ≈ {vol} (thin liquidity)`, {
        vol: `$${Math.round(t.dex.volumeUsd).toLocaleString()}`,
      })
    : e(`Source: on-chain DEX, 24h volume ≈ {vol}`, {
        vol: `$${Math.round(t.dex.volumeUsd).toLocaleString()}`,
      });
}""")
rep("""                (0, N.jsx)(_v, {
                  label: e(`{sym} price`, { sym: k }),
                  value: d == null ? `—` : `$${_u(d, 6)}`,
                  title: p,
                }),""", """                (0, N.jsx)(_v, {
                  label: e(`{sym} price`, { sym: k }),
                  value: d == null ? `—` : `$${_u(d, 6)}`,
                  title: p,
                  hint: d == null ? null : bxPriceHint(e),
                }),""")

# ---------- 4) account history beyond 10k ----------
rep("""async function Md(e, t, n, r) {
  let i = [{ term: { "account_history.account": e } }];
  r != null && i.push({ term: { operation_type: r } });
  let a = await Ku(Xu(), {
      from: (t - 1) * n,
      size: n,
      track_total_hits: !0,
      sort: [{ "block_data.block_time": `desc` }, { operation_id_num: `desc` }],
      query: { bool: { filter: i } },
      _source: wd,
    }),
    o = Td(a);""", """async function bxEs(e, t, n = ``) {
  let r = Gs().es.replace(/\\/$/, ``);
  if (!r) throw new Gu();
  let i = await fetch(`${r}/${e}/_search?ignore_unavailable=true${n}`, {
      method: `POST`,
      headers: { "Content-Type": `application/json` },
      body: JSON.stringify(t),
    }),
    a = qs(await i.text());
  if (!i.ok || a.error)
    throw Error(
      a.error?.reason ||
        a.error?.root_cause?.[0]?.reason ||
        `Elasticsearch HTTP ${i.status}`,
    );
  return a;
}
async function bxDeep(e, t, n) {
  if (n + t.size <= 1e4) return Ku(e, { ...t, from: n });
  let r = null,
    i = n;
  for (; i > 0; ) {
    let n = Math.min(i, 1e4),
      a = (
        await bxEs(
          e,
          {
            size: n,
            sort: t.sort,
            query: t.query,
            _source: !1,
            track_total_hits: !1,
            ...(r ? { search_after: r } : {}),
          },
          `&filter_path=hits.hits.sort`,
        )
      ).hits?.hits ?? [];
    if (!a.length) break;
    ((r = a[a.length - 1].sort), (i -= a.length));
    if (a.length < n) break;
  }
  if (i > 0) {
    let n = await Ku(e, { ...t, size: 0 });
    return { ...n, hits: { ...(n.hits ?? {}), hits: [] } };
  }
  return Ku(e, { ...t, search_after: r });
}
async function Md(e, t, n, r) {
  let i = [{ term: { "account_history.account": e } }];
  r != null && i.push({ term: { operation_type: r } });
  let bxOff = (t - 1) * n,
    a;
  if (bxOff + n > 1e4 && r == null) {
    let r = (
        await Ku(Xu(), {
          size: 1,
          sort: [{ "account_history.sequence": `desc` }],
          query: { bool: { filter: i } },
          _source: [`account_history.sequence`],
        })
      ).hits?.hits?.[0]?._source?.account_history?.sequence,
      o = Number(r) - bxOff;
    a = await Ku(Xu(), {
      size: n,
      track_total_hits: !0,
      sort: [{ "account_history.sequence": `desc` }],
      query: {
        bool: {
          filter: [
            ...i,
            { range: { "account_history.sequence": { lte: o, gt: o - n } } },
          ],
        },
      },
      _source: wd,
    });
    let s = await Ku(Xu(), {
      size: 0,
      track_total_hits: !0,
      query: { bool: { filter: i } },
    });
    a.hits && (a.hits.total = s.hits?.total);
  } else
    a = await bxDeep(
      Xu(),
      {
        size: n,
        track_total_hits: !0,
        sort: [
          { "block_data.block_time": `desc` },
          { operation_id_num: `desc` },
        ],
        query: { bool: { filter: i } },
        _source: wd,
      },
      bxOff,
    );
  let o = Td(a);""")

# ---------- 5) approximate op total ----------
rep("""                      label: e(`Operations`),
                      value: ee == null ? `—` : H(ee),""", """                      label: e(`Operations`),
                      value: ee == null ? `—` : `≈ ${H(ee)}`,
                      title: e(
                        `Approximate: Elasticsearch cardinality estimate of non-virtual operations`,
                      ),""")

# ---------- 7) search placeholder ----------
rep("""                      className: `w-full lg:max-w-md`,
                      children: (0, N.jsx)(Pf, { id: `page-search` }),""",
    """                      className: `bx-pagesearch w-full`,
                      children: (0, N.jsx)(Pf, { id: `page-search` }),""")
rep("""            className: `w-full rounded-lg border border-line bg-card pl-4 pr-14 text-ink outline-none ring-link/20 placeholder:text-muted focus:border-link focus:ring-2 ${d ? `h-12 text-base` : `h-10 text-sm`}`,""",
    """            className: `bx-search w-full rounded-lg border border-line bg-card pl-4 pr-14 text-ink outline-none ring-link/20 placeholder:text-muted focus:border-link focus:ring-2 ${d ? `h-12 text-base` : `h-10 text-sm`}`,""")

# ---------- 8) mobile: ad slot, market hint ----------
rep("""            (0, N.jsx)(`div`, {
              className: `flex shrink-0 md:w-1/3 md:justify-end`,
              children: (0, N.jsx)(hv, {}),
            }),""", """            (0, N.jsx)(`div`, {
              className: `bx-ad flex shrink-0 md:w-1/3 md:justify-end`,
              children: (0, N.jsx)(hv, {}),
            }),""")
_mv = src.index("function Mv(")
_old = """          (0, N.jsx)(`div`, {
            className: `overflow-x-auto`,
            children: (0, N.jsxs)(`table`, {"""
_j = src.index(_old, _mv)
assert _j - _mv < 6000, _j - _mv
src = src[:_j] + """          (0, N.jsx)(`p`, {
            className: `bx-swipe`,
            children: e(`Swipe sideways to see all columns →`),
          }),
          (0, N.jsx)(`div`, {
            className: `bx-scroll overflow-x-auto`,
            children: (0, N.jsxs)(`table`, {""" + src[_j+len(_old):]

# ---------- 6) proposals ----------
rep("""        : t === `1.14`
          ? `/worker/${e}`""", """        : t === `1.10`
          ? `/proposal/${e}`
        : t === `1.14`
          ? `/worker/${e}`""")
rep("""      { label: `Workers`, to: `/workers` },
    ],
  },""", """      { label: `Workers`, to: `/workers` },
      { label: `Proposals`, to: `/proposals` },
    ],
  },""")
rep("""              (0, N.jsx)(j, { path: `workers`, element: (0, N.jsx)(Jy, {}) }),""",
    """              (0, N.jsx)(j, { path: `workers`, element: (0, N.jsx)(Jy, {}) }),
              (0, N.jsx)(j, {
                path: `proposals`,
                element: (0, N.jsx)(bxProposals, {}),
              }),
              (0, N.jsx)(j, {
                path: `proposal/:id`,
                element: (0, N.jsx)(bxProposal, {}),
              }),""")

PRP = (_PATCH_DIR / 'proposals.js').read_text()
rep("""function Jy() {
  let { t: e, lang: t } = B();
  Gp(`Workers`);""", PRP + """
function Jy() {
  let { t: e, lang: t } = B();
  Gp(`Workers`);""")

ZH = {
 "Proposals": "提案",
 "Proposal": "提案",
 "Proposal {id}": "提案 {id}",
 "Proposal {id} was not found.": "未找到提案 {id}。",
 "Proposed transactions waiting for approvals. Data comes from the Elasticsearch proposal index; a proposal disappears from the chain once it is executed or expires.": "等待批准的提议交易。数据来自 Elasticsearch 提案索引；提案执行或过期后会从链上删除。",
 "In progress": "进行中",
 "Proposer": "发起人",
 "Required approvals": "需要批准",
 "Approved": "已批准",
 "Pending approval": "待批准",
 "Closed": "已结束",
 "Executed or removed": "已执行或已移除",
 "Closed (executed or expired)": "已结束（已执行或已过期）",
 "Failed: {reason}": "执行失败：{reason}",
 "No proposals in this tab.": "此标签下没有提案。",
 "{n} proposals": "{n} 个提案",
 "Required active approvals": "需要的活跃权限批准",
 "Approved (active)": "已批准（活跃权限）",
 "Required owner approvals": "需要的所有者权限批准",
 "Approved (owner)": "已批准（所有者权限）",
 "Key approvals": "密钥批准",
 "Review period": "审核期",
 "Created in block": "创建区块",
 "Fail reason": "失败原因",
 "On chain now": "当前在链上",
 "Yes": "是",
 "No": "否",
 "Operations ({n})": "操作（{n}）",
 "Source: CoinGecko": "来源：CoinGecko",
 "Source: CoinGecko · DEX {price} ({diff})": "来源：CoinGecko · 链上 DEX {price}（{diff}）",
 "Source: on-chain DEX, 24h volume ≈ {vol} (thin liquidity)": "来源：链上 DEX，24 小时成交约 {vol}（流动性低，仅供参考）",
 "Source: on-chain DEX, 24h volume ≈ {vol}": "来源：链上 DEX，24 小时成交约 {vol}",
 "Approximate: Elasticsearch cardinality estimate of non-virtual operations": "约数：Elasticsearch 对非虚拟操作的基数估算",
 "Swipe sideways to see all columns →": "左右滑动可查看全部列 →",
 "Deep pages are loaded with search_after and can take a few seconds.": "深分页使用 search_after 加载，可能需要几秒。",
}
import json
ins = "".join(f"    {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},\n" for k, v in ZH.items())
rep("""    "Advertise here": `广告位招租`,\n""", """    "Advertise here": `广告位招租`,\n""" + ins)

(_SRC_DIR / 'app.patched.js').write_text(src)
print("patched OK", len(src))
