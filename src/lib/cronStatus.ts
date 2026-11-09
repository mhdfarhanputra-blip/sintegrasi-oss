/**
 * cronStatus.ts — Menilai kesehatan sebuah cron dari riwayat eksekusinya.
 *
 * MASALAH
 *   "Cron terakhir jalan 3 hari lalu" hanya berbahaya bila jadwalnya harian.
 *   Tanpa membandingkan dengan JADWAL, dasbor hanya bisa menampilkan fakta
 *   mentah dan operator tetap harus menebak sendiri apakah itu wajar.
 *
 *   Modul ini menghitung perkiraan interval jadwal, lalu menandai cron sebagai
 *   "terlambat" bila tidak ada eksekusi dalam ~2x intervalnya.
 */

export type KesehatanCron = 'sehat' | 'terlambat' | 'gagal' | 'belum-pernah' | 'dijeda'

/**
 * Perkiraan interval jadwal dalam menit, dari ekspresi cron 5 kolom (UTC).
 *
 * Hanya menangani bentuk yang dipakai aplikasi ini. Untuk bentuk kompleks
 * (mis. `0 9 * * 1-5`) hasilnya perkiraan kasar yang sengaja dibuat lebih
 * longgar agar tidak memicu alarm palsu di akhir pekan.
 *
 * @returns interval dalam menit, atau null bila tidak dapat diperkirakan.
 */
export function intervalMenit(jadwal: string): number | null {
  const b = jadwal.trim().split(/\s+/)
  if (b.length < 5) return null
  const [menit, jam, , , hari] = b

  const kelipatan = (s: string): number | null => {
    const m = s.match(/^\*\/(\d+)$/)
    return m ? Number(m[1]) : null
  }

  // Bentuk "*/n * * * *" -> tiap n menit.
  const tiapMenit = kelipatan(menit)
  if (tiapMenit && jam === '*') return tiapMenit

  // Bentuk "* H * * *" atau "M H * * *" -> harian.
  const tiapJam = kelipatan(jam)
  if (tiapJam) return tiapJam * 60

  // Bentuk "*/n A-B * * *" (mis. sinyal trading "*/5 9-16 * * 1-5"): tiap n
  // menit hanya pada jam A sampai B.
  //
  // PENTING: blok ini harus SEBELUM validasi daftar jam di bawah, karena
  // "9-16" bukan angka tunggal sehingga akan dianggap tidak sah dan fungsi
  // mengembalikan null (cron sehat lalu dilaporkan "tidak diketahui").
  const rentang = jam.match(/^(\d{1,2})-(\d{1,2})$/)
  if (rentang && tiapMenit) {
    const awal = Number(rentang[1])
    const akhir = Number(rentang[2])
    if (awal > akhir || akhir > 23) return null
    // Jumlah eksekusi per hari, lalu ambang dihitung dari siklus harian
    // (hari kerja memakai 3 hari kalender agar Senin tidak dianggap telat).
    //
    // Jam rentang bersifat INKLUSIF pada kedua ujung, dan jam terakhir
    // berjalan penuh 60 menit: "9-16" berarti 09:00 sampai 16:59. Versi
    // pertama rumus ini lupa menambah 1 jam sehingga menghasilkan 85
    // padahal seharusnya 96, dan ambangnya terlalu longgar.
    const jamTerpakai = (akhir - awal + 1) * 60
    const perHari = Math.floor(jamTerpakai / tiapMenit)
    const menitPerSiklus = hari === '1-5' ? 3 * 24 * 60 : 24 * 60
    return Math.ceil(menitPerSiklus / Math.max(1, perHari))
  }

  const daftarJam = jam.split(',').filter((x) => x !== '*')
  const jamAngka = daftarJam.map(Number)
  if (jamAngka.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) return null

  // Hari kerja (1-5): jarak terjauh antar-eksekusi adalah Jumat -> Senin (3 hari),
  // sehingga ambang harus memakai 3 hari agar Senin pagi tidak dianggap telat.
  const hariKerja = hari === '1-5'
  const jumlahPerHari = Math.max(1, jamAngka.length)
  const jarakHari = hariKerja ? 3 : 1
  return Math.ceil((24 * 60 * jarakHari) / jumlahPerHari)
}

/** Bahan penilaian untuk satu cron. */
export type BahanPenilaian = {
  /** Interval jadwal dalam menit (dari intervalMenit). */
  interval: number | null
  /** Waktu eksekusi terakhir (ISO) atau null bila belum pernah. */
  terakhir: string | null
  /** Status eksekusi terakhir. */
  statusTerakhir: string | null
  /** Apakah cron sedang dijeda/dimatikan. */
  dijeda?: boolean
  /** "Sekarang" (diinjeksi agar hasil stabil saat diuji). */
  sekarang: number
}

/**
 * Nilai kesehatan sebuah cron.
 *
 * Urutan prioritas:
 *   1. Dijeda            -> 'dijeda'      (tidak dinilai)
 *   2. Belum pernah jalan -> 'belum-pernah'
 *   3. Eksekusi terakhir gagal -> 'gagal'
 *   4. Terlambat > 2x interval -> 'terlambat'
 *   5. Selain itu        -> 'sehat'
 */
export function nilaiKesehatan(b: BahanPenilaian): KesehatanCron {
  if (b.dijeda) return 'dijeda'
  if (!b.terakhir) return 'belum-pernah'
  if (b.statusTerakhir === 'gagal') return 'gagal'

  if (b.interval === null) return 'sehat'
  const lewatMenit = (b.sekarang - Date.parse(b.terakhir)) / 60_000
  if (!Number.isFinite(lewatMenit)) return 'sehat'
  // Toleransi 2x interval + 20 menit untuk jitter penjadwal dan deploy.
  return lewatMenit > b.interval * 2 + 20 ? 'terlambat' : 'sehat'
}

/** Label & warna lencana untuk setiap kondisi. */
export const TAMPILAN_KESEHATAN: Record<KesehatanCron, { label: string; tone: string }> = {
  sehat: { label: 'Sehat', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  terlambat: { label: 'Terlambat', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  gagal: { label: 'Gagal', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  'belum-pernah': {
    label: 'Belum pernah jalan',
    tone: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  dijeda: { label: 'Dijeda', tone: 'bg-slate-100 text-slate-500 border-slate-200' },
}
