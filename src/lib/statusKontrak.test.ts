import { describe, expect, it } from 'vitest'
import {
  FISIK_SELESAI,
  bacaTanggal,
  fisikSelesai,
  hitungStatusKontrak,
  TAMPILAN_STATUS_KONTRAK,
} from '@/lib/statusKontrak'

/**
 * Status kontrak mengikuti TANGGAL PHO, bukan progres fisik.
 *
 * RIWAYAT ATURAN
 *   Semula progres fisik 100% otomatis dianggap selesai. Aturan itu DIBATALKAN
 *   atas permintaan pengguna karena terasa terlalu dini (pekerjaan bisa tercatat
 *   100% secara administratif sementara PHO belum diterbitkan). Pengujian di
 *   bawah menjaga agar aturan itu tidak kembali tanpa sengaja.
 *
 * YANG TETAP DIPERTAHANKAN:
 *   - PHO sudah lewat berarti Selesai (SIPP tidak memperbarui statusnya sendiri).
 *   - Keterangan jadwal tidak memakai kalimat "lewat N hari" / angka minus.
 *
 * Acuan waktu diinjeksi eksplisit agar pengujian tidak berubah seiring waktu.
 */
const HARI_INI = new Date(2026, 9, 23) // 23 Oktober 2026

describe('fisikSelesai (helper, tidak lagi menentukan status)', () => {
  it('100 atau lebih dianggap tuntas', () => {
    expect(fisikSelesai(100)).toBe(true)
    expect(fisikSelesai(100.5)).toBe(true)
  })

  it('kurang dari 100 belum tuntas', () => {
    expect(fisikSelesai(99.99)).toBe(false)
    expect(fisikSelesai(null)).toBe(false)
    expect(fisikSelesai(undefined)).toBe(false)
  })

  it('batas 100', () => {
    expect(FISIK_SELESAI).toBe(100)
  })
})

describe('bacaTanggal', () => {
  it('membaca format SIPP DD-MM-YYYY', () => {
    const t = bacaTanggal('24-07-2026')
    expect(t?.getFullYear()).toBe(2026)
    expect(t?.getMonth()).toBe(6)
    expect(t?.getDate()).toBe(24)
  })

  it('membaca DD/MM/YYYY dan ISO', () => {
    expect(bacaTanggal('01/12/2026')?.getMonth()).toBe(11)
    expect(bacaTanggal('2026-10-23')?.getDate()).toBe(23)
  })

  it('null untuk nilai kosong', () => {
    expect(bacaTanggal(null)).toBeNull()
    expect(bacaTanggal('-')).toBeNull()
    expect(bacaTanggal('entah')).toBeNull()
  })
})

describe('fisik 100% TIDAK lagi membuat status selesai', () => {
  it('fisik 100% tapi PHO masih jauh -> tetap berjalan', () => {
    const h = hitungStatusKontrak('01-01-2026', '31-12-2026', 'Terkontrak', HARI_INI, 100)
    expect(h.status).toBe('berjalan')
    expect(h.karenaFisik).toBe(false)
    expect(h.teksSisa).toBe('69 hari lagi')
  })

  it('fisik 100% tanpa tanggal -> tetap mengikuti status mentah', () => {
    const h = hitungStatusKontrak('-', '-', 'Terkontrak', HARI_INI, 100)
    expect(h.status).toBe('berjalan')
    expect(h.karenaFisik).toBe(false)
  })

  it('fisik 100% tetapi PHO sudah lewat -> selesai karena TANGGAL', () => {
    const h = hitungStatusKontrak('01-01-2026', '24-07-2026', 'Terkontrak', HARI_INI, 100)
    expect(h.status).toBe('selesai')
    // Alasan selesai adalah tanggal PHO, bukan fisik.
    expect(h.karenaFisik).toBe(false)
    expect(h.teksSisa).toBe('Selesai (PHO)')
  })
})

describe('status dari tanggal PHO', () => {
  it('PHO sudah lewat -> selesai walau fisik rendah', () => {
    const h = hitungStatusKontrak('26-01-2026', '24-07-2026', 'Terkontrak', HARI_INI, 60)
    expect(h.status).toBe('selesai')
    expect(h.teksSisa).toBe('Selesai (PHO)')
  })

  it('PHO hari ini -> akan-pho, teks "PHO hari ini"', () => {
    const h = hitungStatusKontrak('01-01-2026', '23-10-2026', 'Terkontrak', HARI_INI, 84)
    expect(h.status).toBe('akan-pho')
    expect(h.teksSisa).toBe('PHO hari ini')
  })

  it('PHO 30 hari lagi -> akan-pho', () => {
    const h = hitungStatusKontrak('01-01-2026', '22-11-2026', 'Terkontrak', HARI_INI, 94)
    expect(h.status).toBe('akan-pho')
    expect(h.teksSisa).toBe('30 hari lagi')
  })

  it('PHO 31 hari lagi -> berjalan', () => {
    const h = hitungStatusKontrak('01-01-2026', '23-11-2026', 'Terkontrak', HARI_INI, 70)
    expect(h.status).toBe('berjalan')
    expect(h.teksSisa).toBe('31 hari lagi')
  })
})

describe('keterangan bersih dari "lewat" dan angka minus', () => {
  const kasus = [
    hitungStatusKontrak('26-01-2026', '24-07-2026', 'Terkontrak', HARI_INI, 60),
    hitungStatusKontrak('01-01-2026', '17-06-2026', 'Terkontrak', HARI_INI, 50),
    hitungStatusKontrak('01-01-2026', '31-12-2026', 'Terkontrak', HARI_INI, 100),
    hitungStatusKontrak('01-01-2026', '22-11-2026', 'Terkontrak', HARI_INI, 90),
    hitungStatusKontrak('-', '-', 'Belum Terkontrak', HARI_INI, 0),
  ]

  it('tidak pernah memakai kata "lewat"', () => {
    for (const h of kasus) {
      expect(h.teksSisa.toLowerCase()).not.toContain('lewat')
    }
  })

  it('tidak pernah memuat tanda minus', () => {
    for (const h of kasus) {
      expect(h.teksSisa).not.toContain('-')
    }
  })
})

describe('tanpa tanggal PHO', () => {
  it('"Belum Terkontrak" -> belum', () => {
    expect(hitungStatusKontrak('-', '-', 'Belum Terkontrak', HARI_INI, 0).status).toBe('belum')
  })

  it('"Belum Terkontrak" menang walau SPMK terisi', () => {
    expect(hitungStatusKontrak('01-02-2026', '-', 'Belum Terkontrak', HARI_INI, 100).status).toBe('belum')
  })

  it('ada SPMK tanpa PHO -> berjalan', () => {
    expect(hitungStatusKontrak('01-02-2026', '-', 'Terkontrak', HARI_INI, 40).status).toBe('berjalan')
  })

  it('sisa hari tidak diketahui -> teks "—"', () => {
    expect(hitungStatusKontrak('-', '-', 'Belum Terkontrak', HARI_INI, 0).teksSisa).toBe('—')
  })
})

describe('tampilan status', () => {
  it('setiap status punya label, warna, dan keterangan', () => {
    for (const k of ['belum', 'berjalan', 'akan-pho', 'selesai'] as const) {
      const t = TAMPILAN_STATUS_KONTRAK[k]
      expect(t.label.length).toBeGreaterThan(3)
      expect(t.tone).toContain('bg-')
      expect(t.keterangan.length).toBeGreaterThan(10)
    }
  })

  it('keterangan status selesai menyebut PHO', () => {
    expect(TAMPILAN_STATUS_KONTRAK.selesai.label).toContain('PHO')
  })
})
