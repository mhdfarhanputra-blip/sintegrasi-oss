import { describe, it, expect } from 'vitest'
import { ekstrakItemDipa } from './dipaParser'

/**
 * Uji dengan contoh dokumen DIPA yang menyerupai hasil salin-tempel nyata
 * (judul, baris kolom, kode akun 6 digit, kode MAK bertitik, dan berbagai
 * format angka).
 */
const CONTOH = `KERTAS KERJA TAHUN ANGGARAN 2026
SATKER PELAKSANAAN JALAN NASIONAL WILAYAH I
Kode Akun | Uraian | Pagu
521211 Belanja Bahan 1.500.000
524111 Belanja Perjalanan Dinas Biasa 7.250.000
5.2.02.01.01.0001 Belanja Jasa Kantor 12.000.000
521213 Belanja Honor Output Kegiatan 4,800,000
521811 Belanja Barang Persediaan 900.000`

describe('ekstrakItemDipa pada dokumen contoh', () => {
  const hasil = ekstrakItemDipa(CONTOH)

  it('menemukan seluruh mata anggaran dan melewati judul/kolom', () => {
    expect(hasil).toHaveLength(5)
  })

  it('mempertahankan urutan kemunculan', () => {
    expect(hasil.map((h) => h.kode_mak)).toEqual([
      '521211',
      '524111',
      '5.2.02.01.01.0001',
      '521213',
      '521811',
    ])
  })

  it('membaca pagu dengan benar pada format titik dan koma', () => {
    expect(hasil.map((h) => h.pagu)).toEqual([
      1_500_000,
      7_250_000,
      12_000_000,
      4_800_000,
      900_000,
    ])
  })

  it('total pagu sesuai penjumlahan manual', () => {
    const total = hasil.reduce((a, b) => a + b.pagu, 0)
    expect(total).toBe(26_450_000)
  })

  it('uraian tidak memuat kode akun maupun angka pagu', () => {
    expect(hasil[0].uraian).toBe('Belanja Bahan')
    expect(hasil[2].uraian).toBe('Belanja Jasa Kantor')
    for (const h of hasil) {
      expect(h.uraian ?? '').not.toContain(h.kode_mak)
      expect(h.uraian ?? '').not.toMatch(/\d{1,3}(\.\d{3})+/)
    }
  })

  it('stabil bila dijalankan dua kali (deterministik)', () => {
    expect(ekstrakItemDipa(CONTOH)).toEqual(hasil)
  })
})
