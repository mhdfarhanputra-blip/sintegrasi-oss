import { describe, it, expect } from 'vitest'
import { ekstrakItemDipa, uraiAngkaRupiah } from './dipaParser'

/**
 * Parser DIPA deterministik (tanpa AI).
 *
 * Latar belakang: endpoint /api/dipa/parse sebelumnya mengirim dokumen anggaran
 * ke DeepSeek lalu meminta JSON kembali. Test ini mengunci perilaku parser
 * pengganti yang murni aturan, sehingga hasilnya dapat diulang dan diaudit.
 */

describe('uraiAngkaRupiah', () => {
  it('mengenali pemisah ribuan titik', () => {
    expect(uraiAngkaRupiah('1.500.000')).toBe(1_500_000)
  })

  it('mengenali pemisah ribuan koma', () => {
    expect(uraiAngkaRupiah('1,500,000')).toBe(1_500_000)
  })

  it('mengenali angka tanpa pemisah', () => {
    expect(uraiAngkaRupiah('750000')).toBe(750_000)
  })

  it('mengenali pemisah spasi', () => {
    expect(uraiAngkaRupiah('1 500 000')).toBe(1_500_000)
  })

  it('membuang bagian desimal ,00', () => {
    expect(uraiAngkaRupiah('1.500.000,00')).toBe(1_500_000)
  })

  it('membuang bagian desimal .00', () => {
    expect(uraiAngkaRupiah('1,234,567.00')).toBe(1_234_567)
  })

  it('tetap membaca ribuan yang hanya punya satu titik', () => {
    // '1.500' adalah seribu lima ratus, bukan 1,5
    expect(uraiAngkaRupiah('1.500')).toBe(1500)
  })

  it('mengembalikan null untuk teks bukan angka', () => {
    expect(uraiAngkaRupiah('abc')).toBeNull()
    expect(uraiAngkaRupiah('')).toBeNull()
  })
})

describe('ekstrakItemDipa', () => {
  it('mengekstrak kode akun 6 digit + uraian + pagu', () => {
    const teks = `521211 Belanja Bahan 1.500.000
524111 Belanja Perjalanan Dinas Biasa 7.250.000`
    const hasil = ekstrakItemDipa(teks)
    expect(hasil).toHaveLength(2)
    expect(hasil[0]).toEqual({
      kode_mak: '521211',
      uraian: 'Belanja Bahan',
      pagu: 1_500_000,
    })
    expect(hasil[1].kode_mak).toBe('524111')
    expect(hasil[1].pagu).toBe(7_250_000)
  })

  it('mengekstrak kode MAK bergaya DIPA bertitik', () => {
    const teks = '5.2.02.01.01.0001 Belanja Bahan Kantor 12.000.000'
    const hasil = ekstrakItemDipa(teks)
    expect(hasil).toHaveLength(1)
    expect(hasil[0].kode_mak).toBe('5.2.02.01.01.0001')
    expect(hasil[0].pagu).toBe(12_000_000)
  })

  it('mengabaikan baris judul/kolom yang tidak memuat kode akun', () => {
    const teks = `KERTAS KERJA TAHUN ANGGARAN 2026
Kode Akun | Uraian | Pagu
521211 Belanja Bahan 1.500.000`
    const hasil = ekstrakItemDipa(teks)
    expect(hasil).toHaveLength(1)
    expect(hasil[0].kode_mak).toBe('521211')
  })

  it('TIDAK salah menganggap tahun atau nomor urut sebagai kode akun', () => {
    // Baris 2026 tanpa awalan 5 bukan kode belanja.
    const teks = '2026 Total Anggaran 99.000.000'
    expect(ekstrakItemDipa(teks)).toHaveLength(0)
  })

  it('memakai angka TERAKHIR pada baris sebagai pagu', () => {
    // Kolom: kode, volume, satuan, harga, jumlah
    const teks = '521211 Belanja Bahan 12 5.000 60.000'
    const hasil = ekstrakItemDipa(teks)
    expect(hasil[0].pagu).toBe(60_000)
  })

  it('membuang baris duplikat (akibat pemenggalan PDF)', () => {
    const teks = `521211 Belanja Bahan 1.500.000
521211 Belanja Bahan 1.500.000`
    expect(ekstrakItemDipa(teks)).toHaveLength(1)
  })

  it('mengabaikan pagu yang tidak wajar (kurang dari seribu)', () => {
    // '1' kemungkinan nomor urut, bukan nominal.
    expect(ekstrakItemDipa('521211 Belanja Bahan 1')).toHaveLength(0)
  })

  it('mengembalikan daftar kosong untuk masukan kosong', () => {
    expect(ekstrakItemDipa('')).toEqual([])
    expect(ekstrakItemDipa('   ')).toEqual([])
  })

  it('dapat dijalankan berulang dengan hasil yang sama (deterministik)', () => {
    const teks = `521211 Belanja Bahan 1.500.000
524111 Belanja Perjalanan 7.250.000`
    const a = ekstrakItemDipa(teks)
    const b = ekstrakItemDipa(teks)
    expect(a).toEqual(b)
  })

  it('menangani spasi tak terputus (NBSP) dari salin-tempel PDF', () => {
    const teks = '521211\u00a0Belanja Bahan\u00a01.500.000'
    const hasil = ekstrakItemDipa(teks)
    expect(hasil).toHaveLength(1)
    expect(hasil[0].pagu).toBe(1_500_000)
  })
})
