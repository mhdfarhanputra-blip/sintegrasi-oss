import { describe, expect, it } from 'vitest'
import { MODULE_ALIASES, canAccessModule, normalizeModuleKey } from '@/lib/access'

/**
 * Pengujian regresi modul unggahan.
 *
 * BUG YANG DICEGAH: menu CMS (pusat unggah dokumen) mengirim modul 'cms',
 * tetapi MODULE_ALIASES tidak memuatnya sehingga normalizeModuleKey
 * mengembalikan null dan seluruh unggahan lewat CMS ditolak HTTP 400.
 *
 * Daftar modul di bawah berasal dari pemakaian nyata `<FileUpload modul="...">`
 * di seluruh aplikasi. Bila ada modul baru dipakai tanpa alias, pengujian ini
 * akan gagal sebelum sampai ke produksi.
 */
const MODUL_DIPAKAI_UI = ['BMN', 'DIPA', 'Keuangan', 'Persediaan', 'SK', 'utilitas', 'cms']

describe('modul unggahan dikenali', () => {
  it.each(MODUL_DIPAKAI_UI)('modul "%s" dapat dinormalisasi', (modul) => {
    expect(normalizeModuleKey(modul)).not.toBeNull()
  })

  it('CMS dikenali meski huruf besar/kecil berbeda', () => {
    expect(normalizeModuleKey('cms')).toBe('cms')
    expect(normalizeModuleKey('CMS')).toBe('cms')
    expect(normalizeModuleKey('  cms  ')).toBe('cms')
  })

  it('alias dokumen dan arsip mengarah ke cms', () => {
    expect(normalizeModuleKey('dokumen')).toBe('cms')
    expect(normalizeModuleKey('arsip')).toBe('cms')
  })

  it('RKAKL tetap dipetakan ke modul dipa', () => {
    expect(normalizeModuleKey('rkakl')).toBe('dipa')
    expect(normalizeModuleKey('rka-kl')).toBe('dipa')
  })

  it('modul tak dikenal tetap ditolak', () => {
    expect(normalizeModuleKey('entah')).toBeNull()
    expect(normalizeModuleKey('')).toBeNull()
  })

  it('setiap alias menunjuk ke modul yang sah', () => {
    for (const [alias, target] of Object.entries(MODULE_ALIASES)) {
      expect(target, `alias ${alias}`).toBeTruthy()
    }
  })
})

describe('hak akses modul upload', () => {
  it('Admin boleh mengunggah ke CMS', () => {
    expect(canAccessModule('Admin', 'cms')).toBe(true)
  })

  it('Teknis tidak boleh mengunggah ke CMS', () => {
    expect(canAccessModule('Teknis', 'cms')).toBe(false)
  })
})
