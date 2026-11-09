/**
 * kartuStok.ts — Perhitungan saldo persediaan yang dapat diuji.
 *
 * MASALAH YANG DISELESAIKAN
 *   Tabel `persediaan` menyimpan MUTASI (Masuk/Keluar), tetapi setiap baris
 *   juga menyimpan `stok_saldo` hasil hitung di sisi klien saat baris dibuat.
 *   Halaman Persediaan mengambil "saldo terkini" sebagai baris TERBARU menurut
 *   `created_at`.
 *
 *   Itu salah ketika ada transaksi bertanggal mundur (backdated): transaksi
 *   tanggal 5 Januari yang baru diinput hari ini mendapat `created_at` hari
 *   ini, sehingga ia dianggap baris terakhir dan saldonya — yang dihitung dari
 *   saldo sebelum transaksi tanggal 20 Januari — menimpa saldo yang benar.
 *   Akibatnya angka stok dan daftar stok kritis menjadi salah tanpa gejala.
 *
 *   Perbaikan: saldo terkini ditentukan dari transaksi dengan TANGGAL
 *   (bukan waktu input) paling akhir. Bila tanggalnya sama, urutan input
 *   (`created_at`) dipakai sebagai penentu.
 */

export type MutasiStok = {
  id: string
  nama_barang: string
  jenis: string
  jumlah: number
  stok_saldo: number | null
  tanggal: string
  created_at?: string | null
  tahun_anggaran?: number | null
}

/** Kunci pembanding sebuah mutasi: tanggal dulu, lalu waktu input. */
function waktuMutasi(row: MutasiStok): number {
  const tgl = Date.parse(row.tanggal)
  const dibuat = row.created_at ? Date.parse(row.created_at) : Number.NaN
  // Tanggal tidak terbaca → jatuhkan ke waktu input agar tidak dianggap tertua.
  const utama = Number.isNaN(tgl) ? (Number.isNaN(dibuat) ? 0 : dibuat) : tgl
  return utama
}

/**
 * Urutkan mutasi dari yang paling lama ke paling baru.
 *
 * Urutan ini dipakai untuk menghitung saldo berjalan dan untuk mengambil baris
 * terakhir sebagai saldo terkini. Mengembalikan array baru (tidak mengubah
 * masukan).
 */
export function urutkanMutasi<T extends MutasiStok>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const selisih = waktuMutasi(a) - waktuMutasi(b)
    if (selisih !== 0) return selisih
    // Penentu stabil: waktu input, lalu id, agar hasil deterministik.
    const dibuatA = a.created_at ? Date.parse(a.created_at) : 0
    const dibuatB = b.created_at ? Date.parse(b.created_at) : 0
    if (dibuatA !== dibuatB) return dibuatA - dibuatB
    return String(a.id).localeCompare(String(b.id))
  })
}

/**
 * Ambil satu baris terakhir (saldo terkini) per nama barang, berdasarkan
 * URUTAN TANGGAL transaksi — bukan waktu input.
 *
 * @returns Map dari nama barang (huruf kecil, ter-trim) ke mutasi terbaru.
 */
export function saldoTerkiniPerBarang<T extends MutasiStok>(rows: T[]): Map<string, T> {
  const hasil = new Map<string, T>()
  for (const row of urutkanMutasi(rows)) {
    const key = row.nama_barang.trim().toLowerCase()
    if (!key) continue
    // Karena diurutkan menaik, penulisan terakhir adalah yang paling baru.
    hasil.set(key, row)
  }
  return hasil
}

/**
 * Hitung saldo berjalan untuk satu barang dari mutasi mentah.
 *
 * Dipakai sebagai pembanding terhadap `stok_saldo` yang tersimpan, sehingga
 * selisih akibat input bersamaan atau koreksi manual dapat dideteksi.
 */
export function hitungSaldoBerjalan(rows: MutasiStok[]): number {
  return urutkanMutasi(rows).reduce((saldo, row) => {
    const jumlah = Number(row.jumlah) || 0
    return row.jenis === 'Masuk' ? saldo + jumlah : saldo - jumlah
  }, 0)
}

/**
 * Barang yang saldonya sudah menyentuh/di bawah ambang minimum.
 *
 * `stok_minimum` bernilai 0 atau kosong berarti barang TIDAK dipantau
 * (bukan berarti batasnya nol), sehingga tidak pernah masuk daftar kritis.
 */
export function daftarStokKritis<T extends MutasiStok & { stok_minimum?: number | null }>(
  rows: T[],
): T[] {
  return [...saldoTerkiniPerBarang(rows).values()].filter((row) => {
    const minimum = Number(row.stok_minimum ?? 0)
    if (!Number.isFinite(minimum) || minimum <= 0) return false
    const saldo = Number(row.stok_saldo ?? 0)
    return saldo <= minimum
  })
}
