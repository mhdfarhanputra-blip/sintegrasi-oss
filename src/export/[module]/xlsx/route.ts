import { NextResponse } from 'next/server'
import { requireModuleAccess } from '@/lib/apiAuth'
import { internalApiError, mapSupabaseError } from '@/lib/apiError'
import { checkRateLimit } from '@/lib/rateLimit'
import { buatLaporanExcel, namaBerkasLaporan, type KolomLaporan } from '@/lib/excelLaporan'
import type { ModuleKey } from '@/lib/access'
import { MODUL_BERVERIFIKASI as MODUL_VERIFIKASI } from '@/lib/verifikasi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/export/[module]/xlsx — laporan Excel BERFORMAT.
 *
 * Berbeda dari /api/export/[module] yang menghasilkan CSV mentah, endpoint ini
 * menyusun berkas siap serah: kop laporan, kepala tabel berwarna, garis, format
 * rupiah, baris total, filter otomatis, dan area cetak A4 melintang.
 *
 * Modul yang didukung: bmn, keuangan, persediaan, dipa, sk, jadwal.
 */

type BarisData = Record<string, unknown>

type Definisi = {
  tabel: string
  judul: string
  urut: { kolom: string; naik?: boolean }
  filterTahun?: { kolom: string; tipe: 'number' | 'date' }
  kolom: KolomLaporan<BarisData>[]
}

const angka = (v: unknown): number => {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const teks = (v: unknown): string => (v == null || v === '' ? '—' : String(v))

const DEFINISI: Partial<Record<ModuleKey, Definisi>> = {
  bmn: {
    tabel: 'bmn',
    judul: 'LAPORAN BARANG MILIK NEGARA',
    urut: { kolom: 'kode_aset', naik: true },
    filterTahun: { kolom: 'tahun_pencatatan', tipe: 'number' },
    kolom: [
      { judul: 'Kode Aset', nilai: (r) => teks(r.kode_aset), lebar: 20 },
      { judul: 'Nama Aset', nilai: (r) => teks(r.nama_aset), lebar: 34 },
      { judul: 'Spesifikasi', nilai: (r) => teks(r.spesifikasi), lebar: 30 },
      { judul: 'Kondisi', nilai: (r) => teks(r.kondisi), tipe: 'status', lebar: 14 },
      { judul: 'Nilai Aset', nilai: (r) => angka(r.nilai_aset), tipe: 'rupiah', lebar: 18, jumlahkan: true },
      { judul: 'Lokasi', nilai: (r) => teks(r.lokasi), lebar: 24 },
      { judul: 'Pengguna', nilai: (r) => teks(r.pengguna), lebar: 22 },
      { judul: 'Status Penggunaan', nilai: (r) => teks(r.status_penggunaan), tipe: 'status', lebar: 18 },
      { judul: 'Tahun Pengadaan', nilai: (r) => angka(r.tahun_pengadaan), tipe: 'angka', lebar: 15 },
      { judul: 'Ada Foto', nilai: (r) => (r.link_foto ? 'Ya' : 'Tidak'), lebar: 11 },
    ],
  },
  keuangan: {
    tabel: 'keuangan',
    judul: 'LAPORAN TRANSAKSI KEUANGAN',
    urut: { kolom: 'tanggal', naik: false },
    filterTahun: { kolom: 'tahun_anggaran', tipe: 'number' },
    kolom: [
      { judul: 'Tanggal', nilai: (r) => r.tanggal as string, tipe: 'tanggal', lebar: 15 },
      { judul: 'Jenis', nilai: (r) => teks(r.jenis_transaksi), tipe: 'status', lebar: 12 },
      { judul: 'Kategori', nilai: (r) => teks(r.kategori), lebar: 22 },
      { judul: 'Keterangan', nilai: (r) => teks(r.keterangan), lebar: 40 },
      { judul: 'Nominal', nilai: (r) => angka(r.nominal), tipe: 'rupiah', lebar: 18, jumlahkan: true },
    ],
  },
  persediaan: {
    tabel: 'persediaan',
    judul: 'LAPORAN PERSEDIAAN',
    urut: { kolom: 'tanggal', naik: false },
    filterTahun: { kolom: 'tahun_anggaran', tipe: 'number' },
    kolom: [
      { judul: 'Tanggal', nilai: (r) => r.tanggal as string, tipe: 'tanggal', lebar: 15 },
      { judul: 'Jenis', nilai: (r) => teks(r.jenis), tipe: 'status', lebar: 12 },
      { judul: 'Nama Barang', nilai: (r) => teks(r.nama_barang), lebar: 30 },
      { judul: 'Jumlah', nilai: (r) => angka(r.jumlah), tipe: 'angka', lebar: 12, jumlahkan: true },
      { judul: 'Satuan', nilai: (r) => teks(r.satuan), lebar: 10 },
      { judul: 'Stok Saldo', nilai: (r) => angka(r.stok_saldo), tipe: 'angka', lebar: 13 },
      { judul: 'Supplier / Tujuan', nilai: (r) => teks(r.supplier_tujuan), lebar: 28 },
    ],
  },
  dipa: {
    tabel: 'dokumen_dipa',
    judul: 'LAPORAN DOKUMEN DIPA & RKAKL',
    urut: { kolom: 'revisi_ke', naik: false },
    filterTahun: { kolom: 'tahun_anggaran', tipe: 'number' },
    kolom: [
      { judul: 'Revisi Ke', nilai: (r) => angka(r.revisi_ke), tipe: 'angka', lebar: 10 },
      { judul: 'Tanggal Revisi', nilai: (r) => r.tanggal_revisi as string, tipe: 'tanggal', lebar: 15 },
      { judul: 'Keterangan', nilai: (r) => teks(r.keterangan_revisi), lebar: 40 },
      { judul: 'Link DIPA', nilai: (r) => teks(r.link_dipa), lebar: 46 },
      { judul: 'Link RKAKL', nilai: (r) => teks(r.link_rkakl), lebar: 46 },
      { judul: 'Tahun Anggaran', nilai: (r) => angka(r.tahun_anggaran), tipe: 'angka', lebar: 14 },
    ],
  },
  sk: {
    tabel: 'dokumen_sk',
    judul: 'LAPORAN SURAT KEPUTUSAN',
    urut: { kolom: 'tanggal_terbit', naik: false },
    filterTahun: { kolom: 'tahun_berlaku', tipe: 'number' },
    kolom: [
      { judul: 'Nomor SK', nilai: (r) => teks(r.nomor_sk), lebar: 22 },
      { judul: 'Judul', nilai: (r) => teks(r.judul), lebar: 42 },
      { judul: 'Kategori', nilai: (r) => teks(r.kategori), lebar: 16 },
      { judul: 'Unit Pemilik', nilai: (r) => teks(r.unit_pemilik), lebar: 22 },
      { judul: 'Tanggal Terbit', nilai: (r) => r.tanggal_terbit as string, tipe: 'tanggal', lebar: 15 },
      { judul: 'Versi', nilai: (r) => angka(r.versi), tipe: 'angka', lebar: 9 },
      { judul: 'Tahun Berlaku', nilai: (r) => angka(r.tahun_berlaku), tipe: 'angka', lebar: 14 },
    ],
  },
  jadwal: {
    tabel: 'jadwal_kegiatan',
    judul: 'LAPORAN AGENDA KEGIATAN',
    urut: { kolom: 'mulai', naik: false },
    kolom: [
      { judul: 'Mulai', nilai: (r) => r.mulai as string, tipe: 'tanggal', lebar: 15 },
      { judul: 'Selesai', nilai: (r) => r.selesai as string, tipe: 'tanggal', lebar: 15 },
      { judul: 'Judul Kegiatan', nilai: (r) => teks(r.judul), lebar: 38 },
      { judul: 'Jenis', nilai: (r) => teks(r.jenis), tipe: 'status', lebar: 14 },
      { judul: 'Lokasi', nilai: (r) => teks(r.lokasi), lebar: 24 },
      { judul: 'Penyelenggara', nilai: (r) => teks(r.penyelenggara), lebar: 24 },
      { judul: 'Peserta', nilai: (r) => teks(r.peserta), lebar: 24 },
      { judul: 'Status', nilai: (r) => teks(r.status), tipe: 'status', lebar: 14 },
    ],
  },
}

export async function GET(request: Request, { params }: { params: Promise<{ module: string }> }) {
  try {
    const { module } = await params
    const key = module.toLowerCase() as ModuleKey
    const def = DEFINISI[key]
    if (!def) {
      return NextResponse.json({ error: 'Modul ini belum memiliki laporan Excel.' }, { status: 400 })
    }

    const auth = await requireModuleAccess(key)
    if ('response' in auth) return auth.response

    if (!checkRateLimit(`export-xlsx:${auth.me.id}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Terlalu banyak ekspor, coba lagi sebentar.' }, { status: 429 })
    }

    const url = new URL(request.url)
    const tahun = url.searchParams.get('tahun')

    let query = auth.supabase.from(def.tabel).select('*').order(def.urut.kolom, { ascending: def.urut.naik ?? true }).limit(10000)
    if (tahun && def.filterTahun) query = query.eq(def.filterTahun.kolom, Number(tahun))

    // Hanya data yang sudah disetujui Admin yang masuk laporan. Admin sendiri
    // melihat semua status agar dapat memeriksa pekerjaan yang belum disetujui.
    if (auth.me.role !== 'Admin' && (MODUL_VERIFIKASI as readonly string[]).includes(key)) {
      query = query.eq('status_verifikasi', 'disetujui')
    }

    const { data, error } = await query
    if (error) {
      const mapped = mapSupabaseError(`export xlsx ${key}`, error)
      if (mapped) return mapped
      return internalApiError(`export xlsx ${key}`, error)
    }

    const baris = (data ?? []) as BarisData[]
    if (baris.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data untuk diekspor pada filter ini.' }, { status: 404 })
    }

    const buffer = await buatLaporanExcel<BarisData>({
      modul: key,
      judul: def.judul,
      periode: tahun ? `Tahun ${tahun}` : 'Seluruh data',
      kolom: def.kolom,
      baris,
    })

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${namaBerkasLaporan(key)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return internalApiError('export xlsx GET', err)
  }
}
