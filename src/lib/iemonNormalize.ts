import { normalizeUraian } from '@/lib/realisasiNormalize'

export function textCell(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

export function normalizeIemonLabel(value: string): string {
  const compact = value
    .replace(/\u00a0/g, ' ')
    .replace(/[•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!compact) return ''
  return normalizeUraian(compact)
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function normalizeCodeSegment(value: unknown): string {
  const raw = textCell(value)
  return raw.replace(/\s+/g, '').toUpperCase()
}

export function joinCodeSegments(...parts: unknown[]): string {
  return parts
    .map((part) => normalizeCodeSegment(part))
    .filter(Boolean)
    .join('.')
}

export function toNumber(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const compact = String(value).replace(/[^\d,.-]/g, '')
  const normalized =
    compact.includes(',') && compact.includes('.')
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function toPercent(value: unknown): number {
  const n = toNumber(value)
  if (Math.abs(n) <= 1) return Math.round(n * 10000) / 100
  return Math.round(n * 100) / 100
}

export function toDateIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()

  // Handle Excel Serial Number (e.g. 44682)
  if (typeof value === 'number' && value > 10000 && value < 100000) {
    // Excel epoch is Dec 30, 1899
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const date = new Date(epoch.getTime() + value * 86400000)
    return date.toISOString()
  }

  const asString = textCell(value)
  if (!asString) return null

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmmyyyy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(asString)
  if (dmmyyyy) {
    const [, d, m, y] = dmmyyyy
    const parsed = new Date(Date.UTC(parseInt(y as string), parseInt(m as string) - 1, parseInt(d as string)))
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const parsed = new Date(asString)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

