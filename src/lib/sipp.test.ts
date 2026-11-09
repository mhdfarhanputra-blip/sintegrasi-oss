import { describe, expect, it } from 'vitest'
import { emptySippDataset, umurJam, SIPP_PATH, SIPP_BUCKET } from '@/lib/sippStore'
import { MODULE_ALIASES, canAccessModule, normalizeModuleKey } from '@/lib/access'

/**
 * Modul SIPP.
 *
 * Yang dijaga:
 *   1. Modul dikenali sistem akses (tanpa ini halaman & API menolak 400/redirect).
 *   2. Data SIPP memuat nama rekanan & nilai kontrak -> TIDAK boleh publik.
 *   3. Dataset kosong tetap berbentuk sah sehingga UI tidak error.
 *   4. Umur data dihitung benar (dipakai untuk peringatan data basi).
 */

describe('modul sipp terdaftar', () => {
  it('nama modul dapat dinormalisasi', () => {
    expect(normalizeModuleKey('sipp')).toBe('sipp')
    expect(normalizeModuleKey('SIPP')).toBe('sipp')
    expect(normalizeModuleKey('  sipp  ')).toBe('sipp')
  })

  it('alias menunjuk ke sipp', () => {
    expect(MODULE_ALIASES['paket-kontraktual']).toBe('sipp')
    expect(MODULE_ALIASES['kontraktual']).toBe('sipp')
  })

  it('role yang berwenang dapat mengakses', () => {
    for (const role of ['Admin', 'Perencanaan', 'Teknis', 'PPK', 'PPSPM', 'Bendahara', 'BMN', 'Operator Keuangan']) {
      expect(canAccessModule(role, 'sipp'), role).toBe(true)
    }
  })

  it('role tanpa kewenangan ditolak', () => {
    expect(canAccessModule('Pengusul', 'sipp')).toBe(false)
    expect(canAccessModule(undefined, 'sipp')).toBe(false)
    expect(canAccessModule(null, 'sipp')).toBe(false)
  })
})

describe('penyimpanan sipp', () => {
  it('memakai bucket dan jalur yang konsisten', () => {
    expect(SIPP_BUCKET).toBe('dokumen')
    expect(SIPP_PATH).toBe('sipp/data.json')
  })

  it('dataset kosong tetap berbentuk sah', () => {
    const d = emptySippDataset()
    expect(d.ok).toBe(false)
    expect(d.paket).toEqual([])
    expect(d.perSatker).toEqual([])
    expect(d.ringkasan.jumlahPaket).toBe(0)
    expect(d.ringkasan.rerataFisik).toBeNull()
  })
})

describe('umurJam', () => {
  it('null bila waktu tidak diketahui', () => {
    expect(umurJam('')).toBeNull()
    expect(umurJam('bukan-tanggal')).toBeNull()
  })

  it('menghitung jam sejak publikasi', () => {
    const duaJamLalu = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const hasil = umurJam(duaJamLalu)
    expect(hasil).not.toBeNull()
    expect(hasil!).toBeGreaterThan(1.9)
    expect(hasil!).toBeLessThan(2.1)
  })

  it('tidak pernah negatif meski jam perangkat lebih lambat', () => {
    const masaDepan = new Date(Date.now() + 5 * 3_600_000).toISOString()
    expect(umurJam(masaDepan)).toBe(0)
  })
})
