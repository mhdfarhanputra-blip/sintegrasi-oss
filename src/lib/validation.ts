/**
 * Library validasi bersama untuk route API.
 *
 * Berisi fungsi murni tanpa dependency eksternal yang sebelumnya diduplikasi
 * inline di banyak route (mis. keuangan, persediaan). Tujuannya satu sumber
 * kebenaran untuk pembersihan input dasar.
 */

/** Tahun minimum default yang dianggap valid untuk {@link cleanYear}. */
export const DEFAULT_MIN_YEAR = 2000
/** Selisih tahun maksimum ke depan dari tahun berjalan untuk {@link cleanYear}. */
export const DEFAULT_MAX_AHEAD = 5
/** Panjang maksimum default untuk teks pada {@link cleanText}. */
export const DEFAULT_TEXT_MAX = 500

/**
 * Membersihkan teks: non-string menjadi null, melakukan trim dan merapatkan
 * spasi berturut menjadi satu, mengembalikan null bila kosong, lalu memotong
 * ke panjang maksimum.
 *
 * @param value Nilai sembarang dari input pengguna.
 * @param max Panjang maksimum hasil (default {@link DEFAULT_TEXT_MAX}).
 * @returns Teks yang sudah dibersihkan atau null.
 */
export function cleanText(value: unknown, max = DEFAULT_TEXT_MAX): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\s+/g, ' ')
  return text ? text.slice(0, max) : null
}

/**
 * Memvalidasi tanggal pada format 'YYYY-MM-DD' **dan** validitas kalender.
 *
 * Sebelumnya hanya format yang diperiksa lewat regex, sehingga tanggal
 * mustahil seperti '2026-02-31' atau '2025-13-01' lolos validasi lalu masuk
 * database (PostgreSQL menolaknya di level kolom `date`, sehingga pengguna
 * menerima galat 500 yang tidak informatif). Sekarang tanggal tersebut
 * ditolak lebih awal sebagai 400 dengan pesan yang jelas.
 *
 * @param value Nilai sembarang dari input pengguna.
 * @returns String tanggal asli bila format dan kalender valid, selain itu null.
 */
export function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [tahun, bulan, hari] = value.split('-').map(Number)
  // Date memakai bulan berbasis 0; membandingkan kembali komponennya menangkap
  // hari/bulan yang "meluap" (mis. 31 Februari menjadi 3 Maret).
  const d = new Date(Date.UTC(tahun, bulan - 1, hari))
  if (
    d.getUTCFullYear() !== tahun ||
    d.getUTCMonth() !== bulan - 1 ||
    d.getUTCDate() !== hari
  ) {
    return null
  }
  return value
}

/**
 * Tahun berjalan menurut zona waktu aplikasi (Asia/Jakarta).
 *
 * BUG yang diperbaiki: `new Date().getFullYear()` memakai zona waktu SERVER.
 * Di Vercel server berjalan pada UTC, sehingga antara 00:00–07:00 WIB tanggal
 * 1 Januari, server masih menganggap tahun lalu. Akibatnya pengguna yang
 * menginput transaksi tanggal 1 Januari (tahun anggaran baru) justru
 * mendapatkan `tahun_anggaran` tahun sebelumnya — data masuk ke tahun yang
 * salah dan hilang dari filter/laporan tahun berjalan.
 *
 * Diekspor agar seluruh route memakai satu sumber kebenaran.
 */
export function tahunBerjalan(): number {
  return Number(
    new Date().toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Jakarta' }),
  )
}

/**
 * Bersihkan tahun opsional: nilai bilangan bulat dalam rentang
 * [min, tahunBerjalan + maxAhead] dikembalikan apa adanya, selain itu null.
 *
 * Berbeda dengan {@link cleanYear} yang selalu mengembalikan angka (jatuh ke
 * tahun berjalan), fungsi ini mempertahankan makna "tidak diisi" sebagai null
 * — penting untuk kolom opsional seperti `tahun_pengadaan`.
 */
export function cleanYearOptional(
  value: unknown,
  opts?: { min?: number; maxAhead?: number },
): number | null {
  const min = opts?.min ?? DEFAULT_MIN_YEAR
  const maxAhead = opts?.maxAhead ?? DEFAULT_MAX_AHEAD
  const current = tahunBerjalan()
  const year = Number(value)
  return Number.isInteger(year) && year >= min && year <= current + maxAhead ? year : null
}

/**
 * Membersihkan tahun: bila bilangan bulat berada dalam rentang
 * [min, tahunBerjalan + maxAhead] maka nilai itu dipakai, selain itu jatuh
 * ke tahun berjalan.
 *
 * @param value Nilai sembarang dari input pengguna.
 * @param opts Opsi rentang: min (default {@link DEFAULT_MIN_YEAR}) dan
 *   maxAhead (default {@link DEFAULT_MAX_AHEAD}).
 * @returns Tahun yang valid atau tahun berjalan.
 */
export function cleanYear(
  value: unknown,
  opts?: { min?: number; maxAhead?: number },
): number {
  return cleanYearOptional(value, opts) ?? tahunBerjalan()
}

/**
 * Mem-parse bilangan bulat dan memvalidasi rentang opsional.
 *
 * Nilai non-integer atau di luar rentang akan mengembalikan null. Secara
 * default tanpa batas bawah/atas.
 *
 * @param value Nilai sembarang dari input pengguna.
 * @param opts Opsi rentang: min dan max (inklusif).
 * @returns Bilangan bulat valid atau null.
 */
export function cleanInt(
  value: unknown,
  opts?: { min?: number; max?: number },
): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(num)) return null
  if (opts?.min !== undefined && num < opts.min) return null
  if (opts?.max !== undefined && num > opts.max) return null
  return num
}

/**
 * Validasi bentuk email sederhana via regex konservatif.
 *
 * Bukan untuk keperluan keamanan, hanya memeriksa pola dasar
 * 'lokal@domain.tld' dengan TLD minimal dua huruf.
 *
 * @param value Nilai sembarang dari input pengguna.
 * @returns true bila bentuk email valid, selain itu false.
 */
export function isValidEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}
