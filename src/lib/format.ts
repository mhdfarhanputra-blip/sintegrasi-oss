/**
 * Utilitas format terpusat untuk seluruh modul.
 * Konsisten dengan locale Indonesia dan zona waktu Asia/Jakarta.
 */

const APP_TIME_ZONE = 'Asia/Jakarta'

/**
 * Format angka menjadi mata uang Rupiah penuh.
 */
export function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n ?? 0)
}

/**
 * Format angka Rupiah ringkas (M/Jt) untuk kartu ringkasan.
 */
export function formatShort(n: number): string {
  const value = n ?? 0
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(2)} M`
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)} Jt`
  return formatRupiah(value)
}

/**
 * Format tanggal pendek: 01 Jan 2026.
 */
export function formatDate(iso: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  })
}

/**
 * Format tanggal + waktu: 01 Jan 2026, 14:30.
 */
export function formatDateTime(iso: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  })
}

/**
 * Tahun berjalan menurut zona waktu aplikasi.
 */
export function currentYear(): number {
  return Number(new Date().toLocaleDateString('en-US', { year: 'numeric', timeZone: APP_TIME_ZONE }))
}
