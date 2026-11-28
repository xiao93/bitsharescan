# BitSharesScan

[中文](#中文) | [English](#english)

开源的 [BitShares](https://bitshares.org/) 区块链浏览器。线上站点：

- <https://bitsharescan.github.io/>（GitHub Pages，由 [`bitsharescan/bitsharescan.github.io`](https://github.com/bitsharescan/bitsharescan.github.io) 自动部署）
- <https://bitsharescan.deed.page/>

An open-source [BitShares](https://bitshares.org/) blockchain explorer. Live sites:

- <https://bitsharescan.github.io/> (GitHub Pages, auto-deployed from [`bitsharescan/bitsharescan.github.io`](https://github.com/bitsharescan/bitsharescan.github.io))
- <https://bitsharescan.deed.page/>

---

## 中文

BitSharesScan 是一个纯前端静态站点（React 19 + TypeScript + Vite + Tailwind CSS），直接从公共 API 节点和公开的 Elasticsearch 索引读取 BitShares 主网与测试网数据。它只读取公开链上数据，不保存私钥，也不广播交易。

本仓库就是网站的**原始工程源码**，`npm run build` 生成的就是线上部署的文件。代码同时维护在 [`xiao93/bitsharescan`](https://github.com/xiao93/bitsharescan) 和 [`bitsharescan/bitsharescan.github.io`](https://github.com/bitsharescan/bitsharescan.github.io)。

### 功能

- 区块、交易、操作详情；最新区块与交易；全部 78 种 BitShares 操作类型，并按各操作的 `fee_payer()` 字段准确显示 From
- **区块总手续费**：首页「最新区块」、区块列表和区块详情都显示当块总手续费，由该块每个操作的 `fee` 相加得出，不额外请求。少数以非 BTS 资产付费的操作，按其操作类型在当前手续费表中的标准 BTS 手续费计入（含转账备注部分），并在数字前标「≈」
- 搜索：顶栏搜索框（按 `/` 聚焦）支持区块号、40 位交易 ID、`1.x.y` 对象 ID、账户名、资产符号和公钥；`#/search?q=` 链接带区块号、交易 ID 或对象 ID 时同样直接跳转到对应页面
- 账户：余额与估值、挂单、抵押仓位、投票、权限、白名单、关系（注册/推荐/代理投票）、活跃热力图，以及完整操作历史（超过 1 万条也能翻页）和数据导出
- 账户榜单 `#/accounts`：总账户数、24 小时活跃/新增账户、终身会员数，24 小时转账、成交、池兑换排行，以及 BTS 持仓排行
- 24 小时大额转账 `#/large-transfers`：按资产和最小金额筛选，显示 BTS 与美元成交额
- 资产列表与详情：供应量、持有人、喂价、市场；全局清算的智能币按清算价计价
- 治理：见证人、理事会、预算提案（workers）、**提案（1.10.x）列表与详情**
- DEX 市场与订单簿：`#/markets` 总览，`#/market/:asset`（如 `#/market/BTS`）按资产的 24 小时市场页，`#/market/:base/:quote` 单个交易对
- DeFi：流动性池（24 小时成交量、兑换次数，可按兑换次数或 TVL 排序）、借贷（credit offer/deal）、SameT 闪贷（可按资产筛选）、锁仓（tickets）
- 网络 `#/network`：全局参数和手续费表，列出操作编号（Op）、各费用项以及终身会员的实际费用（扣除返现后）
- 节点追踪：主网与测试网的公共 API 节点（浏览器内并行探测），以及由 `scripts/p2p-crawl.py` 生成的 P2P 节点快照和地图
- 图表统计（27 张图，含自 2014 年起的 BTS 价格）、隐私转账统计、数据导出
- 交互式 JSON 树：长十六进制字段可展开、复制，并解码为 UTF-8
- 25 种界面语言（英语、简体中文、繁体中文、韩语、俄语、日语、越南语、印尼语、西班牙语、葡萄牙语、法语、阿拉伯语、波斯语、乌克兰语、土耳其语、德语、印地语、泰语、意大利语、波兰语、荷兰语、乌尔都语、希伯来语、孟加拉语、马来语；`en` / `zh-CN` / `zh-TW` / `ko` / `ru` / `ja` / `vi` / `id` / `es` / `pt` / `fr` / `ar` / `fa` / `uk` / `tr` / `de` / `hi` / `th` / `it` / `pl` / `nl` / `ur` / `he` / `bn` / `ms`），按浏览器语言自动选择，数字和日期按对应 locale 格式化（泰语等使用公历与西式数字）；阿拉伯语、波斯语、乌尔都语与希伯来语为从右到左排版。英文为键，其余 24 个语言文件在 `src/lib/locales/`，新增文案须同步补齐，并用 `node scripts/verify-i18n.mjs` 检查键、占位符和数字格式
- 主网 / 测试网切换，浅色 / Dim / 黑色主题

### 页面路由

路由用 URL hash，例如 `/#/block/123`。

| 路由 | 页面 |
| --- | --- |
| `#/` | 首页：价格、市值、链头、最新区块与交易、DeFi 概览 |
| `#/blocks`、`#/block/:num` | 区块列表、区块详情 |
| `#/txs`、`#/tx/:id`、`#/op/:id` | 交易与操作列表、交易详情、操作详情 |
| `#/account/:id`、`#/accounts` | 账户详情、账户榜单 |
| `#/large-transfers` | 24 小时大额转账 |
| `#/assets`、`#/asset/:id` | 资产列表、资产详情 |
| `#/markets`、`#/market/:asset`、`#/market/:base/:quote` | DEX 市场总览、按资产的市场页、交易对详情 |
| `#/pools`、`#/pool/:id` | 流动性池列表（含 24 小时统计）、池详情 |
| `#/lending`、`#/credit-offer/:id`、`#/credit-deal/:id` | 借贷列表、credit offer、credit deal |
| `#/flash`、`#/samet/:id` | 闪贷列表（`?asset=` 筛选）、SameT 资金池 |
| `#/locking`、`#/ticket/:id` | 锁仓列表、ticket |
| `#/witnesses`、`#/committee` | 见证人、理事会 |
| `#/workers`、`#/worker/:id` | 预算提案列表、详情 |
| `#/proposals`、`#/proposal/:id` | 提案列表、详情 |
| `#/network` | 链参数与手续费表 |
| `#/nodetracker` | 节点追踪 |
| `#/charts`、`#/charts/:id` | 图表列表、单张图表 |
| `#/confidential` | 隐私转账统计 |
| `#/export` | 数据导出 |
| `#/object/:id` | 任意 `1.x.y` / `2.x.y` 链上对象 |
| `#/search?q=` | 搜索结果 |

### 性能

- **按页分包与预取**：除首页外，每个页面都是单独的 JS 分包；鼠标悬停、聚焦或按下链接和导航菜单时会提前加载目标页面的分包
- **SWR 查询缓存**：`useQuery` 先显示缓存（10 秒有效、最多 100 条），同时刷新；相同请求合并，不重复发出
- **延迟切换**：路由切换使用 `useDeferredValue`，新页面就绪前保留当前页面，不闪白屏
- **骨架屏**：数据到达前显示占位骨架，而不是空白
- **其他**：图表结果缓存在 `sessionStorage`；资产、账户名批量并行解析；账户估值并行询价；节点追踪并行探测

### 本地开发

需要 Node.js 20.19+ 或 22.12+。

```bash
git clone https://github.com/xiao93/bitsharescan.git
# 或 git clone https://github.com/bitsharescan/bitsharescan.github.io.git
cd bitsharescan
npm ci
npm run dev        # http://127.0.0.1:43123
```

### 构建

```bash
npm run build      # tsc 类型检查 + vite build，输出到 dist/
npm run preview    # 本地预览 dist/
npm run lint       # oxlint
node scripts/verify-i18n.mjs   # 检查 25 种语言的键、占位符和数字格式
```

`dist/` 是纯静态文件。路由用 URL hash（`/#/block/123`），任何静态托管都能直接放，不需要重写规则。除首页外，每个页面都会单独打成一个 JS 分包，第一次访问时才加载。

### 部署

把 `dist/` 里的文件上传到任意静态托管即可（GitHub Pages、Nginx、对象存储等）。

当前线上部署：

- **GitHub Pages：** <https://bitsharescan.github.io/>。把 `main` 推到 [`bitsharescan/bitsharescan.github.io`](https://github.com/bitsharescan/bitsharescan.github.io) 后，`.github/workflows/deploy-pages.yml` 会自动执行 `npm ci && npm run build` 并发布 `dist/`。同一工作流在 [`xiao93/bitsharescan`](https://github.com/xiao93/bitsharescan) 上会跳过，不会重复部署。
- **deed.page：** <https://bitsharescan.deed.page/>。手动发布示例：

```bash
npm run build
tar -C dist -czf site.tar.gz .
curl -X PUT "https://deed.page/v1/sites?slug=<你的站点名>" \
  -H "Authorization: Bearer $DEED_PAGE_TOKEN" \
  -H "Content-Type: application/gzip" \
  --data-binary @site.tar.gz
```

令牌只放在环境变量或本机配置里，**不要**提交到仓库。

### 数据来源

| 用途 | 地址 |
| --- | --- |
| 主网节点（WebSocket） | 默认 `wss://api.bitshares.dev/ws`；连不上或连续超时会自动切换到 `wss://node.xbts.io/ws`、`wss://api.bts.mobi/ws`、`wss://api.dex.trading/ws`、`wss://dex.iobanker.com/ws` |
| 测试网节点 | `wss://testnet.dex.trading/ws`，备用 `wss://testnet.xbts.io/ws` |
| 操作历史、持有人、提案、图表 | 公开 Elasticsearch `https://es.bitshares.dev`（主网 `bitshares-*` / `objects-*`，测试网 `testnet-*` / `testnetobjs-*`） |
| 首页 BTS 价格 | 首选随站点发布的 CoinMarketCap 快照 `public/data/bts-price-history.json`（含自 2014 年起的日价，由 `scripts/cmc-price-history.py` 生成）；快照不可用时用 [CoinGecko](https://www.coingecko.com/en/coins/bitshares) 并附链上 DEX 加权价对比，再不行则只用 DEX 价格并注明成交量 |
| 手续费表 | 节点 `get_global_properties().parameters.current_fees`，用于网络页和区块总手续费 |

切换节点时会先校验 `get_chain_id`，不是所选网络的节点不会被使用。顶栏会显示当前连接的节点。首页「操作总数」是 Elasticsearch 的基数估算值，所以显示为「≈」。图表和首页 14 天曲线只统计完整的 UTC 日。

节点和 ES 地址也可以在页面右上角的设置里改，或在构建时用环境变量设置默认值：

```bash
VITE_WS_URL=wss://api.bitshares.dev/ws
VITE_ES_URL=https://es.bitshares.dev
VITE_HTTP_RPC=
```

### 可选：HTTP RPC 代理

只有浏览器打不开 WebSocket 的网络才需要。`proxy/server.mjs` 把 HTTP JSON-RPC 转发到节点并加上 CORS 头：

```bash
node proxy/server.mjs
# PORT=8787 RPC_TARGET=https://api.bitshares.dev/ node proxy/server.mjs
```

然后在设置里把「Optional HTTP RPC proxy」填成 `http://127.0.0.1:8787`。

### P2P 快照

`scripts/p2p-crawl.py` 走 Graphene P2P 握手，生成主网快照 `public/data/p2p-nodes.json` 和测试网快照 `public/data/p2p-nodes-testnet.json`，节点追踪页读取这些快照。需要 `coincurve` 和 `cryptography`：

```bash
python3 scripts/p2p-crawl.py                  # 主网
python3 scripts/p2p-crawl.py --network testnet
```

### 价格快照

`scripts/cmc-price-history.py` 从 CoinMarketCap 公共接口抓取 BTS 的完整日价和当前价，写入 `public/data/bts-price-history.json`（浏览器无法直接访问该接口，所以在服务器端生成）：

```bash
python3 scripts/cmc-price-history.py
```

### 首页广告位

`src/ads.config.ts` 配置首页搜索框右侧 321×81 的横幅。留空时显示「广告位招租」占位（手机上隐藏）。

### 目录结构

```
.github/workflows/deploy-pages.yml  GitHub Pages 自动部署
src/App.tsx            路由（页面按需加载）
src/components/        布局、搜索框、通用组件
src/pages/             各页面
src/lib/               节点客户端、ES 查询、查询缓存、路由预取、格式化、多语言等
public/                图标、P2P 快照和 BTS 价格快照
proxy/server.mjs       可选 HTTP RPC 代理
scripts/p2p-crawl.py   P2P 快照脚本
scripts/cmc-price-history.py  BTS 价格快照脚本
scripts/verify-i18n.mjs       多语言文案检查
```

### 许可证

[MIT](LICENSE)

---

## English

BitSharesScan is a static front-end (React 19 + TypeScript + Vite + Tailwind CSS) that reads BitShares mainnet and testnet data straight from public API nodes and the public Elasticsearch index. It only reads public chain data; it holds no keys and never broadcasts transactions.

This repository is the **original project source**. `npm run build` produces exactly what is deployed to the live site. The same code is maintained at [`xiao93/bitsharescan`](https://github.com/xiao93/bitsharescan) and [`bitsharescan/bitsharescan.github.io`](https://github.com/bitsharescan/bitsharescan.github.io).

### Features

- Blocks, transactions, operations; latest blocks and transactions; all 78 BitShares operation types, with an accurate `From` / `fee_payer()` field mapping
- **Total fees per block**: the home page Latest blocks, the blocks list, and the block page show the total fees paid in each block, summed from each operation's `fee` in the block data already fetched (no extra requests). The few operations paid in a non-BTS asset count the standard BTS fee for their operation type from the current fee schedule (including a transfer's memo part), and the total is marked "≈"
- Search: the header search box (press `/` to focus) takes a block number, a 40-character transaction id, a `1.x.y` object id, an account name, an asset symbol, or a public key; a `#/search?q=` link with a block number, transaction id, or object id also redirects straight to that page
- Accounts: balances and estimated value, open orders, debt positions, votes, authorities, whitelists, relations (registered / referred / vote proxies), an activity heatmap, full operation history (pages past 10,000 entries work) and data export
- Accounts leaderboard `#/accounts`: total accounts, 24h active and new accounts, lifetime members, 24h transfer / fill / pool-exchange rankings, and top BTS holders
- 24h large transfers `#/large-transfers`: filter by asset and minimum amount, with BTS and USD volume
- Asset list and details: supply, holders, feeds, markets; globally settled smartcoins are priced at their settlement price
- Governance: witnesses, committee, workers, **proposals (1.10.x) list and detail**
- DEX markets and order books: the `#/markets` overview, per-asset 24h market pages `#/market/:asset` (such as `#/market/BTS`), and single pairs at `#/market/:base/:quote`
- DeFi: liquidity pools (24h volume and swap counts, sortable by swaps or TVL), credit offers/deals, SameT flash loans (filterable by asset), locking (tickets)
- Network `#/network`: chain parameters and the fee schedule, with the operation id (Op), each fee component, and the lifetime-member fee (after cashback)
- Node tracker: public API nodes (probed in parallel from the browser) plus mainnet and testnet P2P snapshots and a map, produced by `scripts/p2p-crawl.py`
- Charts (27 charts, including the BTS price since 2014), confidential transfer stats, data export
- Interactive JSON tree: expand, copy, and UTF-8-decode long hex fields
- Twenty-five UI languages (English, Simplified Chinese, Traditional Chinese, Korean, Russian, Japanese, Vietnamese, Indonesian, Spanish, Portuguese, French, Arabic, Persian, Ukrainian, Turkish, German, Hindi, Thai, Italian, Polish, Dutch, Urdu, Hebrew, Bengali, and Malay; `en` / `zh-CN` / `zh-TW` / `ko` / `ru` / `ja` / `vi` / `id` / `es` / `pt` / `fr` / `ar` / `fa` / `uk` / `tr` / `de` / `hi` / `th` / `it` / `pl` / `nl` / `ur` / `he` / `bn` / `ms`), with automatic browser language detection and locale-aware number and date formatting (Gregorian calendar and Western digits, including Thai); Arabic, Persian, Urdu, and Hebrew use a right-to-left layout. English text is the key; the other 24 locale files live in `src/lib/locales/`. New strings must be added to all of them, then checked with `node scripts/verify-i18n.mjs` (keys, placeholders, digits)
- Mainnet / testnet switching, light / dim / black themes

### Routes

Routing lives in the URL hash, for example `/#/block/123`.

| Route | Page |
| --- | --- |
| `#/` | Home: price, market cap, head block, latest blocks and transactions, DeFi overview |
| `#/blocks`, `#/block/:num` | Block list, block detail |
| `#/txs`, `#/tx/:id`, `#/op/:id` | Transactions and operations list, transaction detail, operation detail |
| `#/account/:id`, `#/accounts` | Account detail, accounts leaderboard |
| `#/large-transfers` | 24h large transfers |
| `#/assets`, `#/asset/:id` | Asset list, asset detail |
| `#/markets`, `#/market/:asset`, `#/market/:base/:quote` | DEX markets overview, per-asset markets, pair detail |
| `#/pools`, `#/pool/:id` | Liquidity pools (with 24h stats), pool detail |
| `#/lending`, `#/credit-offer/:id`, `#/credit-deal/:id` | Lending list, credit offer, credit deal |
| `#/flash`, `#/samet/:id` | Flash loans (`?asset=` filter), SameT fund |
| `#/locking`, `#/ticket/:id` | Locking list, ticket |
| `#/witnesses`, `#/committee` | Witnesses, committee |
| `#/workers`, `#/worker/:id` | Workers list, worker detail |
| `#/proposals`, `#/proposal/:id` | Proposals list, proposal detail |
| `#/network` | Chain parameters and fee schedule |
| `#/nodetracker` | Node tracker |
| `#/charts`, `#/charts/:id` | Chart list, single chart |
| `#/confidential` | Confidential transfer stats |
| `#/export` | Data export |
| `#/object/:id` | Any `1.x.y` / `2.x.y` chain object |
| `#/search?q=` | Search results |

### Performance

- **Per-page chunks and prefetch**: every page except the home page is its own JS chunk, and hovering, focusing, or pressing a link or nav menu item loads the target chunk ahead of the click
- **SWR query cache**: `useQuery` shows cached data first (10-second TTL, up to 100 entries) while it refreshes, and identical in-flight requests are shared
- **Deferred transitions**: route changes use `useDeferredValue`, so the current page stays on screen until the next one is ready
- **Skeletons**: placeholder blocks show while data loads instead of a blank page
- **Also**: chart results are cached in `sessionStorage`; asset and account names are resolved in parallel batches; account value pricing runs in parallel; the node tracker probes nodes in parallel

### Develop

Requires Node.js 20.19+ or 22.12+.

```bash
git clone https://github.com/xiao93/bitsharescan.git
# or git clone https://github.com/bitsharescan/bitsharescan.github.io.git
cd bitsharescan
npm ci
npm run dev        # http://127.0.0.1:43123
```

### Build

```bash
npm run build      # tsc type check + vite build into dist/
npm run preview    # serve dist/ locally
npm run lint       # oxlint
node scripts/verify-i18n.mjs   # check keys, placeholders and digits across the 25 languages
```

`dist/` is plain static files. Routing lives in the URL hash (`/#/block/123`), so any static host works without rewrites. Every page except the home page is its own JS chunk, loaded on first visit.

### Deploy

Upload the contents of `dist/` to any static host (GitHub Pages, Nginx, object storage, ...).

Current live deployments:

- **GitHub Pages:** <https://bitsharescan.github.io/>. Pushing `main` to [`bitsharescan/bitsharescan.github.io`](https://github.com/bitsharescan/bitsharescan.github.io) runs `.github/workflows/deploy-pages.yml`, which builds with `npm ci && npm run build` and publishes `dist/`. The same workflow is skipped on [`xiao93/bitsharescan`](https://github.com/xiao93/bitsharescan) so it does not deploy twice.
- **deed.page:** <https://bitsharescan.deed.page/>. Manual publish example:

```bash
npm run build
tar -C dist -czf site.tar.gz .
curl -X PUT "https://deed.page/v1/sites?slug=<your-site>" \
  -H "Authorization: Bearer $DEED_PAGE_TOKEN" \
  -H "Content-Type: application/gzip" \
  --data-binary @site.tar.gz
```

Keep the token in an environment variable or local config. **Never** commit it.

### Data sources

| Use | Endpoint |
| --- | --- |
| Mainnet node (WebSocket) | Default `wss://api.bitshares.dev/ws`; on connection failure or repeated timeouts it fails over to `wss://node.xbts.io/ws`, `wss://api.bts.mobi/ws`, `wss://api.dex.trading/ws`, `wss://dex.iobanker.com/ws` |
| Testnet node | `wss://testnet.dex.trading/ws`, fallback `wss://testnet.xbts.io/ws` |
| Operation history, holders, proposals, charts | Public Elasticsearch `https://es.bitshares.dev` (mainnet `bitshares-*` / `objects-*`, testnet `testnet-*` / `testnetobjs-*`) |
| Home page BTS price | The CoinMarketCap snapshot shipped with the site, `public/data/bts-price-history.json` (daily prices since 2014, made by `scripts/cmc-price-history.py`); if it is missing, [CoinGecko](https://www.coingecko.com/en/coins/bitshares) with the on-chain DEX volume-weighted price shown for comparison, then the DEX price alone (with its 24h volume) |
| Fee schedule | Node `get_global_properties().parameters.current_fees`, used by the Network page and block total fees |

Before a node is used, its `get_chain_id` must match the selected network. The top bar shows which node is in use. The home page operation count is an Elasticsearch cardinality estimate, so it is shown with "≈". Charts and the home 14-day curve count whole UTC days only.

Endpoints can be changed in the settings dialog, or given build-time defaults:

```bash
VITE_WS_URL=wss://api.bitshares.dev/ws
VITE_ES_URL=https://es.bitshares.dev
VITE_HTTP_RPC=
```

### Optional HTTP RPC proxy

Only needed on networks that block browser WebSockets. `proxy/server.mjs` forwards HTTP JSON-RPC to a node and adds CORS headers:

```bash
node proxy/server.mjs
# PORT=8787 RPC_TARGET=https://api.bitshares.dev/ node proxy/server.mjs
```

Then set **Optional HTTP RPC proxy** to `http://127.0.0.1:8787` in settings.

### P2P snapshot

`scripts/p2p-crawl.py` speaks the Graphene P2P handshake and writes the mainnet snapshot `public/data/p2p-nodes.json` and the testnet snapshot `public/data/p2p-nodes-testnet.json`, which the node tracker reads. It needs `coincurve` and `cryptography`:

```bash
python3 scripts/p2p-crawl.py                  # mainnet
python3 scripts/p2p-crawl.py --network testnet
```

### Price snapshot

`scripts/cmc-price-history.py` fetches BTS daily prices and the current price from CoinMarketCap's public API and writes `public/data/bts-price-history.json` (done server-side because the browser cannot call that API):

```bash
python3 scripts/cmc-price-history.py
```

### Home page banner

`src/ads.config.ts` sets the 321×81 banner next to the home search box. Left empty, it shows an "Advertise here" placeholder (hidden on phones).

### Layout

```
.github/workflows/deploy-pages.yml  GitHub Pages auto-deploy
src/App.tsx            routes (pages load on demand)
src/components/        layout, search, shared widgets
src/pages/             one file per page
src/lib/               node client, Elasticsearch queries, query cache, route prefetch, formatting, i18n
public/                icons, the P2P snapshot, and the BTS price snapshot
proxy/server.mjs       optional HTTP RPC proxy
scripts/p2p-crawl.py   P2P snapshot crawler
scripts/cmc-price-history.py  BTS price snapshot script
scripts/verify-i18n.mjs       locale file checker
```

### License

[MIT](LICENSE)
