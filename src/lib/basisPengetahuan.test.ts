import { describe, it, expect } from 'vitest'
import { jawab, normalisasiTeks, kataDasar, cocokKata, skorTopik, TOPIK } from './basisPengetahuan'

/**
 * Asisten berbasis template (tanpa AI).
 *
 * Yang dijaga:
 *   1. Pertanyaan nyata pengguna mengenai menu/alur aplikasi dijawab benar.
 *   2. Pertanyaan di luar cakupan TIDAK dijawab mengarang.
 *   3. Tidak ada ketergantungan jaringan.
 */

describe('normalisasiTeks', () => {
  it('menurunkan huruf dan membuang tanda baca', () => {
    expect(normalisasiTeks('Di Mana Menu KEUANGAN?!')).toBe('di mana menu keuangan')
  })

  it('merapikan spasi berlebih', () => {
    expect(normalisasiTeks('  menu    keuangan  ')).toBe('menu keuangan')
  })
})

describe('kataDasar', () => {
  it('membuang awalan dan akhiran -nya tanpa merusak kata dasar', () => {
    expect(kataDasar('mengunggah')).toBe('unggah')
    expect(kataDasar('diunggah')).toBe('unggah')
    expect(kataDasar('diverifikasi')).toBe('verifikasi')
    expect(kataDasar('keuangannya')).toBe('keuangan')
    expect(kataDasar('persediaannya')).toBe('persediaan')
  })

  it('TIDAK merusak kata dasar yang kebetulan berawalan pe-/ke-', () => {
    // Regresi: versi sebelumnya mengubah 'persediaan' -> 'rsediaan' dan
    // 'keuangan' -> 'keuang', sehingga kata kunci persis pun tak cocok.
    expect(kataDasar('persediaan')).toBe('persediaan')
    expect(kataDasar('keuangan')).toBe('keuangan')
    expect(kataDasar('kegiatan')).toBe('kegiatan')
    expect(kataDasar('anggaran')).toBe('anggaran')
  })

  it('tidak merusak kata pendek', () => {
    expect(kataDasar('bmn')).toBe('bmn')
    expect(kataDasar('sk')).toBe('sk')
  })
})

describe('cocokKata', () => {
  it('mencocokkan bentuk berimbuhan dengan kata dasarnya', () => {
    expect(cocokKata('mengunggah', 'unggah')).toBe(true)
    expect(cocokKata('verifikasi', 'diverifikasi')).toBe(true)
  })

  it('tidak mencocokkan kata pendek secara sembarangan', () => {
    // 'sk' tidak boleh cocok dengan 'sks' atau kata lain hanya karena awalan.
    expect(cocokKata('sks', 'sk')).toBe(false)
  })
})

describe('jawab — pertanyaan nyata pengguna', () => {
  const kasus: Array<[string, string]> = [
    ['di mana menu keuangan?', 'keuangan'],
    ['cara input transaksi', 'keuangan'],
    ['kenapa data saya tidak masuk laporan?', 'verifikasi'],
    ['data tidak muncul di laporan', 'verifikasi'],
    ['apa itu bmn', 'bmn'],
    ['bagaimana alur utilitas', 'utilitas'],
    ['apa itu sla', 'utilitas'],
    ['cara ekspor excel', 'laporan'],
    ['unduh laporan pdf', 'laporan'],
    ['apa itu dipa', 'dipa'],
    ['menu apa saja yang ada', 'menu'],
    ['daftar menu', 'menu'],
    ['role saya tidak bisa buka menu', 'role'],
    ['lupa password', 'akun'],
    ['akun saya pending', 'akun'],
    ['stok kritis', 'persediaan'],
    ['apa itu iemon', 'iemon'],
    ['paket sipp', 'sipp'],
    ['jadwal rapat', 'jadwal'],
    ['notifikasi tidak muncul', 'notifikasi'],
    ['command center', 'cron'],
    ['apakah data saya dikirim ke ai', 'keamanan'],
  ]

  for (const [tanya, topikDiharapkan] of kasus) {
    it(`"${tanya}" -> topik ${topikDiharapkan}`, () => {
      const hasil = jawab(tanya)
      expect(hasil.topikId, `dapat: ${hasil.topikId}`).toBe(topikDiharapkan)
    })
  }

  it('setiap jawaban tidak kosong dan cukup informatif', () => {
    for (const [tanya] of kasus) {
      const hasil = jawab(tanya)
      expect(hasil.jawaban.length).toBeGreaterThan(40)
    }
  })
})

describe('jawab — batasan yang benar', () => {
  it('salam dijawab dengan sapaan + saran topik', () => {
    const hasil = jawab('halo')
    expect(hasil.jawaban.toLowerCase()).toContain('halo')
    expect(hasil.saran?.length).toBeGreaterThan(0)
  })

  it('ucapan terima kasih dibalas sopan', () => {
    const hasil = jawab('terima kasih')
    expect(hasil.jawaban.toLowerCase()).toContain('sama-sama')
  })

  it('pertanyaan di luar cakupan TIDAK dikarang', () => {
    const hasil = jawab('berapa harga saham hari ini')
    expect(hasil.topikId).toBeNull()
    expect(hasil.jawaban).toContain('belum menemukan')
    expect(hasil.saran?.length).toBeGreaterThan(0)
  })

  it('pertanyaan kosong meminta masukan', () => {
    const hasil = jawab('   ')
    expect(hasil.topikId).toBeNull()
    expect(hasil.jawaban.toLowerCase()).toContain('silakan')
  })

  it('hasil selalu sama untuk pertanyaan yang sama (deterministik)', () => {
    const a = jawab('bagaimana alur utilitas')
    const b = jawab('bagaimana alur utilitas')
    expect(a).toEqual(b)
  })
})

describe('kualitas basis pengetahuan', () => {
  it('setiap topik punya id unik', () => {
    const ids = TOPIK.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('setiap topik punya kata kunci dan jawaban memadai', () => {
    for (const t of TOPIK) {
      expect(t.kataKunci.length, t.id).toBeGreaterThan(0)
      expect(t.jawaban.length, t.id).toBeGreaterThan(50)
    }
  })

  it('skorTopik memberi skor lebih tinggi untuk kata kunci khas', () => {
    const keuangan = TOPIK.find((t) => t.id === 'keuangan')!
    const bmn = TOPIK.find((t) => t.id === 'bmn')!
    expect(skorTopik('transaksi keuangan', keuangan)).toBeGreaterThan(
      skorTopik('transaksi keuangan', bmn),
    )
  })
})
