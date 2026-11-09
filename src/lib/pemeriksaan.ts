/**
 * pemeriksaan.ts — Aturan pemeriksaan semester aset BMN.
 *
 * Setiap semester (I: Jan–Jun, II: Jul–Des) seluruh aset diperiksa kondisinya.
 * Hasil pemeriksaan disimpan sebagai RIWAYAT (tabel bmn_pemeriksaan) sehingga
 * perkembangan kondisi tiap aset dapat ditelusuri, bukan hanya nilai terakhir.
 */

export const KONDISI_SAH = ['Baik', 'Rusak Ringan', 'Rusak Berat'] as const
export type KondisiBmn = (typeof KONDISI_SAH)[number]

export function kondisiSah(nilai: string | null | undefined): nilai is KondisiBmn {
  return typeof nilai === 'string' && (KONDISI_SAH as readonly string[]).includes(nilai)
}

export type Periode = { semester: 1 | 2; tahun: number }

/**
 * Semester yang sedang berjalan menurut kalender.
 * Januari–Juni = semester 1, Juli–Desember = semester 2.
 */
export function periodeSekarang(sekarang: Date = new Date()): Periode {
  const bulan = sekarang.getMonth() + 1 // 1..12
  return {
    semester: bulan <= 6 ? 1 : 2,
    tahun: sekarang.getFullYear(),
  }
}

/** Label siap tampil: "Semester I — 2026". */
export function labelPeriode(p: Periode): string {
  return `Semester ${p.semester === 1 ? 'I' : 'II'} — ${p.tahun}`
}

/** Kunci unik periode, dipakai untuk membandingkan & menyimpan. */
export function kunciPeriode(p: Periode): string {
  return `${p.tahun}-S${p.semester}`
}

export function periodeSah(semester: unknown, tahun: unknown): Periode | null {
  const s = Number(semester)
  const t = Number(tahun)
  if (s !== 1 && s !== 2) return null
  if (!Number.isInteger(t) || t < 2000 || t > 2100) return null
  return { semester: s as 1 | 2, tahun: t }
}

/** Persentase progres, dibulatkan satu desimal dan dibatasi 0–100. */
export function persenProgres(sudah: number, total: number): number {
  if (!Number.isFinite(sudah) || !Number.isFinite(total) || total <= 0) return 0
  const p = (sudah / total) * 100
  return Math.round(Math.min(100, Math.max(0, p)) * 10) / 10
}

export type RingkasKondisi = {
  baik: number
  rusakRingan: number
  rusakBerat: number
  total: number
}

/** Hitung rekap jumlah aset per kondisi dari daftar pemeriksaan. */
export function rekapKondisi(daftar: { kondisi_baru: string }[]): RingkasKondisi {
  const r: RingkasKondisi = { baik: 0, rusakRingan: 0, rusakBerat: 0, total: daftar.length }
  for (const d of daftar) {
    if (d.kondisi_baru === 'Baik') r.baik += 1
    else if (d.kondisi_baru === 'Rusak Ringan') r.rusakRingan += 1
    else if (d.kondisi_baru === 'Rusak Berat') r.rusakBerat += 1
  }
  return r
}

/**
 * Apakah kondisi berubah dan perlu dicatat sebagai perubahan penting.
 * Dipakai untuk menyorot aset yang memburuk.
 */
export function memburuk(lama: string | null | undefined, baru: string): boolean {
  const urutan: Record<string, number> = { Baik: 0, 'Rusak Ringan': 1, 'Rusak Berat': 2 }
  if (!lama || urutan[lama] === undefined || urutan[baru] === undefined) return false
  return urutan[baru] > urutan[lama]
}

/** Catatan pemeriksaan dibatasi agar tidak membanjiri basis data. */
export const CATATAN_MAKS = 500

export function rapikanCatatan(nilai: string | null | undefined): string | null {
  if (typeof nilai !== 'string') return null
  const t = nilai.trim()
  if (!t) return null
  return t.slice(0, CATATAN_MAKS)
}

/**
 * Periksa kelengkapan data pemeriksaan sebelum disimpan.
 * Mengembalikan pesan galat, atau null bila sah.
 */
export function validasiPemeriksaan(input: {
  bmnId?: string | null
  kondisiBaru?: string | null
  semester?: unknown
  tahun?: unknown
}): string | null {
  if (!input.bmnId || !String(input.bmnId).trim()) return 'Aset tidak dipilih.'
  if (!kondisiSah(input.kondisiBaru)) {
    return `Kondisi harus salah satu dari: ${KONDISI_SAH.join(', ')}.`
  }
  if (!periodeSah(input.semester, input.tahun)) return 'Semester atau tahun tidak sah.'
  return null
}
