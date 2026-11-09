import { describe, it, expect } from 'vitest'
import { formatRupiah, formatShort, formatDate, formatDateTime, currentYear } from './format'

describe('formatRupiah', () => {
  it('menghasilkan string berisi "Rp" dan "0" untuk nilai 0', () => {
    const hasil = formatRupiah(0)
    expect(hasil).toContain('Rp')
    expect(hasil).toContain('0')
  })

  it('menangani null/undefined (cast) sebagai 0', () => {
    // @ts-expect-error menguji ketahanan terhadap nilai nullish
    expect(formatRupiah(null)).toContain('Rp')
    // @ts-expect-error menguji ketahanan terhadap nilai nullish
    expect(formatRupiah(undefined)).toContain('0')
  })

  it('memformat nilai besar dengan pemisah ribuan', () => {
    const hasil = formatRupiah(1500000)
    expect(hasil).toContain('Rp')
    expect(hasil).toContain('1.500.000')
  })
})

describe('formatShort', () => {
  it('memakai sufiks "M" untuk nilai miliar', () => {
    expect(formatShort(2_500_000_000)).toContain('M')
  })

  it('memakai sufiks "Jt" untuk nilai jutaan', () => {
    expect(formatShort(1_500_000)).toContain('Jt')
  })

  it('mendelegasikan ke formatRupiah untuk nilai kecil', () => {
    expect(formatShort(5000)).toContain('Rp')
  })
})

describe('formatDate', () => {
  it('mengembalikan "-" untuk string kosong', () => {
    expect(formatDate('')).toBe('-')
  })

  it('mengandung tahun dan bulan untuk tanggal valid', () => {
    const hasil = formatDate('2026-01-01')
    expect(hasil).toContain('2026')
    expect(hasil).toMatch(/Jan|01/)
  })
})

describe('formatDateTime', () => {
  it('mengembalikan "-" untuk string kosong', () => {
    expect(formatDateTime('')).toBe('-')
  })

  it('mengandung tahun untuk timestamp valid', () => {
    expect(formatDateTime('2026-01-01T10:00:00Z')).toContain('2026')
  })
})

describe('currentYear', () => {
  it('mengembalikan number >= 2024', () => {
    const tahun = currentYear()
    expect(typeof tahun).toBe('number')
    expect(tahun).toBeGreaterThanOrEqual(2024)
  })
})
