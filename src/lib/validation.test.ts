import { describe, it, expect, vi } from 'vitest'
import {
  cleanText,
  cleanDate,
  cleanYear,
  cleanYearOptional,
  tahunBerjalan,
  cleanInt,
  isValidEmail,
} from './validation'

describe('cleanText', () => {
  it('mengembalikan null untuk nilai non-string', () => {
    expect(cleanText(123)).toBeNull()
    expect(cleanText(null)).toBeNull()
    expect(cleanText(undefined)).toBeNull()
    expect(cleanText({})).toBeNull()
  })

  it('melakukan trim dan merapatkan spasi berturut', () => {
    expect(cleanText('  a   b  ')).toBe('a b')
  })

  it('mengembalikan null untuk string kosong atau hanya spasi', () => {
    expect(cleanText('')).toBeNull()
    expect(cleanText('   ')).toBeNull()
  })

  it('memotong teks ke panjang maksimum', () => {
    expect(cleanText('abcdefghij', 5)).toBe('abcde')
  })
})

describe('cleanDate', () => {
  it('menerima format YYYY-MM-DD valid', () => {
    expect(cleanDate('2026-01-15')).toBe('2026-01-15')
  })

  it('menolak format tanpa nol di depan', () => {
    expect(cleanDate('2026-1-5')).toBeNull()
  })

  it('menolak format DD-MM-YYYY', () => {
    expect(cleanDate('15-01-2026')).toBeNull()
  })

  it('menolak non-string dan string kosong', () => {
    expect(cleanDate(20260115)).toBeNull()
    expect(cleanDate('')).toBeNull()
  })

  // Regresi: sebelumnya hanya format yang diperiksa, sehingga tanggal mustahil
  // lolos ke PostgreSQL dan memicu galat 500 di lapisan database.
  it('menolak tanggal yang formatnya benar tetapi tidak ada di kalender', () => {
    expect(cleanDate('2026-02-31')).toBeNull()
    expect(cleanDate('2026-04-31')).toBeNull()
    expect(cleanDate('2025-13-01')).toBeNull()
    expect(cleanDate('2026-00-10')).toBeNull()
    expect(cleanDate('2026-01-00')).toBeNull()
  })

  it('menerima 29 Februari pada tahun kabisat dan menolak pada tahun biasa', () => {
    expect(cleanDate('2028-02-29')).toBe('2028-02-29')
    expect(cleanDate('2026-02-29')).toBeNull()
  })
})

describe('cleanYear', () => {
  const y = new Date().getFullYear()
  it('mengembalikan tahun valid apa adanya', () => {
    expect(cleanYear(2025)).toBe(2025)
  })

  it('jatuh ke tahun berjalan bila di bawah min', () => {
    expect(cleanYear(1999)).toBe(y)
  })

  it('jatuh ke tahun berjalan bila terlalu jauh ke depan', () => {
    expect(cleanYear(y + 10)).toBe(y)
  })

  it('jatuh ke tahun berjalan untuk non-number', () => {
    expect(cleanYear('abc')).toBe(y)
  })

  it('jatuh ke tahun berjalan untuk nilai pecahan', () => {
    expect(cleanYear(2025.5)).toBe(y)
  })

  it('menghormati opsi min dan maxAhead kustom', () => {
    expect(cleanYear(1995, { min: 1990 })).toBe(1995)
  })

  // Regresi zona waktu: server Vercel (UTC) masih tanggal 31 Desember ketika
  // WIB sudah 1 Januari. `getFullYear()` akan mengembalikan tahun lalu dan
  // transaksi tahun anggaran baru tercatat pada tahun yang salah.
  it('memakai tahun berjalan versi WIB, bukan zona waktu server', () => {
    // 31 Des 2026 17:30 UTC === 1 Jan 2027 00:30 WIB
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T17:30:00.000Z'))
    try {
      expect(tahunBerjalan()).toBe(2027)
      // Input 2027 harus diterima apa adanya, bukan dipaksa ke 2026.
      expect(cleanYear(2027)).toBe(2027)
      expect(cleanYearOptional(2027)).toBe(2027)
      // Di luar jendela maxAhead tetap ditolak.
      expect(cleanYear(2040)).toBe(2027)
    } finally {
      vi.useRealTimers()
    }
  })

  it('tahunBerjalan konsisten satu jam sebelum pergantian tahun WIB', () => {
    vi.useFakeTimers()
    // 31 Des 2026 16:00 UTC === 31 Des 2026 23:00 WIB (masih tahun 2026)
    vi.setSystemTime(new Date('2026-12-31T16:00:00.000Z'))
    try {
      expect(tahunBerjalan()).toBe(2026)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('cleanYearOptional', () => {
  it('mempertahankan null untuk nilai kosong (bukan jatuh ke tahun berjalan)', () => {
    expect(cleanYearOptional(null)).toBeNull()
    expect(cleanYearOptional(undefined)).toBeNull()
    expect(cleanYearOptional('')).toBeNull()
  })

  it('mengembalikan angka bila dalam rentang', () => {
    expect(cleanYearOptional(tahunBerjalan())).toBe(tahunBerjalan())
  })
})

describe('cleanInt', () => {
  it('mem-parse string integer', () => {
    expect(cleanInt('42')).toBe(42)
  })

  it('menerima number integer', () => {
    expect(cleanInt(42)).toBe(42)
  })

  it('mengembalikan null untuk pecahan atau non-numerik', () => {
    expect(cleanInt('3.2')).toBeNull()
    expect(cleanInt('abc')).toBeNull()
  })

  it('memvalidasi rentang min dan max', () => {
    expect(cleanInt(0, { min: 1, max: 10 })).toBeNull()
    expect(cleanInt(5, { min: 1, max: 10 })).toBe(5)
    expect(cleanInt(11, { min: 1, max: 10 })).toBeNull()
  })
})

describe('isValidEmail', () => {
  it('menerima bentuk email yang valid', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
  })

  it('menolak teks tanpa @ dan domain', () => {
    expect(isValidEmail('invalid')).toBe(false)
  })

  it('menolak email tanpa TLD', () => {
    expect(isValidEmail('a@b')).toBe(false)
  })

  it('menolak string kosong dan non-string', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail(123)).toBe(false)
  })
})
