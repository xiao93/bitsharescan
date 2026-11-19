#!/usr/bin/env node
/**
 * Optional CORS proxy for the BitShares HTTP JSON-RPC endpoint.
 * The public node does not send Access-Control-Allow-Origin, so a browser
 * cannot POST to it directly. WebSocket (wss://api.bitshares.dev/ws) does not
 * need this proxy. Elasticsearch already allows browser requests.
 *
 *   node proxy/server.mjs
 *   PORT=8787 RPC_TARGET=https://api.bitshares.dev/ node proxy/server.mjs
 *
 * Then set "Optional HTTP RPC proxy" in the explorer settings to
 * http://127.0.0.1:8787
 */
import http from "node:http"
import https from "node:https"

const port = Number(process.env.PORT || 8787)
const target = process.env.RPC_TARGET || "https://api.bitshares.dev/"

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true, target, note: "POST JSON-RPC calls are forwarded to the BitShares node." }))
    return
  }
  if (req.method !== "POST") {
    res.writeHead(405)
    res.end()
    return
  }
  const chunks = []
  req.on("data", (chunk) => chunks.push(chunk))
  req.on("end", () => {
    const body = Buffer.concat(chunks)
    const url = new URL(target)
    const upstream = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
      },
      (upstreamResponse) => {
        res.writeHead(upstreamResponse.statusCode || 502, {
          "Content-Type": upstreamResponse.headers["content-type"] || "application/json",
          "Access-Control-Allow-Origin": "*",
        })
        upstreamResponse.pipe(res)
      },
    )
    upstream.on("error", (error) => {
      res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
      res.end(JSON.stringify({ error: String(error) }))
    })
    upstream.end(body)
  })
})

server.listen(port, "127.0.0.1", () => {
  console.log(`BitShares RPC proxy listening on http://127.0.0.1:${port} -> ${target}`)
})
