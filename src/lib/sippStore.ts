import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * sippStore.ts — Membaca data SIPP dari Storage.
 *
 * SIPP (sipp.pu.go.id) tidak punya API publik yang stabil, sehingga datanya
 * diambil oleh cron di server lalu diringkas menjadi JSON oleh
 * `sipp_publish.py` dan diunggah ke Storage pada jalur `sipp/data.json`.
 *
 * Berkas ini hanya MEMBACA; penulisan dilakukan cron di luar aplikasi.
 * Disimpan di bucket yang sama dengan modul iEMON ('dokumen') agar tidak
 * menambah bucket baru.
 */

export const SIPP_BUCKET = 'dokumen'
export const SIPP_PATH = 'sipp/data.json'

export type SippPaket = {
  kodeSatker: string
  satker: string
  kodePaket: string
  nama: string
  kategori: string
  jenisKontrak: string
  status: string
  paguDipa: number | null
  paguPengadaan: number | null
  nilaiKontrak: number | null
  penyedia: string
  noKontrak: string
  metode: string
  keuPersen: number | null
  fisPersen: number | null
  realisasi: number | null
  tglSpmk: string
  tglPho: string
  sisaWaktu: string
  sumberDana: string
}

export type SippSatker = {
  kode: string
  nama: string
  jumlahPaket: number
  pagu: number
}

export type SippRingkasan = {
  jumlahPaket: number
  terkontrak: number
  nilaiKontrak: number
  realisasi: number
  rerataFisik: number | null
  rerataKeuangan: number | null
  totalPagu: number
}

export type SippDataset = {
  ok: boolean
  sumber: string
  judul: string
  subjudul: string
  tahun: number
  dibuatPada: string
  dataExcelDiubah: string
  ringkasan: SippRingkasan
  perSatker: SippSatker[]
  paket: SippPaket[]
}

export function emptySippDataset(): SippDataset {
  return {
    ok: false,
    sumber: 'SIPP',
    judul: '',
    subjudul: '',
    tahun: new Date().getFullYear(),
    dibuatPada: '',
    dataExcelDiubah: '',
    ringkasan: {
      jumlahPaket: 0,
      terkontrak: 0,
      nilaiKontrak: 0,
      realisasi: 0,
      rerataFisik: null,
      rerataKeuangan: null,
      totalPagu: 0,
    },
    perSatker: [],
    paket: [],
  }
}

/** Umur data dalam jam, dihitung dari waktu publikasi. null bila tidak diketahui. */
export function umurJam(dibuatPada: string): number | null {
  if (!dibuatPada) return null
  const t = Date.parse(dibuatPada)
  if (Number.isNaN(t)) return null
  return Math.max(0, (Date.now() - t) / 3_600_000)
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function getSippDataset(): Promise<{ data: SippDataset; source: 'storage' | 'empty' }> {
  try {
    const admin = adminClient()
    const { data: berkas, error } = await admin.storage.from(SIPP_BUCKET).download(SIPP_PATH)
    if (error || !berkas) return { data: emptySippDataset(), source: 'empty' }

    const parsed = JSON.parse(await berkas.text()) as Partial<SippDataset>
    const kosong = emptySippDataset()
    return {
      data: {
        ...kosong,
        ...parsed,
        ringkasan: { ...kosong.ringkasan, ...(parsed.ringkasan ?? {}) },
        perSatker: Array.isArray(parsed.perSatker) ? parsed.perSatker : [],
        paket: Array.isArray(parsed.paket) ? parsed.paket : [],
      },
      source: 'storage',
    }
  } catch {
    // Storage belum berisi data SIPP atau kredensial belum diatur: kembalikan
    // dataset kosong agar halaman tetap tampil dengan pesan yang jelas.
    return { data: emptySippDataset(), source: 'empty' }
  }
}
