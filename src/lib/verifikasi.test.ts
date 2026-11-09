import { describe, expect, it } from 'vitest'
import {
  LABEL_STATUS,
  MODUL_BERVERIFIKASI,
  STATUS_VERIFIKASI,
  bolehDiubah,
  bolehKirim,
  bolehPutuskan,
  catatanPenolakanSah,
  labelStatus,
  modulBerverifikasi,
  tampilDiLaporan,
} from '@/lib/verifikasi'

/**
 * Alur verifikasi bertingkat.
 *
 * Yang dijaga:
 *   1. Hanya data 'disetujui' yang muncul di laporan bagi pengguna biasa.
 *   2. Operator hanya dapat mengirim data miliknya, saat draf/ditolak.
 *   3. Data yang sedang diperiksa ('menunggu') TERKUNCI.
 *   4. Hanya Admin yang boleh memutuskan, dan penolakan wajib bercatatan.
 */

describe('status verifikasi', () => {
  it('empat status dikenali dengan label dan warna', () => {
    expect(STATUS_VERIFIKASI).toEqual(['draft', 'menunggu', 'disetujui', 'ditolak'])
    for (const s of STATUS_VERIFIKASI) {
      expect(LABEL_STATUS[s].label.length).toBeGreaterThan(2)
      expect(LABEL_STATUS[s].tone).toContain('bg-')
    }
  })

  it('status tak dikenal dianggap disetujui (data lama aman)', () => {
    expect(labelStatus(null).label).toBe('Disetujui')
    expect(labelStatus(undefined).label).toBe('Disetujui')
    expect(labelStatus('entah').label).toBe('Disetujui')
  })

  it('hanya draft & ditolak yang boleh diubah', () => {
    expect(bolehDiubah('draft')).toBe(true)
    expect(bolehDiubah('ditolak')).toBe(true)
    expect(bolehDiubah('menunggu')).toBe(false)
    expect(bolehDiubah('disetujui')).toBe(false)
  })
})

describe('tampil di laporan', () => {
  it('pengguna biasa hanya melihat yang disetujui', () => {
    expect(tampilDiLaporan('disetujui', 'Teknis')).toBe(true)
    expect(tampilDiLaporan('draft', 'Teknis')).toBe(false)
    expect(tampilDiLaporan('menunggu', 'Teknis')).toBe(false)
    expect(tampilDiLaporan('ditolak', 'Teknis')).toBe(false)
  })

  it('admin melihat semua status', () => {
    for (const s of STATUS_VERIFIKASI) {
      expect(tampilDiLaporan(s, 'Admin'), s).toBe(true)
    }
  })

  it('data lama tanpa status dianggap sah', () => {
    expect(tampilDiLaporan(null, 'Teknis')).toBe(true)
    expect(tampilDiLaporan(undefined, 'BMN')).toBe(true)
  })
})

describe('izin mengirim data', () => {
  it('pemilik boleh mengirim draf', () => {
    expect(bolehKirim('draft', 'u1', 'u1', 'Teknis')).toEqual({ boleh: true })
  })

  it('pemilik boleh mengirim ulang setelah ditolak', () => {
    expect(bolehKirim('ditolak', 'u1', 'u1', 'Teknis')).toEqual({ boleh: true })
  })

  it('data menunggu terkunci', () => {
    const h = bolehKirim('menunggu', 'u1', 'u1', 'Teknis')
    expect(h.boleh).toBe(false)
  })

  it('data disetujui tidak dapat dikirim lagi', () => {
    const h = bolehKirim('disetujui', 'u1', 'u1', 'Teknis')
    expect(h.boleh).toBe(false)
  })

  it('operator lain tidak boleh mengirim data bukan miliknya', () => {
    const h = bolehKirim('draft', 'u1', 'u2', 'Teknis')
    expect(h.boleh).toBe(false)
  })

  it('admin boleh membantu mengirim data siapa pun', () => {
    expect(bolehKirim('draft', 'u1', 'admin', 'Admin')).toEqual({ boleh: true })
  })

  it('tanpa id pengguna ditolak', () => {
    expect(bolehKirim('draft', 'u1', null, 'Teknis').boleh).toBe(false)
    expect(bolehKirim('draft', null, 'u1', 'Teknis').boleh).toBe(false)
  })
})

describe('izin memutuskan', () => {
  it('admin boleh memutuskan data menunggu', () => {
    expect(bolehPutuskan('Admin', 'menunggu')).toEqual({ boleh: true })
  })

  it('bukan admin ditolak', () => {
    for (const r of ['Teknis', 'BMN', 'Perencanaan', 'Bendahara', 'PPK']) {
      expect(bolehPutuskan(r, 'menunggu').boleh, r).toBe(false)
    }
  })

  it('hanya status menunggu yang dapat diputuskan', () => {
    expect(bolehPutuskan('Admin', 'draft').boleh).toBe(false)
    expect(bolehPutuskan('Admin', 'disetujui').boleh).toBe(false)
    expect(bolehPutuskan('Admin', 'ditolak').boleh).toBe(false)
  })
})

describe('catatan penolakan', () => {
  it('wajib diisi minimal 10 karakter agar bermakna', () => {
    expect(catatanPenolakanSah('')).toBe(false)
    expect(catatanPenolakanSah('   ')).toBe(false)
    // Catatan pendek tidak membantu operator memperbaiki kesalahan.
    expect(catatanPenolakanSah('salah')).toBe(false)
    expect(catatanPenolakanSah('keliru')).toBe(false)
    expect(catatanPenolakanSah('nilai aset keliru')).toBe(true)
    expect(catatanPenolakanSah('  tanggal perolehan salah  ')).toBe(true)
    expect(catatanPenolakanSah(null)).toBe(false)
    expect(catatanPenolakanSah(undefined)).toBe(false)
  })
})

describe('cakupan modul', () => {
  it('tiga modul data resmi memakai verifikasi', () => {
    expect([...MODUL_BERVERIFIKASI]).toEqual(['bmn', 'keuangan', 'persediaan'])
    expect(modulBerverifikasi('bmn')).toBe(true)
    expect(modulBerverifikasi('keuangan')).toBe(true)
    expect(modulBerverifikasi('persediaan')).toBe(true)
  })

  it('DIPA, SK, dan Jadwal tidak memakai verifikasi', () => {
    expect(modulBerverifikasi('dipa')).toBe(false)
    expect(modulBerverifikasi('sk')).toBe(false)
    expect(modulBerverifikasi('jadwal')).toBe(false)
  })
})
