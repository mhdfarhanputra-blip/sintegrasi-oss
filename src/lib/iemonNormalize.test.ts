import { describe, it, expect } from 'vitest'
import {
  textCell,
  normalizeIemonLabel,
  normalizeCodeSegment,
  joinCodeSegments,
  toNumber,
  toPercent,
  toDateIso,
} from '@/lib/iemonNormalize'

describe('textCell', () => {
  it('mengembalikan string kosong untuk null', () => {
    expect(textCell(null)).toBe('')
  })

  it('mengembalikan string kosong untuk undefined', () => {
    expect(textCell(undefined)).toBe('')
  })

  it('mengubah number menjadi string', () => {
    expect(textCell(42)).toBe('42')
  })

  it('memangkas spasi di tepi string', () => {
    expect(textCell('  hi  ')).toBe('hi')
  })
})

describe('normalizeIemonLabel (black-box stabil)', () => {
  it('merapatkan spasi berlebih dan trim', () => {
    expect(normalizeIemonLabel('  Pembangunan   Jalan   ')).toBe('Pembangunan Jalan')
  })

  it('mengembalikan string kosong untuk input kosong', () => {
    expect(normalizeIemonLabel('   ')).toBe('')
  })

  it('mengganti non-breaking space dan bullet menjadi spasi tunggal', () => {
    expect(normalizeIemonLabel('Paket\u00a0A\u00a0B')).toBe('Paket A B')
  })
})

describe('normalizeCodeSegment', () => {
  it('menghapus spasi lalu uppercase', () => {
    expect(normalizeCodeSegment('  ab cd ')).toBe('ABCD')
  })

  it('mengembalikan string kosong untuk null', () => {
    expect(normalizeCodeSegment(null)).toBe('')
  })
})

describe('joinCodeSegments', () => {
  it('mengabaikan segmen kosong/null dan menggabung dengan titik', () => {
    expect(joinCodeSegments('01', '', '02', null, '03')).toBe('01.02.03')
  })

  it('meng-uppercase tiap segmen', () => {
    expect(joinCodeSegments('a', 'b')).toBe('A.B')
  })
})

describe('toNumber', () => {
  it('memparse format ID (ribuan titik, desimal koma)', () => {
    expect(toNumber('1.234.567,89')).toBeCloseTo(1234567.89, 2)
  })

  it('memparse angka dengan titik desimal saja', () => {
    expect(toNumber('1234.56')).toBeCloseTo(1234.56, 2)
  })

  it('mengembalikan 0 untuk string kosong', () => {
    expect(toNumber('')).toBe(0)
  })

  it('mengembalikan 0 untuk null', () => {
    expect(toNumber(null)).toBe(0)
  })

  it('mengembalikan 0 untuk teks non-angka', () => {
    expect(toNumber('abc')).toBe(0)
  })

  it('meneruskan number apa adanya', () => {
    expect(toNumber(12)).toBe(12)
  })

  it('membuang karakter non-digit seperti persen', () => {
    expect(toNumber('50%')).toBe(50)
  })
})

describe('toPercent', () => {
  it('nilai <= 1 dikali 100', () => {
    expect(toPercent(0.85)).toBeCloseTo(85, 2)
  })

  it('nilai > 1 dibiarkan apa adanya (dibulatkan 2 desimal)', () => {
    expect(toPercent(75.5)).toBeCloseTo(75.5, 2)
  })

  it('string angka > 1 diperlakukan sebagai persen langsung', () => {
    expect(toPercent('12')).toBeCloseTo(12, 2)
  })
})

describe('toDateIso', () => {
  it('mengembalikan null untuk string kosong', () => {
    expect(toDateIso('')).toBeNull()
  })

  it('mengembalikan null untuk null', () => {
    expect(toDateIso(null)).toBeNull()
  })

  it('memparse string tanggal valid menjadi ISO', () => {
    const result = toDateIso('2026-01-15')
    expect(result).toContain('2026-01-15')
  })

  it('memparse Date object valid menjadi ISO', () => {
    const date = new Date('2026-01-15T00:00:00.000Z')
    expect(toDateIso(date)).toBe('2026-01-15T00:00:00.000Z')
  })

  it('mengembalikan null untuk teks bukan tanggal', () => {
    expect(toDateIso('bukan tanggal')).toBeNull()
  })
})
