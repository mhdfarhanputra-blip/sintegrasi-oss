import { NextResponse } from 'next/server'
import { requireModuleAccess } from '@/lib/apiAuth'
import { internalApiError } from '@/lib/apiError'
import { checkRateLimit } from '@/lib/rateLimit'
import { buatLaporanExcel, namaBerkasLaporan, type KolomLaporan } from '@/lib/excelLaporan'
import { getSippDataset } from '@/lib/sippStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/export/sipp/xlsx — laporan Excel BERFORMAT untuk paket kontraktual SIPP.
 *
 * Berbeda dari modul lain yang membaca tabel Supabase, data SIPP berasal dari
 * JSON hasil scraping di Storage. Karena itu endpoint ini menyusun laporan
 * langsung dari dataset, bukan dari query tabel.
 *
 * Menghormati penyaring halaman (satker, status, q) sehingga berkas yang diunduh
 * sama dengan yang terlihat di layar.
 *
 * Kepala laporan (kop, logo organisasi (opsional), format rupiah, baris total, area
 * cetak A4 melintang) ditangani `buatLaporanExcel` yang sama dengan modul lain.
 */

type BarisData = Record<string, unknown>

const teks = (v: unknown): string => (v == null || v === '' ? '—' : String(v))
const angka = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const KOLOM: KolomLaporan<BarisData>[] = [
  { judul: 'Kode Paket', nilai: (r) => teks(r.kodePaket), lebar: 24 },
  { judul: 'Nama Paket', nilai: (r) => teks(r.nama), lebar: 40 },
  { judul: 'Kode Satker', nilai: (r) => teks(r.kodeSatker), lebar: 12 },
  { judul: 'Satuan Kerja', nilai: (r) => teks(r.satker), lebar: 30 },
  { judul: 'Kategori', nilai: (r) => teks(r.kategori), lebar: 16 },
  { judul: 'Jenis Kontrak', nilai: (r) => teks(r.jenisKontrak), lebar: 15 },
  { judul: 'Status', nilai: (r) => teks(r.status), tipe: 'status', lebar: 14 },
  { judul: 'Pagu DIPA', nilai: (r) => angka(r.paguDipa), tipe: 'rupiah', lebar: 18, jumlahkan: true },
  { judul: 'Pagu Pengadaan', nilai: (r) => angka(r.paguPengadaan), tipe: 'rupiah', lebar: 18, jumlahkan: true },
  { judul: 'Nilai Kontrak', nilai: (r) => angka(r.nilaiKontrak), tipe: 'rupiah', lebar: 18, jumlahkan: true },
  { judul: 'Realisasi', nilai: (r) => angka(r.realisasi), tipe: 'rupiah', lebar: 18, jumlahkan: true },
  { judul: 'Fisik (%)', nilai: (r) => angka(r.fisPersen), tipe: 'angka', lebar: 11 },
  { judul: 'Keuangan (%)', nilai: (r) => angka(r.keuPersen), tipe: 'angka', lebar: 13 },
  { judul: 'Penyedia / Rekanan', nilai: (r) => teks(r.penyedia), lebar: 30 },
  { judul: 'No. Kontrak', nilai: (r) => teks(r.noKontrak), lebar: 24 },
  { judul: 'Metode Pemilihan', nilai: (r) => teks(r.metode), lebar: 20 },
  { judul: 'Tgl SPMK', nilai: (r) => teks(r.tglSpmk), lebar: 13 },
  { judul: 'Tgl PHO', nilai: (r) => teks(r.tglPho), lebar: 13 },
  { judul: 'Sisa Waktu', nilai: (r) => teks(r.sisaWaktu), lebar: 13 },
  { judul: 'Sumber Dana', nilai: (r) => teks(r.sumberDana), lebar: 20 },
]

export async function GET(request: Request) {
  try {
    const auth = await requireModuleAccess('sipp')
    if ('response' in auth) return auth.response

    if (!checkRateLimit(`export-sipp-xlsx:${auth.me.id}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Terlalu banyak ekspor, coba lagi sebentar.' }, { status: 429 })
    }

    const { data, source } = await getSippDataset()
    if (source === 'empty' || data.paket.length === 0) {
      return NextResponse.json(
        { error: 'Data SIPP belum tersedia untuk diekspor.' },
        { status: 404 },
      )
    }

    const url = new URL(request.url)
    const satker = url.searchParams.get('satker')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? ''

    let baris: BarisData[] = data.paket as unknown as BarisData[]
    if (satker) baris = baris.filter((r) => String(r.kodeSatker) === satker)
    if (status) baris = baris.filter((r) => String(r.status).toLowerCase() === status.toLowerCase())
    if (q) {
      baris = baris.filter((r) => {
        const gabung = `${r.nama ?? ''} ${r.kodePaket ?? ''} ${r.penyedia ?? ''}`.toLowerCase()
        return gabung.includes(q)
      })
    }

    if (baris.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data untuk diekspor pada filter ini.' },
        { status: 404 },
      )
    }

    const keteranganFilter = [
      satker ? `Satker ${satker}` : '',
      status ? `Status ${status}` : '',
      q ? `Kata kunci "${q}"` : '',
    ]
      .filter(Boolean)
      .join(' · ')

    const periode = [
      `Tahun ${data.tahun}`,
      keteranganFilter || 'Seluruh paket',
      data.dibuatPada
        ? `Data SIPP per ${new Date(data.dibuatPada).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ')

    const buffer = await buatLaporanExcel<BarisData>({
      modul: 'sipp',
      judul: 'LAPORAN PAKET KONTRAKTUAL SIPP',
      periode,
      kolom: KOLOM,
      baris,
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${namaBerkasLaporan('sipp')}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return internalApiError('export sipp xlsx GET', err)
  }
}
