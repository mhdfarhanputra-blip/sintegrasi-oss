/**
 * Konstanta bersama untuk seluruh modul.
 */

import { currentYear } from './format'

/**
 * Daftar tahun anggaran yang tersedia di filter.
 * Mencakup dua tahun lalu, tahun ini, dan satu tahun ke depan.
 */
export function tahunAnggaranOptions(): number[] {
  const now = currentYear()
  return [now - 2, now - 1, now, now + 1].filter((y) => y >= 2024)
}

/**
 * Jumlah item per halaman default untuk tabel/daftar.
 */
export const ITEMS_PER_PAGE = 20
