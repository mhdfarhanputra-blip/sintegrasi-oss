import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { TOPIK, jawab } from './basisPengetahuan'

/**
 * Penjaga: aplikasi TIDAK memakai AI sama sekali.
 *
 * Permintaan pemilik aplikasi:
 *   1. "pastikan semua berjalan otomatis tidak menggunakan ai"
 *   2. "untuk layanan chat ai gunakan jawaban template"
 *
 * Test ini memindai kode sumber agar layanan AI tidak diam-diam masuk kembali.
 */

const ROOT = join(process.cwd(), 'src')

/** Kumpulkan semua berkas sumber (tanpa berkas test). */
function kumpulkanSumber(dir: string): string[] {
  const hasil: string[] = []
  for (const nama of readdirSync(dir)) {
    const penuh = join(dir, nama)
    if (statSync(penuh).isDirectory()) hasil.push(...kumpulkanSumber(penuh))
    else if (/\.(ts|tsx)$/.test(nama) && !nama.includes('.test.')) hasil.push(penuh)
  }
  return hasil
}

/** Penanda panggilan AI sungguhan (bukan kata di komentar dokumentasi). */
const PENANDA_AI = [/api\.deepseek\.com/, /api\.openai\.com/, /generativelanguage\.googleapis\.com/, /api\.anthropic\.com/]

describe('aplikasi bebas AI', () => {
  const sumber = kumpulkanSumber(ROOT)

  it('tidak ada berkas sumber yang memanggil layanan AI', () => {
    const pelanggar: string[] = []
    for (const p of sumber) {
      const isi = readFileSync(p, 'utf8')
      for (const pola of PENANDA_AI) {
        if (pola.test(isi)) pelanggar.push(relative(ROOT, p))
      }
    }
    expect(pelanggar).toEqual([])
  })

  it('tidak ada kode yang membaca DEEPSEEK_API_KEY / OPENAI_API_KEY', () => {
    const pelanggar = sumber.filter((p) => {
      const isi = readFileSync(p, 'utf8')
      // Hanya tangkap PEMAKAIAN (process.env.X), bukan sebutan di komentar.
      return /process\.env\.(DEEPSEEK|OPENAI)_API_KEY/.test(isi)
    })
    expect(pelanggar.map((p) => relative(ROOT, p))).toEqual([])
  })

  it('route /api/ai sudah dihapus', () => {
    expect(existsSync(join(ROOT, 'app/api/ai/route.ts'))).toBe(false)
  })

})

describe('jalur otomatis bebas AI', () => {
  const JALUR = [
    'lib/iemonAi.ts',
    'lib/realisasiAi.ts',
    'lib/dipaParser.ts',
  ]

  for (const rel of JALUR) {
    it(`${rel} tidak memanggil layanan AI`, () => {
      const isi = readFileSync(join(ROOT, rel), 'utf8')
      for (const pola of PENANDA_AI) expect(isi).not.toMatch(pola)
      expect(isi).not.toMatch(/response_format/)
    })
  }

})

describe('asisten template benar-benar menjawab', () => {
  it('menjelaskan setiap menu utama aplikasi', () => {
    // Menu pada Sidebar harus dapat dijelaskan oleh asisten.
    const menu = ['keuangan', 'persediaan', 'bmn', 'utilitas', 'dipa', 'sk', 'iemon', 'sipp', 'jadwal', 'cron']
    for (const m of menu) {
      const hasil = jawab(`apa itu ${m}`)
      expect(hasil.topikId, `menu ${m} tidak dikenali`).not.toBeNull()
    }
  })

  it('menjelaskan alur verifikasi ketika data tidak muncul di laporan', () => {
    const hasil = jawab('kenapa data saya tidak masuk laporan')
    expect(hasil.topikId).toBe('verifikasi')
    expect(hasil.jawaban).toMatch(/draf|ditolak|disetujui/i)
  })

  it('memiliki cakupan topik yang memadai', () => {
    expect(TOPIK.length).toBeGreaterThanOrEqual(15)
  })
})
