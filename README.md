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
- 账户：余额、挂单、抵押仓位、投票、权限、白名单、关系，以及完整操作历史（超过 1 万条也能翻页）和数据导出
- 资产列表与详情：供应量、持有人、喂价、市场
- 治理：见证人、理事会、预算提案（workers）、**提案（1.10.x）列表与详情**
- DEX 市场与订单簿；流动性池、借贷（credit offer/deal）、SameT 闪贷、锁仓（tickets）
- 节点追踪：主网与测试网的公共 API 节点，以及由 `scripts/p2p-crawl.py` 生成的 P2P 节点快照和地图
- 交互式 JSON 树：长十六进制字段可展开、复制，并解码为 UTF-8
- 网络参数与手续费表、图表统计、隐私转账统计
- 14 种界面语言（英语、简体中文、繁体中文、韩语、俄语、日语、越南语、印尼语、西班牙语、葡萄牙语、法语、阿拉伯语、波斯语、乌克兰语；`en` / `zh-CN` / `zh-TW` / `ko` / `ru` / `ja` / `vi` / `id` / `es` / `pt` / `fr` / `ar` / `fa` / `uk`），按浏览器语言自动选择，数字和日期按对应 locale 格式化；阿拉伯语与波斯语为从右到左排版
- 主网 / 测试网切换，浅色 / Dim / 黑色主题

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
| 首页 BTS 价格 | [CoinGecko](https://www.coingecko.com/en/coins/bitshares)，并附链上 DEX 加权价作对比；CoinGecko 不可用时退回 DEX 价格并注明成交量 |

切换节点时会先校验 `get_chain_id`，不是所选网络的节点不会被使用。顶栏会显示当前连接的节点。首页「操作总数」是 Elasticsearch 的基数估算值，所以显示为「≈」。

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

### 首页广告位

`src/ads.config.ts` 配置首页搜索框右侧 321×81 的横幅。留空时显示「广告位招租」占位（手机上隐藏）。

### 目录结构

```
.github/workflows/deploy-pages.yml  GitHub Pages 自动部署
src/App.tsx            路由（页面按需加载）
src/components/        布局、搜索框、通用组件
src/pages/             各页面
src/lib/               节点客户端、ES 查询、格式化、多语言等
public/                图标与 P2P 快照
proxy/server.mjs       可选 HTTP RPC 代理
scripts/p2p-crawl.py   P2P 快照脚本
```

### 许可证

[MIT](LICENSE)

---

## English

BitSharesScan is a static front-end (React 19 + TypeScript + Vite + Tailwind CSS) that reads BitShares mainnet and testnet data straight from public API nodes and the public Elasticsearch index. It only reads public chain data; it holds no keys and never broadcasts transactions.

This repository is the **original project source**. `npm run build` produces exactly what is deployed to the live site. The same code is maintained at [`xiao93/bitsharescan`](https://github.com/xiao93/bitsharescan) and [`bitsharescan/bitsharescan.github.io`](https://github.com/bitsharescan/bitsharescan.github.io).

### Features

- Blocks, transactions, operations; latest blocks and transactions; all 78 BitShares operation types, with an accurate `From` / `fee_payer()` field mapping
- Accounts: balances, open orders, debt positions, votes, authorities, whitelists, relations, full operation history (pages past 10,000 entries work) and data export
- Asset list and details: supply, holders, feeds, markets
- Governance: witnesses, committee, workers, **proposals (1.10.x) list and detail**
- DEX markets and order books; liquidity pools, credit offers/deals, SameT flash loans, locking (tickets)
- Node tracker: public API nodes plus mainnet and testnet P2P snapshots and a map, produced by `scripts/p2p-crawl.py`
- Interactive JSON tree: expand, copy, and UTF-8-decode long hex fields
- Chain parameters and fee schedule, charts, confidential transfer stats
- Fourteen UI languages (English, Simplified Chinese, Traditional Chinese, Korean, Russian, Japanese, Vietnamese, Indonesian, Spanish, Portuguese, French, Arabic, Persian, and Ukrainian; `en` / `zh-CN` / `zh-TW` / `ko` / `ru` / `ja` / `vi` / `id` / `es` / `pt` / `fr` / `ar` / `fa` / `uk`), with automatic browser language detection and locale-aware number and date formatting; Arabic and Persian use a right-to-left layout
- Mainnet / testnet switching, light / dim / black themes

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
| Home page BTS price | [CoinGecko](https://www.coingecko.com/en/coins/bitshares), with the on-chain DEX volume-weighted price shown for comparison; falls back to the DEX price (with its 24h volume) when CoinGecko is unreachable |

Before a node is used, its `get_chain_id` must match the selected network. The top bar shows which node is in use. The home page operation count is an Elasticsearch cardinality estimate, so it is shown with "≈".

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

### Home page banner

`src/ads.config.ts` sets the 321×81 banner next to the home search box. Left empty, it shows an "Advertise here" placeholder (hidden on phones).

### Layout

```
.github/workflows/deploy-pages.yml  GitHub Pages auto-deploy
src/App.tsx            routes (pages load on demand)
src/components/        layout, search, shared widgets
src/pages/             one file per page
src/lib/               node client, Elasticsearch queries, formatting, i18n
public/                icons and the P2P snapshot
proxy/server.mjs       optional HTTP RPC proxy
scripts/p2p-crawl.py   P2P snapshot crawler
```

### License

[MIT](LICENSE)
