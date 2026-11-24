export function normalizePhone(input) {
  let d = String(input).replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (!d.startsWith('62') && d.length <= 11) d = '62' + d
  if (!/^\d{10,15}$/.test(d)) throw new Error('nomor tidak valid: ' + input)
  return d
}