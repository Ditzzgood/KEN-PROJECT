import fs from 'node:fs'

const normalize = (line) => {
  if (/^\w+:\/\//.test(line)) return line
  const [host, port, user, pass] = line.split(':')
  return user ? `http://${user}:${pass}@${host}:${port}` : `http://${host}:${port}`
}

export class ProxyPool {
  constructor(list = []) {
    this.items = list.map((url) => ({ url, fails: 0, dead: false }))
  }
  static fromFile(p) {
    if (!p) return new ProxyPool([])
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    return new ProxyPool(lines.map(normalize))
  }
  get enabled() { return this.items.length > 0 }
  pick() {
    if (!this.enabled) return null
    const alive = this.items.filter((i) => !i.dead)
    const pool = alive.length ? alive : this.items
    return pool[Math.floor(Math.random() * pool.length)]
  }
  ok(item) { if (item) item.fails = 0 }
  fail(item) { if (item && ++item.fails >= 3) item.dead = true }
  stats() { return { total: this.items.length, dead: this.items.filter((i) => i.dead).length } }
}