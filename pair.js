import makeWASocket, { initAuthCreds, Browsers } from '@whiskeysockets/baileys'
import pino from 'pino'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'

const silent = pino({ level: 'silent' })

const makeAgent = (url) => {
  if (!url) return undefined
  return url.startsWith('socks') ? new SocksProxyAgent(url) : new HttpsProxyAgent(url)
}

// auth state di memori: tidak perlu nulis ke disk, kita toh tidak menyelesaikan pairing
const memAuth = () => {
  const store = new Map()
  return {
    creds: initAuthCreds(),
    keys: {
      get: async (type, ids) => {
        const out = {}
        for (const id of ids) {
          const k = `${type}:${id}`
          if (store.has(k)) out[id] = store.get(k)
        }
        return out
      },
      set: async (data) => {
        for (const type in data) {
          for (const id in data[type]) {
            const k = `${type}:${id}`
            const v = data[type][id]
            v ? store.set(k, v) : store.delete(k)
          }
        }
      }
    }
  }
}

const withTimeout = (p, ms, label) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })

export async function requestCode({
  phone,
  proxy,
  timeoutMs = 25000,
  browserOs = 'ubuntu',
  browserName = 'Chrome'
}) {
  const sock = makeWASocket({
    auth: memAuth(),
    logger: silent,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    browser: (Browsers[browserOs] || Browsers.ubuntu)(browserName),
    agent: makeAgent(proxy),
    connectTimeoutMs: timeoutMs,
    defaultQueryTimeoutMs: timeoutMs,
    retryRequestDelayMs: 300,
    generateHighQualityLinkPreview: false
  })

  try {
    const code = await withTimeout(sock.requestPairingCode(phone), timeoutMs, 'pair')
    return { code }
  } finally {
    try { sock.end(undefined) } catch {}
    try { sock.ws?.close() } catch {}
    try { sock.ev.removeAllListeners() } catch {}
  }
}

export function classify(err) {
  const msg = String(err?.message ?? err)
  const sc = err?.output?.statusCode
  if (sc === 429 || /429|rate|too many|flood|overlimit/i.test(msg)) return 'RATE_LIMIT'
  if (/^timeout:|timed out|timeout/i.test(msg)) return 'TIMEOUT'
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|socket hang up|proxy|tunnel/i.test(msg)) return 'NETWORK'
  if (sc === 515 || /restart/i.test(msg)) return 'RESTART'
  return 'ERROR'
}