import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit } from '@/lib/rateLimit'

/**
 * Pengujian rate limiter.
 *
 * Limiter ini melindungi login, unggah berkas, dan endpoint ingest dari
 * penyalahgunaan. Bila gagal menolak, penyerang bisa mencoba password tanpa
 * batas atau membanjiri penyimpanan.
 */
describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('mengizinkan permintaan sampai batas', () => {
    const key = `uji-batas-${Math.random()}`
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true)
    }
  })

  it('menolak permintaan yang melewati batas', () => {
    const key = `uji-tolak-${Math.random()}`
    for (let i = 0; i < 3; i += 1) {
      checkRateLimit(key, 3, 60_000)
    }
    expect(checkRateLimit(key, 3, 60_000)).toBe(false)
    expect(checkRateLimit(key, 3, 60_000)).toBe(false)
  })

  it('memisahkan batas antar kunci (pengguna A tidak memblokir B)', () => {
    const a = `uji-a-${Math.random()}`
    const b = `uji-b-${Math.random()}`
    checkRateLimit(a, 1, 60_000)
    expect(checkRateLimit(a, 1, 60_000)).toBe(false)
    expect(checkRateLimit(b, 1, 60_000)).toBe(true)
  })

  it('mengizinkan kembali setelah jendela waktu habis', () => {
    vi.useFakeTimers()
    const key = `uji-jendela-${Math.random()}`
    expect(checkRateLimit(key, 1, 1_000)).toBe(true)
    expect(checkRateLimit(key, 1, 1_000)).toBe(false)

    vi.advanceTimersByTime(1_500)
    expect(checkRateLimit(key, 1, 1_000)).toBe(true)
    vi.useRealTimers()
  })
})
