import { describe, it, expect } from 'vitest'
import { intervalMenit, nilaiKesehatan, TAMPILAN_KESEHATAN } from './cronStatus'
import { CRON_REGISTRY, cariCron, jadwalKeWib } from './cronRegistry'

describe('intervalMenit', () => {
  it('mengenali jadwal tiap 30 menit', () => {
    expect(intervalMenit('*/30 * * * *')).toBe(30)
  })

  it('mengenali jadwal harian', () => {
    expect(intervalMenit('30 0 * * *')).toBe(24 * 60)
  })

  it('mengenali dua kali sehari', () => {
    expect(intervalMenit('0 0,4 * * *')).toBe(12 * 60)
  })

  it('memakai jarak 3 hari untuk hari kerja agar Senin tidak dianggap telat', () => {
    // Jumat 16:00 -> Senin 16:00 = 3 hari
    expect(intervalMenit('0 9 * * 1-5')).toBe(3 * 24 * 60)
  })

  it('mengembalikan null untuk ekspresi tidak dikenal', () => {
    expect(intervalMenit('bukan cron')).toBeNull()
    expect(intervalMenit('0 abc * * *')).toBeNull()
  })
})

describe('nilaiKesehatan', () => {
  const sekarang = Date.parse('2026-10-23T10:00:00.000Z')

  it('dijeda mengalahkan kondisi lain', () => {
    expect(
      nilaiKesehatan({ interval: 60, terakhir: null, statusTerakhir: 'gagal', dijeda: true, sekarang }),
    ).toBe('dijeda')
  })

  it('belum pernah berjalan', () => {
    expect(nilaiKesehatan({ interval: 1440, terakhir: null, statusTerakhir: null, sekarang })).toBe(
      'belum-pernah',
    )
  })

  it('gagal bila eksekusi terakhir gagal', () => {
    expect(
      nilaiKesehatan({
        interval: 1440,
        terakhir: '2026-10-23T09:00:00.000Z',
        statusTerakhir: 'gagal',
        sekarang,
      }),
    ).toBe('gagal')
  })

  it('sehat bila masih dalam 2x interval', () => {
    expect(
      nilaiKesehatan({
        interval: 30,
        terakhir: '2026-10-23T09:30:00.000Z',
        statusTerakhir: 'sukses',
        sekarang,
      }),
    ).toBe('sehat')
  })

  it('terlambat bila melewati 2x interval + toleransi', () => {
    expect(
      nilaiKesehatan({
        interval: 30,
        terakhir: '2026-10-23T08:00:00.000Z', // 2 jam lalu
        statusTerakhir: 'sukses',
        sekarang,
      }),
    ).toBe('terlambat')
  })

  it('cron harian yang jalan 1 hari lalu masih sehat', () => {
    expect(
      nilaiKesehatan({
        interval: 1440,
        terakhir: '2026-10-22T10:00:00.000Z',
        statusTerakhir: 'sukses',
        sekarang,
      }),
    ).toBe('sehat')
  })

  it('setiap kondisi punya tampilan', () => {
    for (const k of ['sehat', 'terlambat', 'gagal', 'belum-pernah', 'dijeda'] as const) {
      expect(TAMPILAN_KESEHATAN[k].label).toBeTruthy()
    }
  })
})

describe('CRON_REGISTRY', () => {
  it('setiap entri memiliki id unik', () => {
    const ids = CRON_REGISTRY.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('setiap jadwal dapat diperkirakan intervalnya', () => {
    for (const c of CRON_REGISTRY) {
      expect(intervalMenit(c.jadwal), `jadwal ${c.id}: ${c.jadwal}`).not.toBeNull()
    }
  })

  it('mengenali jadwal berentang jam seperti "*/5 9-16 * * 1-5"', () => {
    // Regresi: bentuk rentang jam sebelumnya dianggap tidak sah sehingga
    // fungsi mengembalikan null dan cron sehat dilaporkan "tidak diketahui".
    const hasil = intervalMenit('*/5 9-16 * * 1-5')
    expect(hasil).not.toBeNull()
    // Jam 09..16 inklusif tiap 5 menit = 8 jam x 12 = 96 eksekusi/hari;
    // siklus hari kerja memakai 3 hari kalender (Jumat -> Senin).
    expect(hasil).toBe(Math.ceil((3 * 24 * 60) / 96))
    // Rentang terbalik harus ditolak, bukan menghasilkan angka aneh.
    expect(intervalMenit('*/5 16-9 * * 1-5')).toBeNull()
  })

  it('cron Vercel memiliki endpoint, cron VPS memiliki skrip', () => {
    for (const c of CRON_REGISTRY) {
      if (c.lokasi === 'vercel') expect(c.endpoint, c.id).toBeTruthy()
      else expect(c.skrip, c.id).toBeTruthy()
    }
  })

  it('labelWib cocok dengan hasil konversi jadwal (Vercel UTC, VPS zona sistem UTC+8)', () => {
    // LabelWib ditulis manual; test ini memastikan tidak ada salah hitung.
    // Dua kasus nyata yang pernah terjadi:
    //   - "0 9 * * *" di Vercel dikira 09:00 WIB padahal 16:00 WIB
    //   - jadwal VPS dikira WIB padahal host memakai Asia/Shanghai (UTC+8)
    for (const c of CRON_REGISTRY) {
      const hasil = jadwalKeWib(c.jadwal, c.lokasi === 'vercel' ? 'utc' : 'sistem-vps')
      if (!hasil) continue
      for (const jam of hasil.replace(' WIB', '').split(' & ')) {
        expect(c.labelWib, `label ${c.id} tidak memuat ${jam}`).toContain(jam)
      }
    }
  })

  it('semua cron VPS menandai pergeseran zona sistem (-1 jam)', () => {
    for (const c of CRON_REGISTRY.filter((x) => x.lokasi === 'vps')) {
      expect(c.geserWibJam, c.id).toBe(-1)
    }
    // Cron Vercel sudah dalam UTC, tidak memakai penanda ini.
    for (const c of CRON_REGISTRY.filter((x) => x.lokasi === 'vercel')) {
      expect(c.geserWibJam, c.id).toBeUndefined()
    }
  })

  it('cariCron menemukan entri berdasarkan id', () => {
    expect(cariCron('sla-utilitas')?.endpoint).toBe('/api/cron/sla-utilitas')
    expect(cariCron('tidak-ada')).toBeUndefined()
  })
})

describe('jadwalKeWib', () => {
  it('menggeser UTC ke WIB (+7)', () => {
    expect(jadwalKeWib('0 9 * * *')).toBe('16:00 WIB')
    expect(jadwalKeWib('30 0 * * *')).toBe('07:30 WIB')
  })

  it('menangani daftar jam', () => {
    expect(jadwalKeWib('0 0,4 * * *')).toBe('07:00 & 11:00 WIB')
  })

  it('membungkus tengah malam dengan benar', () => {
    // 17:00 UTC = 00:00 WIB keesokan hari
    expect(jadwalKeWib('0 17 * * *')).toBe('00:00 WIB')
  })
})
