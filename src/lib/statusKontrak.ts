/**
 * statusKontrak.ts — Hitung status paket dari progres fisik dan tanggal kontrak.
 *
 * MASALAH YANG DISELESAIKAN
 *   1. Status dari SIPP dipakai apa adanya. SIPP TIDAK memperbarui status menjadi
 *      "Selesai" setelah tanggal PHO terlewati, sehingga paket yang kontraknya
 *      sudah berakhir tetap tampil "Terkontrak".
 *   2. Paket yang progres fisiknya sudah 100% juga tidak dianggap selesai,
 *      padahal pekerjaannya nyata sudah tuntas.
 *   3. Kolom sisa waktu menampilkan angka negatif (mis. -128) yang membingungkan.
 *
 * URUTAN PRIORITAS
 *   1. Tanggal PHO sudah lewat -> 'selesai'
 *   2. PHO tinggal <= 30 hari  -> 'akan-pho'
 *   3. Ada SPMK / berstatus kontrak -> 'berjalan'
 *   4. Selain itu              -> 'belum'
 *
 * CATATAN TENTANG PROGRES FISIK
 *   Sebelumnya progres fisik 100% otomatis dianggap selesai. Aturan itu
 *   DIBATALKAN atas permintaan pengguna karena terasa terlalu dini: pekerjaan
 *   bisa tercatat 100% secara administratif sementara PHO belum diterbitkan.
 *   Status kini murni mengikuti tanggal PHO. Progres fisik tetap ditampilkan
 *   sebagai angka agar terlihat, tetapi tidak mengubah status.
 *
 *   Parameter `fisik` pada hitungStatusKontrak() sengaja DIPERTAHANKAN agar
 *   pemanggil tidak perlu diubah; nilainya tidak lagi memengaruhi status.
 */

export type StatusKontrak = 'belum' | 'berjalan' | 'akan-pho' | 'selesai'

export type TampilanStatusKontrak = {
  kode: StatusKontrak
  label: string
  /** Kelas Tailwind untuk lencana. */
  tone: string
  /** Penjelasan singkat, dipakai sebagai tooltip. */
  keterangan: string
}

export const TAMPILAN_STATUS_KONTRAK: Record<StatusKontrak, TampilanStatusKontrak> = {
  belum: {
    kode: 'belum',
    label: 'Belum Terkontrak',
    tone: 'bg-slate-100 text-slate-700 border-slate-200',
    keterangan: 'Paket belum memiliki kontrak (SPMK belum terbit).',
  },
  berjalan: {
    kode: 'berjalan',
    label: 'Berjalan',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    keterangan: 'Kontrak aktif, progres fisik belum 100% dan PHO belum terlewati.',
  },
  'akan-pho': {
    kode: 'akan-pho',
    label: 'Akan PHO',
    tone: 'bg-amber-50 text-amber-800 border-amber-200',
    keterangan: 'Tanggal PHO tinggal 30 hari lagi atau kurang.',
  },
  selesai: {
    kode: 'selesai',
    label: 'Selesai (PHO)',
    tone: 'bg-blue-50 text-blue-700 border-blue-200',
    keterangan: 'Progres fisik sudah 100% atau tanggal PHO sudah terlewati.',
  },
}

/** Batas progres fisik yang dianggap tuntas. */
export const FISIK_SELESAI = 100

export function fisikSelesai(fisik: number | null | undefined): boolean {
  return typeof fisik === 'number' && Number.isFinite(fisik) && fisik >= FISIK_SELESAI
}

/**
 * Baca tanggal dari beberapa format yang dipakai SIPP / Excel.
 * Mengembalikan null bila tidak dapat dibaca.
 *
 * Format yang didukung: 'DD-MM-YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'.
 */
export function bacaTanggal(nilai: string | null | undefined): Date | null {
  if (!nilai) return null
  const s = String(nilai).trim()
  if (!s) return null

  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    const [, d, bl, th] = m
    const t = new Date(Number(th), Number(bl) - 1, Number(d))
    return Number.isNaN(t.getTime()) ? null : t
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const [, th, bl, d] = m
    const t = new Date(Number(th), Number(bl) - 1, Number(d))
    return Number.isNaN(t.getTime()) ? null : t
  }

  return null
}

/** Selisih hari antara dua tanggal (b - a), dihitung per tanggal kalender. */
function selisihHari(a: Date, b: Date): number {
  const A = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const B = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((B - A) / 86_400_000)
}

export type HasilStatusKontrak = {
  status: StatusKontrak
  /** Hari menuju PHO; negatif berarti sudah lewat. null bila PHO tidak diketahui. */
  sisaHari: number | null
  /**
   * Keterangan siap tampil. TIDAK memakai kalimat "lewat N hari"; bila sudah
   * selesai cukup ditulis "Selesai" beserta alasannya.
   */
  teksSisa: string
  tanggalPho: Date | null
  /** Selalu false sejak aturan 'fisik 100% = selesai' dibatalkan. */
  karenaFisik: boolean
}

/**
 * Hitung status kontrak.
 * @param tglSpmk tanggal mulai (boleh kosong)
 * @param tglPho tanggal PHO (boleh kosong)
 * @param statusMentah status dari SIPP, dipakai sebagai cadangan bila tanggal kosong
 * @param sekarang acuan "hari ini" (dapat diinjeksi agar hasil stabil saat diuji)
 * @param fisik persen progres fisik (0-100); 100 berarti pekerjaan tuntas
 */
export function hitungStatusKontrak(
  tglSpmk: string | null | undefined,
  tglPho: string | null | undefined,
  statusMentah?: string | null,
  sekarang: Date = new Date(),
  fisik?: number | null,
): HasilStatusKontrak {
  const pho = bacaTanggal(tglPho)
  const spmk = bacaTanggal(tglSpmk)
  const mentah = (statusMentah ?? '').toLowerCase()
  // `fisik` tidak lagi menentukan status (lihat catatan di kepala berkas).
  void fisik

  const sisa = pho ? selisihHari(sekarang, pho) : null

  // --- Tanpa tanggal PHO ---------------------------------------------------
  if (!pho) {
    if (mentah.includes('belum')) {
      return { status: 'belum', sisaHari: null, teksSisa: '—', tanggalPho: null, karenaFisik: false }
    }
    const berjalan = mentah.includes('terkontrak') || Boolean(spmk)
    return {
      status: berjalan ? 'berjalan' : 'belum',
      sisaHari: null,
      teksSisa: '—',
      tanggalPho: null,
      karenaFisik: false,
    }
  }

  // --- Prioritas 2: PHO sudah terlewati ------------------------------------
  if (sisa !== null && sisa < 0) {
    return {
      status: 'selesai',
      sisaHari: sisa,
      teksSisa: 'Selesai (PHO)',
      tanggalPho: pho,
      karenaFisik: false,
    }
  }

  // --- Prioritas 3: mendekati PHO ------------------------------------------
  if (sisa !== null && sisa <= 30) {
    return {
      status: 'akan-pho',
      sisaHari: sisa,
      teksSisa: sisa === 0 ? 'PHO hari ini' : `${sisa} hari lagi`,
      tanggalPho: pho,
      karenaFisik: false,
    }
  }

  // --- Prioritas 4: masih berjalan -----------------------------------------
  return {
    status: 'berjalan',
    sisaHari: sisa,
    teksSisa: sisa === null ? '—' : `${sisa} hari lagi`,
    tanggalPho: pho,
    karenaFisik: false,
  }
}
