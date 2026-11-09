/**
 * verifikasi.ts — Alur input bertahap dengan verifikasi Admin.
 *
 * Operator Satker mengisi data sebagai `draft`, mengirimnya (`menunggu`), lalu
 * Admin memutuskan `disetujui` atau `ditolak`. Hanya data `disetujui` yang
 * muncul di laporan dan ekspor.
 *
 * Aturan penting:
 *   - Data lama bernilai `disetujui` (lihat migrasi v24) agar tidak hilang.
 *   - Operator hanya boleh mengubah/mengirim datanya sendiri dan hanya saat
 *     berstatus `draft` atau `ditolak`. Data `menunggu` terkunci agar Admin
 *     memeriksa isi yang tidak berubah di tengah pemeriksaan.
 *   - Hanya Admin yang boleh menyetujui/menolak. Penolakan WAJIB bercatatan
 *     agar operator tahu apa yang harus diperbaiki.
 */

export const STATUS_VERIFIKASI = ['draft', 'menunggu', 'disetujui', 'ditolak'] as const
export type StatusVerifikasi = (typeof STATUS_VERIFIKASI)[number]

/** Modul yang memakai alur verifikasi bertingkat. */
export const MODUL_BERVERIFIKASI = ['bmn', 'keuangan', 'persediaan'] as const
export type ModulBerverifikasi = (typeof MODUL_BERVERIFIKASI)[number]

export function modulBerverifikasi(m: string): m is ModulBerverifikasi {
  return (MODUL_BERVERIFIKASI as readonly string[]).includes(m)
}

type Tampilan = {
  label: string
  /** Kelas Tailwind untuk lencana status. */
  tone: string
  /** Penjelasan singkat bagi pengguna. */
  keterangan: string
}

export const LABEL_STATUS: Record<StatusVerifikasi, Tampilan> = {
  draft: {
    label: 'Draf',
    tone: 'bg-slate-100 text-slate-700 border-slate-200',
    keterangan: 'Masih diisi operator. Belum muncul di laporan.',
  },
  menunggu: {
    label: 'Menunggu Verifikasi',
    tone: 'bg-amber-50 text-amber-800 border-amber-200',
    keterangan: 'Sudah dikirim operator. Menunggu pemeriksaan Admin.',
  },
  disetujui: {
    label: 'Disetujui',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keterangan: 'Sudah diverifikasi Admin dan muncul di laporan.',
  },
  ditolak: {
    label: 'Ditolak',
    tone: 'bg-rose-50 text-rose-700 border-rose-200',
    keterangan: 'Ditolak Admin. Perbaiki lalu kirim ulang.',
  },
}

export function labelStatus(s: string | null | undefined): Tampilan {
  const k = (s ?? 'disetujui') as StatusVerifikasi
  return LABEL_STATUS[k] ?? LABEL_STATUS.disetujui
}

/** Status yang boleh diubah operator (belum terkunci). */
export function bolehDiubah(status: string | null | undefined): boolean {
  const s = (status ?? 'disetujui') as StatusVerifikasi
  return s === 'draft' || s === 'ditolak'
}

/** Status yang muncul di laporan publik & ekspor. */
export const STATUS_TAMPIL_LAPORAN: StatusVerifikasi = 'disetujui'

/**
 * Apakah sebuah baris harus disertakan dalam laporan/ekspor untuk pengguna ini.
 *
 * Admin melihat semua status agar dapat memeriksa pekerjaan yang belum
 * disetujui; pengguna lain hanya melihat yang sudah disetujui.
 */
export function tampilDiLaporan(
  status: string | null | undefined,
  peran: string | null | undefined,
): boolean {
  if (peran === 'Admin') return true
  return (status ?? 'disetujui') === STATUS_TAMPIL_LAPORAN
}

/** Hasil pemeriksaan izin sebelum operator mengirim data. */
export type HasilIzin = { boleh: true } | { boleh: false; alasan: string }

/**
 * Periksa apakah pengguna boleh mengirim data untuk diverifikasi.
 * @param status status verifikasi saat ini
 * @param pemilikId id pengguna yang menginput
 * @param penggunaId id pengguna yang sedang bertindak
 * @param peran peran pengguna yang sedang bertindak
 */
export function bolehKirim(
  status: string | null | undefined,
  pemilikId: string | null | undefined,
  penggunaId: string | null | undefined,
  peran: string | null | undefined,
): HasilIzin {
  const s = (status ?? 'disetujui') as StatusVerifikasi
  if (s === 'menunggu') {
    return { boleh: false, alasan: 'Data sudah dikirim dan sedang menunggu pemeriksaan Admin.' }
  }
  if (s === 'disetujui') {
    return { boleh: false, alasan: 'Data sudah disetujui. Hubungi Admin bila perlu perubahan.' }
  }
  // Peran Admin boleh mengirim data milik siapa pun (mis. membantu operator).
  if (peran === 'Admin') return { boleh: true }
  if (!penggunaId || !pemilikId || pemilikId !== penggunaId) {
    return { boleh: false, alasan: 'Anda hanya dapat mengirim data yang Anda input sendiri.' }
  }
  return { boleh: true }
}

/** Hasil pemeriksaan izin sebelum Admin memutuskan. */
export function bolehPutuskan(peran: string | null | undefined, status: string | null | undefined): HasilIzin {
  if (peran !== 'Admin') {
    return { boleh: false, alasan: 'Hanya Admin yang dapat menyetujui atau menolak data.' }
  }
  if ((status ?? '') !== 'menunggu') {
    return { boleh: false, alasan: 'Hanya data berstatus menunggu yang dapat diputuskan.' }
  }
  return { boleh: true }
}

/**
 * Penolakan wajib disertai catatan agar operator tahu yang harus diperbaiki.
 *
 * Ambang 10 karakter dipilih dari temuan pengujian: catatan 5 huruf seperti
 * "salah" lolos tetapi tidak memberi informasi apa pun kepada operator.
 */
export function catatanPenolakanSah(catatan: string | null | undefined): boolean {
  return typeof catatan === 'string' && catatan.trim().length >= 10
}
