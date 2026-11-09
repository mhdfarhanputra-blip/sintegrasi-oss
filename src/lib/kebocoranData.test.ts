import { describe, expect, it } from 'vitest'
import { MODUL_BERVERIFIKASI, STATUS_TAMPIL_LAPORAN, tampilDiLaporan } from '@/lib/verifikasi'
import { EXPORT_TABLES, canAccessModule } from '@/lib/access'

/**
 * Penjaga regresi: data yang belum sah tidak boleh keluar dari sistem.
 *
 * Latar belakang (bug nyata yang diperbaiki):
 *   Alur verifikasi bertingkat menyatakan "hanya data disetujui yang muncul di
 *   laporan dan ekspor". Kenyataannya tiga jalur keluaran TIDAK menyaring sama
 *   sekali:
 *     - GET /api/laporan/[module]        (laporan HTML resmi)
 *     - GET /api/export/[module]         (CSV)
 *     - GET /api/search                  (pencarian global)
 *   Hanya jalur XLSX yang sudah benar. Akibatnya laporan cetak dan berkas CSV
 *   dapat memuat baris 'draft' (masih diisi operator) maupun 'ditolak' (sudah
 *   dinyatakan salah oleh Admin), dan pengguna non-Admin dapat menemukan data
 *   tersebut lewat pencarian.
 *
 * Test ini tidak menguji HTTP, melainkan mengunci KONTRAK yang dipakai ketiga
 * jalur tersebut: hanya status 'disetujui' yang lolos, kecuali untuk Admin.
 */

describe('kontrak status tampil di laporan', () => {
  it('hanya status "disetujui" yang dianggap tampil', () => {
    expect(STATUS_TAMPIL_LAPORAN).toBe('disetujui')
  })

  it('pengguna biasa tidak melihat draft, menunggu, atau ditolak', () => {
    for (const status of ['draft', 'menunggu', 'ditolak']) {
      expect(tampilDiLaporan(status, 'Bendahara'), status).toBe(false)
      expect(tampilDiLaporan(status, 'Operator Keuangan'), status).toBe(false)
      expect(tampilDiLaporan(status, 'Teknis'), status).toBe(false)
    }
  })

  it('pengguna biasa melihat data yang sudah disetujui', () => {
    expect(tampilDiLaporan('disetujui', 'Bendahara')).toBe(true)
  })

  it('nilai kosong diperlakukan sebagai disetujui (data lama pra-migrasi)', () => {
    // migration_v24 mengisi baris lama dengan 'disetujui'; null tetap harus
    // tampil agar data lama tidak hilang dari laporan.
    expect(tampilDiLaporan(null, 'Bendahara')).toBe(true)
    expect(tampilDiLaporan(undefined, 'Bendahara')).toBe(true)
  })

  it('Admin melihat semua status', () => {
    for (const status of ['draft', 'menunggu', 'ditolak', 'disetujui', null]) {
      expect(tampilDiLaporan(status, 'Admin'), String(status)).toBe(true)
    }
  })
})

describe('modul yang wajib disaring', () => {
  it('modul berverifikasi mencakup ketiga jalur ekspor', () => {
    expect([...MODUL_BERVERIFIKASI].sort()).toEqual(['bmn', 'keuangan', 'persediaan'])
  })

  it('setiap modul berverifikasi memang dapat diekspor', () => {
    // Bila suatu modul berverifikasi tidak ada di EXPORT_TABLES, penyaringan
    // ekspor tidak akan pernah berlaku untuknya — kegagalan senyap.
    for (const modul of MODUL_BERVERIFIKASI) {
      expect(Object.keys(EXPORT_TABLES), modul).toContain(modul)
    }
  })

  it('modul berverifikasi hanya boleh diakses role yang berhak', () => {
    // Pengusul tidak memiliki akses ke modul berverifikasi; pastikan tidak ada
    // kebocoran akses lewat peta role.
    for (const modul of MODUL_BERVERIFIKASI) {
      expect(canAccessModule('Pengusul', modul as 'bmn'), modul).toBe(false)
    }
  })
})
