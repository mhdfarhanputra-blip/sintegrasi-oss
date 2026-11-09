import { describe, expect, it } from 'vitest'
import {
  CATATAN_MAKS,
  KONDISI_SAH,
  kondisiSah,
  kunciPeriode,
  labelPeriode,
  memburuk,
  periodeSah,
  periodeSekarang,
  persenProgres,
  rapikanCatatan,
  rekapKondisi,
  validasiPemeriksaan,
} from '@/lib/pemeriksaan'

/**
 * Aturan pemeriksaan semester BMN.
 *
 * Yang dijaga:
 *   1. Semester ditentukan dari kalender (Jan–Jun = I, Jul–Des = II).
 *   2. Hanya kondisi yang dikenal yang boleh disimpan.
 *   3. Progres tidak pernah negatif atau melebihi 100%.
 *   4. Perubahan kondisi yang memburuk dapat dikenali (untuk disorot).
 */

describe('periode semester', () => {
  it('Januari–Juni adalah semester I', () => {
    expect(periodeSekarang(new Date(2026, 0, 15)).semester).toBe(1) // Jan
    expect(periodeSekarang(new Date(2026, 5, 30)).semester).toBe(1) // Jun
  })

  it('Juli–Desember adalah semester II', () => {
    expect(periodeSekarang(new Date(2026, 6, 1)).semester).toBe(2) // Jul
    expect(periodeSekarang(new Date(2026, 11, 31)).semester).toBe(2) // Des
  })

  it('tahun mengikuti tanggal', () => {
    expect(periodeSekarang(new Date(2026, 9, 23)).tahun).toBe(2026)
  })

  it('label tampil dengan angka Romawi', () => {
    expect(labelPeriode({ semester: 1, tahun: 2026 })).toBe('Semester I — 2026')
    expect(labelPeriode({ semester: 2, tahun: 2026 })).toBe('Semester II — 2026')
  })

  it('kunci periode unik', () => {
    expect(kunciPeriode({ semester: 1, tahun: 2026 })).toBe('2026-S1')
    expect(kunciPeriode({ semester: 2, tahun: 2026 })).toBe('2026-S2')
  })
})

describe('periodeSah', () => {
  it('menerima semester 1 dan 2', () => {
    expect(periodeSah(1, 2026)).toEqual({ semester: 1, tahun: 2026 })
    expect(periodeSah('2', '2026')).toEqual({ semester: 2, tahun: 2026 })
  })

  it('menolak semester di luar 1–2', () => {
    expect(periodeSah(0, 2026)).toBeNull()
    expect(periodeSah(3, 2026)).toBeNull()
  })

  it('menolak tahun tidak masuk akal', () => {
    expect(periodeSah(1, 1999)).toBeNull()
    expect(periodeSah(1, 2101)).toBeNull()
    expect(periodeSah(1, 'dua ribu')).toBeNull()
  })
})

describe('kondisi', () => {
  it('tiga kondisi dikenal', () => {
    expect([...KONDISI_SAH]).toEqual(['Baik', 'Rusak Ringan', 'Rusak Berat'])
  })

  it('kondisiSah memeriksa nilai dengan tepat', () => {
    expect(kondisiSah('Baik')).toBe(true)
    expect(kondisiSah('Rusak Ringan')).toBe(true)
    expect(kondisiSah('baik')).toBe(false) // beda huruf besar/kecil ditolak
    expect(kondisiSah('Rusak')).toBe(false)
    expect(kondisiSah(null)).toBe(false)
  })

  it('mengenali kondisi yang memburuk', () => {
    expect(memburuk('Baik', 'Rusak Ringan')).toBe(true)
    expect(memburuk('Baik', 'Rusak Berat')).toBe(true)
    expect(memburuk('Rusak Ringan', 'Rusak Berat')).toBe(true)
  })

  it('perbaikan atau tetap bukan kemunduran', () => {
    expect(memburuk('Rusak Berat', 'Baik')).toBe(false)
    expect(memburuk('Baik', 'Baik')).toBe(false)
    expect(memburuk(null, 'Baik')).toBe(false)
  })
})

describe('progres', () => {
  it('menghitung persentase satu desimal', () => {
    expect(persenProgres(0, 320)).toBe(0)
    expect(persenProgres(160, 320)).toBe(50)
    expect(persenProgres(5, 320)).toBe(1.6)
    expect(persenProgres(320, 320)).toBe(100)
  })

  it('tidak pernah negatif atau melebihi 100', () => {
    expect(persenProgres(-5, 320)).toBe(0)
    expect(persenProgres(400, 320)).toBe(100)
  })

  it('total nol atau tidak sah menghasilkan 0', () => {
    expect(persenProgres(5, 0)).toBe(0)
    expect(persenProgres(5, Number.NaN)).toBe(0)
  })
})

describe('rekap kondisi', () => {
  it('menghitung jumlah per kondisi', () => {
    const r = rekapKondisi([
      { kondisi_baru: 'Baik' },
      { kondisi_baru: 'Baik' },
      { kondisi_baru: 'Rusak Ringan' },
      { kondisi_baru: 'Rusak Berat' },
    ])
    expect(r).toEqual({ baik: 2, rusakRingan: 1, rusakBerat: 1, total: 4 })
  })

  it('daftar kosong menghasilkan nol', () => {
    expect(rekapKondisi([])).toEqual({ baik: 0, rusakRingan: 0, rusakBerat: 0, total: 0 })
  })
})

describe('catatan', () => {
  it('kosong menjadi null', () => {
    expect(rapikanCatatan('')).toBeNull()
    expect(rapikanCatatan('   ')).toBeNull()
    expect(rapikanCatatan(null)).toBeNull()
  })

  it('dipangkas dan dibatasi panjangnya', () => {
    expect(rapikanCatatan('  catatan  ')).toBe('catatan')
    expect(rapikanCatatan('x'.repeat(900))).toHaveLength(CATATAN_MAKS)
  })
})

describe('validasi pemeriksaan', () => {
  it('lolos bila lengkap', () => {
    expect(
      validasiPemeriksaan({ bmnId: 'abc', kondisiBaru: 'Baik', semester: 1, tahun: 2026 }),
    ).toBeNull()
  })

  it('menolak aset kosong', () => {
    expect(validasiPemeriksaan({ bmnId: '', kondisiBaru: 'Baik', semester: 1, tahun: 2026 })).toContain(
      'Aset',
    )
  })

  it('menolak kondisi tak dikenal', () => {
    expect(
      validasiPemeriksaan({ bmnId: 'abc', kondisiBaru: 'Bagus', semester: 1, tahun: 2026 }),
    ).toContain('Kondisi')
  })

  it('menolak periode tak sah', () => {
    expect(
      validasiPemeriksaan({ bmnId: 'abc', kondisiBaru: 'Baik', semester: 5, tahun: 2026 }),
    ).toContain('Semester')
  })
})
