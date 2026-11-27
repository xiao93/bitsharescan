#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

const root = path.resolve(import.meta.dirname, "..")
const srcRoot = path.join(root, "src")

function loadDict(file) {
  const src = fs.readFileSync(path.join(srcRoot, "lib/locales", file), "utf8")
  const start = src.indexOf("{")
  const end = src.lastIndexOf("}")
  if (start < 0 || end < 0) throw new Error(`No object in ${file}`)
  return eval(`(${src.slice(start, end + 1)})`)
}

const zh = loadDict("zh.ts")
const dicts = {
  "zh-TW": loadDict("zh-TW.ts"),
  ko: loadDict("ko.ts"),
  ru: loadDict("ru.ts"),
  ja: loadDict("ja.ts"),
  vi: loadDict("vi.ts"),
  id: loadDict("id.ts"),
  es: loadDict("es.ts"),
  pt: loadDict("pt.ts"),
  fr: loadDict("fr.ts"),
  ar: loadDict("ar.ts"),
  fa: loadDict("fa.ts"),
  uk: loadDict("uk.ts"),
  tr: loadDict("tr.ts"),
  de: loadDict("de.ts"),
  hi: loadDict("hi.ts"),
  th: loadDict("th.ts"),
  it: loadDict("it.ts"),
  pl: loadDict("pl.ts"),
  nl: loadDict("nl.ts"),
  ur: loadDict("ur.ts"),
  he: loadDict("he.ts"),
  bn: loadDict("bn.ts"),
  ms: loadDict("ms.ts"),
}

const zhKeys = Object.keys(zh)
const placeholder = /\{[A-Za-z0-9_]+\}/g
const errors = []
const counts = {}

for (const [lang, dict] of Object.entries(dicts)) {
  let present = 0
  for (const key of zhKeys) {
    const value = dict[key]
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`${lang}: missing or empty key ${JSON.stringify(key)}`)
      continue
    }
    present += 1
    const srcPh = [...key.matchAll(placeholder)].map((m) => m[0]).sort()
    const dstPh = [...value.matchAll(placeholder)].map((m) => m[0]).sort()
    if (srcPh.join() !== dstPh.join()) {
      errors.push(`${lang}: placeholder mismatch for ${JSON.stringify(key)} expected ${srcPh.join(" ")} got ${dstPh.join(" ")}`)
    }
  }
  const extra = Object.keys(dict).filter((k) => !(k in zh))
  if (extra.length) errors.push(`${lang}: ${extra.length} extra keys, e.g. ${extra.slice(0, 5).join(", ")}`)
  counts[lang] = present
}

const grep = execSync(
  `rg -n 'lang === "zh"|getLanguage\\(\\) === "zh"|setLang\\(.*=== "zh"' ${JSON.stringify(srcRoot)} -g '*.ts' -g '*.tsx' || true`,
  { encoding: "utf8", shell: "/bin/bash" },
)
const leftover = grep
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => !line.includes("lang === \"zh\" || lang === \"zh-TW\""))

if (leftover.length) {
  for (const line of leftover) errors.push(`lingering zh-only branch: ${line}`)
}

// Eastern Arabic, Persian, Devanagari, Bengali, and Thai digits must not appear in locale files.
const nonWestern = /[\u0660-\u0669\u06F0-\u06F9\u066B\u066C\u0966-\u096F\u09E6-\u09EF\u0E50-\u0E59]/
const localeFiles = fs.readdirSync(path.join(srcRoot, "lib/locales")).filter((f) => f.endsWith(".ts"))
for (const file of localeFiles) {
  const src = fs.readFileSync(path.join(srcRoot, "lib/locales", file), "utf8")
  const hits = []
  for (const [i, line] of src.split(/\n/).entries()) {
    if (nonWestern.test(line)) hits.push(`${file}:${i + 1}`)
  }
  if (hits.length) errors.push(`${file}: non-Western digits remain (${hits.length}), e.g. ${hits.slice(0, 5).join(", ")}`)
}

const majorKeys = [
  "Home",
  "Blocks",
  "Transactions",
  "Confidential transfers",
  "Assets",
  "Governance",
  "Witnesses",
  "Committee",
  "Workers",
  "Markets",
  "Liquidity pools",
  "Lending",
  "Flash loans",
  "Locking",
  "Network",
  "Node tracker",
  "Settings",
  "Language",
  "Theme",
  "Search",
  "Account",
  "Overview",
  "Balances",
  "The BitShares Blockchain Explorer",
  "BitShares (BTS) Blockchain Explorer",
  "Last 12 months",
  "No data yet.",
  "Try again",
  "Download CSV",
  "Page not found",
  "Breadcrumb",
]
const leakAllowExact = new Set([
  // Legitimate loanwords / identical forms kept as industry terms.
  'fr:Transactions',
  'de:Assets',
  'de:Governance',
  'it:Governance',
  'nl:Assets',
  'nl:Account',
])
for (const [lang, dict] of Object.entries(dicts)) {
  const leaks = []
  for (const key of majorKeys) {
    if (!(key in dict)) continue
    if (dict[key] === key && !leakAllowExact.has(`${lang}:${key}`)) leaks.push(key)
  }
  if (leaks.length) errors.push(`${lang}: untranslated English leaks on major UI keys: ${leaks.join(", ")}`)
}

const ok = errors.length === 0
console.log(JSON.stringify({ ok, zhKeys: zhKeys.length, localeCount: Object.keys(dicts).length + 1, counts, leftoverBranches: leftover, errors }, null, 2))
if (!ok) process.exit(1)
