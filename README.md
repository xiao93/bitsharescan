# BitSharesScan

[中文](#bitsharescan-中文) | [English](#bitsharescan-english)

开源的 [BitShares](https://bitshares.org/) 区块链浏览器。线上站点：[https://bitsharescan.deed.page/](https://bitsharescan.deed.page/)

An open-source [BitShares](https://bitshares.org/) blockchain explorer. Live site: [https://bitsharescan.deed.page/](https://bitsharescan.deed.page/)

---

## BitSharesScan (中文)

BitSharesScan 是一个纯前端静态站点，通过公共 WebSocket API 节点和公开的 Elasticsearch 索引浏览 BitShares 主网与测试网：区块、交易、账户、资产、治理、DEX 与部分 DeFi 功能。

### 功能

- 区块、交易、操作查询
- 账户余额、权限、投票、历史记录（支持 1 万条以上翻页）与导出
- 资产列表与详情，包括持有人、喂价、结算、市场、流动性池
- 治理：见证人、理事会、工人预算、提案列表与详情
- DEX 市场与订单簿；流动性池、借贷、闪贷、同额转账、锁仓
- 节点追踪（公共 API 与 P2P 种子列表）
- 图表与统计；隐私转账统计页
- 中文 / 英文，主网 / 测试网，浅色 / Dim / 深色主题
- 节点自动故障切换；首页价格默认使用 CoinGecko，并标注来源（无法取得时回退到链上 DEX 报价）

### 关于这份源码（请先读）

**原始工程源码已经找不到。** 本仓库里的可读 JavaScript 是从当时线上的生产打包文件反美化（de-minify）后再打补丁得到的，变量名仍是打包后的短名称，**不是**当初的组件/工程源码。因此代码是生成的、可读但难以按模块维护。`dist/` 是当前部署到线上站点的静态文件。

后续若要做路由级代码拆分等较大改动，建议在此基础上逐步还原成可维护的工程，或用新的前端工程重写页面、复用现有 API 调用逻辑。

### 数据来源

站点本身不运行节点，也不存储私钥。浏览器直接请求下列公共服务：

| 用途 | 地址 |
|---|---|
| 主网 WebSocket（默认，失败会自动切换） | `wss://api.bitshares.dev/ws`，备用：`wss://node.xbts.io/ws`、`wss://api.bts.mobi/ws`、`wss://api.dex.trading/ws`、`wss://dex.iobanker.com/ws` |
| 测试网 WebSocket | `wss://testnet.dex.trading/ws`，备用：`wss://testnet.xbts.io/ws` |
| 操作历史、持有人、提案、图表等 | 公开 Elasticsearch：`https://es.bitshares.dev`（代码中无认证头，按网络使用不同索引前缀） |
| 首页 BTS 美元价格 | [CoinGecko](https://api.coingecko.com/api/v3/simple/price?ids=bitshares&vs_currencies=usd)，失败时回退到链上 DEX |
| 节点追踪页的 P2P 名单 | 本仓库 `data/p2p-nodes.json` 与 `data/p2p-nodes-testnet.json`；地理/DNS 查询使用公开的 geojs 与 Google DNS |

可在站点设置中自定义节点和 ES 地址。可选的 HTTP RPC 代理仅用于你自己的本地转发，占位符为 `http://127.0.0.1:8787`。

### 本地运行

需要 Node.js（用于 `esbuild`）和 Python 3。

```bash
git clone https://github.com/xiao93/bitsharescan.git
cd bitsharescan
npm install
# 直接预览已经构建好的 dist/：
npm start
# 浏览器打开 http://127.0.0.1:4173/
```

从可读源码重新打包：

```bash
npm run build
npm start
```

`npm run build` 会先运行 `src/patches/apply.py`（把补丁打进 `src/app.js`，写出 `src/app.patched.js`），再用 esbuild 压缩 JS，把 `src/style.css` 与 `src/patches/extra.css` 合并为 CSS，并更新 `dist/index.html` 中的带内容哈希的文件名。重新打包后的 JS 内容哈希未必与当前 `dist/` 里已部署的文件完全相同，但功能一致；本仓库提交的 `dist/` 是线上正在使用的那一份。

这是一个 hash 路由的静态站点（`#/account/...`），用任意静态文件服务器托管即可，无需后端。

### 部署

把 `dist/` 目录发布到任意静态托管即可（deed.page、GitHub Pages、Nginx、对象存储网站托管等）。不要把主机令牌、API 密钥或 `.env` 提交进仓库。若使用 deed.page，请把令牌放在环境变量或本地配置文件中，**不要写进脚本**。

### 目录结构

```
src/app.js                 从原生产包反美化的 JS（打补丁前）
src/app.patched.js         打补丁后的可读 JS（当前逻辑）
src/style.css              原生产包 CSS
src/index.html             页面模板
src/patches/apply.py       补丁脚本
src/patches/proposals.js   提案页
src/patches/extra.css      移动端等样式补丁
data/                      P2P 节点名单（构建时复制到 dist/data/）
public/                    图标
dist/                      当前线上部署使用的静态文件
scripts/build.sh           重新打包
```

### 许可

[MIT](LICENSE)，Copyright (c) 2026 xiao93。打包文件中还包含 React、React Router、Tailwind CSS 等第三方库，遵循各自的开源许可证。

---

## BitSharesScan (English)

BitSharesScan is a static, client-side explorer for the BitShares mainnet and testnet. It talks to public WebSocket API nodes and a public Elasticsearch index, and covers blocks, transactions, accounts, assets, governance, the DEX, and some DeFi features.

### Features

- Blocks, transactions, and operations
- Account balances, authorities, votes, history (including pages beyond 10,000 entries), and export
- Assets, holders, feeds, settlements, markets, and pools
- Governance: witnesses, committee, budget workers, and proposal list/detail pages
- DEX markets and order books; liquidity pools, lending, flash loans, same-T transfers, and locking
- Node tracker (public API nodes and P2P seeds)
- Charts/statistics and a confidential-transfer statistics page
- Chinese / English, mainnet / testnet, light / dim / dark themes
- Automatic API node failover; homepage USD price from CoinGecko with a visible source label (falls back to the on-chain DEX)

### About this source tree

**The original application source is not available.** The readable JavaScript in this repository was reconstructed by de-minifying the production bundle and then applying patches. Identifiers are still the short names from the bundled output; this is **not** the original component-level source. Treat it as generated, readable code. `dist/` is the exact static tree currently deployed to the live site.

Larger changes such as route-level code splitting would be easier after gradually turning this back into a maintainable project, or after rewriting the UI and reusing the existing API-calling logic.

### Data sources

The site does not run a node and does not store private keys. The browser calls these public services:

| Purpose | Endpoint |
|---|---|
| Mainnet WebSocket (default, with failover) | `wss://api.bitshares.dev/ws`, then `wss://node.xbts.io/ws`, `wss://api.bts.mobi/ws`, `wss://api.dex.trading/ws`, `wss://dex.iobanker.com/ws` |
| Testnet WebSocket | `wss://testnet.dex.trading/ws`, then `wss://testnet.xbts.io/ws` |
| Operation history, holders, proposals, charts | Public Elasticsearch at `https://es.bitshares.dev` (no auth headers in this code; index prefixes differ per network) |
| Homepage BTS/USD price | [CoinGecko](https://api.coingecko.com/api/v3/simple/price?ids=bitshares&vs_currencies=usd), with an on-chain DEX fallback |
| Node-tracker P2P lists | `data/p2p-nodes.json` and `data/p2p-nodes-testnet.json`; geo/DNS lookups use public geojs and Google DNS |

Custom node and ES URLs can be set in the in-app settings. The optional HTTP RPC proxy field is only for a local proxy you run yourself; the placeholder is `http://127.0.0.1:8787`.

### Run locally

You need Node.js (for `esbuild`) and Python 3.

```bash
git clone https://github.com/xiao93/bitsharescan.git
cd bitsharescan
npm install
# Serve the already-built dist/ directory:
npm start
# Open http://127.0.0.1:4173/
```

Rebuild from the readable source:

```bash
npm run build
npm start
```

`npm run build` runs `src/patches/apply.py` (patches `src/app.js` into `src/app.patched.js`), minifies the JS with esbuild, concatenates `src/style.css` and `src/patches/extra.css`, and rewrites the content-hashed filenames in `dist/index.html`. A rebuild may produce a different JS content hash from the files already in `dist/`; behavior is the same. The committed `dist/` is the tree currently served on the live site.

This is a hash-router static app (`#/account/...`). Any static file server is enough; no backend is required.

### Deploy

Publish the `dist/` directory to any static host (deed.page, GitHub Pages, Nginx, object-storage website hosting, and so on). Do not commit host tokens, API keys, or `.env` files. If you deploy with deed.page, read the token from an environment variable or a local config file — **never hard-code it**.

### Layout

```
src/app.js                 De-minified JS from the original production bundle (before patches)
src/app.patched.js         Readable JS after patches (current behavior)
src/style.css              CSS from the original production bundle
src/index.html             HTML template
src/patches/apply.py       Patch script
src/patches/proposals.js   Proposals pages
src/patches/extra.css      Mobile and layout CSS patches
data/                      P2P node lists (copied into dist/data/ at build time)
public/                    Icons
dist/                      Static files currently deployed to the live site
scripts/build.sh           Rebuild
```

### License

[MIT](LICENSE), Copyright (c) 2026 xiao93. The bundled file also includes third-party libraries such as React, React Router, and Tailwind CSS, each under its own license.
