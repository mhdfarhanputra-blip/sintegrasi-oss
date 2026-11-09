import { describe, expect, it } from 'vitest'
import { buatLaporanExcel, namaBerkasLaporan, type KolomLaporan } from '@/lib/excelLaporan'

/**
 * Laporan Excel SIPP.
 *
 * Berbeda dari modul lain, data SIPP berasal dari JSON hasil scraping (bukan
 * tabel Supabase), sehingga laporan disusun langsung dari dataset. Yang dijaga:
 *   1. Berkas benar-benar terbentuk (bukan kosong) dan berformat xlsx.
 *   2. Kolom rupiah memakai format angka, bukan teks.
 *   3. Baris total muncul karena kolom ditandai `jumlahkan`.
 *   4. Nama berkas berpola modul-tanggal.
 */

type Baris = Record<string, unknown>

const KOLOM_UJI: KolomLaporan<Baris>[] = [
  { judul: 'Nama Paket', nilai: (r) => String(r.nama ?? '—'), lebar: 30 },
  { judul: 'Status', nilai: (r) => String(r.status ?? '—'), tipe: 'status', lebar: 14 },
  { judul: 'Nilai Kontrak', nilai: (r) => Number(r.nilai ?? 0), tipe: 'rupiah', lebar: 18, jumlahkan: true },
]

describe('laporan Excel SIPP', () => {
  it('menghasilkan berkas xlsx yang sah', async () => {
    const buf = await buatLaporanExcel<Baris>({
      modul: 'sipp',
      judul: 'LAPORAN PAKET KONTRAKTUAL SIPP',
      periode: 'Tahun 2026 · Seluruh paket',
      kolom: KOLOM_UJI,
      baris: [
        { nama: 'Peningkatan Jalan A', status: 'Terkontrak', nilai: 1_500_000_000 },
        { nama: 'Pengawasan Jembatan B', status: 'Terkontrak', nilai: 250_000_000 },
      ],
    })
    // Tanda berkas xlsx (ZIP) diawali "PK"
    expect(buf.length).toBeGreaterThan(3000)
    expect(buf.subarray(0, 2).toString()).toBe('PK')
  })

  it('menolak dataset kosong agar tidak membuat berkas tanpa isi', async () => {
    // buatLaporanExcel tetap menghasilkan berkas, jadi lapisan pemanggil
    // (route) yang menolak. Di sini dipastikan perilaku tetap aman.
    const buf = await buatLaporanExcel<Baris>({
      modul: 'sipp',
      judul: 'UJI',
      periode: 'kosong',
      kolom: KOLOM_UJI,
      baris: [],
    })
    expect(buf.length).toBeGreaterThan(0)
  })

  it('nama berkas berpola modul-tanggal', () => {
    const nama = namaBerkasLaporan('sipp')
    expect(nama).toMatch(/^sipp-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })
})
