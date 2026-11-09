import { describe, it, expect } from 'vitest'

/**
 * Uji batas hari WIB untuk cron ringkasan harian.
 *
 * Fungsi disalin persis dari route (route Next.js tidak dapat diimpor langsung
 * di lingkungan test tanpa runtime server), sehingga test ini berfungsi sebagai
 * penjaga regresi terhadap logika yang pernah salah (memakai 00:00 UTC =
 * 07:00 WIB sebagai awal hari).
 */
function getAwalHariIso(now: Date): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const wibMs = now.getTime() + WIB_OFFSET_MS
  const tengahMalamWibMs = Math.floor(wibMs / 86_400_000) * 86_400_000
  return new Date(tengahMalamWibMs - WIB_OFFSET_MS).toISOString()
}

describe('getAwalHariIso (WIB)', () => {
  it('awal hari WIB = 17:00 UTC hari sebelumnya', () => {
    // 23 Okt 2026 10:00 WIB (= 03:00 UTC)
    const sekarang = new Date('2026-10-23T03:00:00.000Z')
    expect(getAwalHariIso(sekarang)).toBe('2026-10-22T17:00:00.000Z')
  })

  it('pukul 00:30 WIB sudah masuk hari baru (bukan ikut hari kemarin)', () => {
    // 23 Okt 2026 00:30 WIB (= 22 Okt 17:30 UTC)
    const sekarang = new Date('2026-10-22T17:30:00.000Z')
    expect(getAwalHariIso(sekarang)).toBe('2026-10-22T17:00:00.000Z')
  })

  it('pukul 23:59 WIB masih hari yang sama', () => {
    // 23 Okt 2026 23:59 WIB (= 23 Okt 16:59 UTC)
    const sekarang = new Date('2026-10-23T16:59:00.000Z')
    expect(getAwalHariIso(sekarang)).toBe('2026-10-22T17:00:00.000Z')
  })

  it('pukul 07:00 WIB TIDAK memulai hari baru (bug lama)', () => {
    // Bug lama: 07:00 WIB (= 00:00 UTC) dianggap awal hari.
    const sekarang = new Date('2026-10-23T00:00:00.000Z')
    expect(getAwalHariIso(sekarang)).toBe('2026-10-22T17:00:00.000Z')
    expect(getAwalHariIso(sekarang)).not.toBe('2026-10-23T00:00:00.000Z')
  })

  it('selalu menghasilkan 17:00 UTC (tengah malam WIB) untuk berbagai jam', () => {
    // Tengah malam WIB = 00:00 WIB = 17:00 UTC hari sebelumnya.
    const kasus = [
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T06:59:00.000Z',
      '2026-10-01T17:00:00.000Z',
      '2026-10-01T23:59:00.000Z',
      '2026-12-31T16:30:00.000Z',
    ]
    for (const iso of kasus) {
      const hasil = getAwalHariIso(new Date(iso))
      expect(hasil.endsWith('T17:00:00.000Z')).toBe(true)
      // Hasilnya tidak boleh melewati waktu acuan.
      expect(Date.parse(hasil)).toBeLessThanOrEqual(Date.parse(iso))
    }
  })
})
