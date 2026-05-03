const gbpWhole = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
})

const gbpPrecise = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatGBP(value: number): string {
  return gbpWhole.format(Math.round(value))
}

export function formatGBPPrecise(value: number): string {
  return gbpPrecise.format(value)
}

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// Normalise a date string from Google Sheets into ISO yyyy-MM-dd.
// Accepts: yyyy-MM-dd, yyyy/MM/dd, dd/MM/yyyy, dd-MM-yyyy, d/M/yy, ISO datetime.
// Returns null if the string can't be confidently parsed.
export function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (s === '') return null

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  const ymd = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s)
  if (dmy) {
    let year = Number(dmy[3])
    if (year < 100) year += year < 70 ? 2000 : 1900
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  const native = new Date(s)
  if (!Number.isNaN(native.getTime())) {
    const y = native.getFullYear()
    const m = String(native.getMonth() + 1).padStart(2, '0')
    const d = String(native.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return null
}

export function formatLongDate(isoDate: string): string {
  const normalised = toIsoDate(isoDate) ?? isoDate
  const d = new Date(`${normalised}T00:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return longDate.format(d)
}

export function parseMoney(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const cleaned = raw.replace(/[£,\s]/g, '').trim()
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

// Mix a hex colour with white at the given ratio (0..1) and return hex.
// Used to derive a lighter row tint from a section header colour.
export function lightenHex(hex: string, ratio: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const v = parseInt(m[1], 16)
  const r = (v >> 16) & 0xff
  const g = (v >> 8) & 0xff
  const b = v & 0xff
  const blend = (c: number) => Math.round(c + (255 - c) * ratio)
  const out = (blend(r) << 16) | (blend(g) << 8) | blend(b)
  return `#${out.toString(16).padStart(6, '0')}`
}
