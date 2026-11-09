import { describe, expect, it } from 'vitest'
import {
  MODULE_ROLES,
  ROLES,
  canAccessModule,
  getRoleLabel,
  isAppRole,
  moduleForPath,
  normalizeModuleKey,
} from '@/lib/access'

/**
 * Pengujian otorisasi modul.
 *
 * Ini jalur keamanan paling penting di aplikasi: bila `canAccessModule`
 * keliru mengembalikan true, pengguna bisa membuka modul di luar haknya.
 * Karena itu kasus negatif (harus DITOLAK) diuji sebanyak kasus positif.
 */

describe('isAppRole', () => {
  it('menerima semua role sah', () => {
    for (const role of ROLES) expect(isAppRole(role)).toBe(true)
  })

  it('menolak nilai tak dikenal, kosong, dan null', () => {
    for (const role of ['admin', 'ADMIN', 'Superuser', '', null, undefined, '0']) {
      expect(isAppRole(role as string | null | undefined)).toBe(false)
    }
  })
})

describe('canAccessModule — kasus positif', () => {
  it('Admin boleh mengakses semua modul', () => {
    for (const modul of Object.keys(MODULE_ROLES) as Array<keyof typeof MODULE_ROLES>) {
      expect(canAccessModule('Admin', modul)).toBe(true)
    }
  })

  it('setiap role boleh mengakses modul yang terdaftar untuknya', () => {
    for (const [modul, roles] of Object.entries(MODULE_ROLES)) {
      for (const role of roles) {
        expect(canAccessModule(role, modul as keyof typeof MODULE_ROLES)).toBe(true)
      }
    }
  })
})

describe('canAccessModule — kasus negatif (harus DITOLAK)', () => {
  it('menolak role null/undefined/tak dikenal', () => {
    for (const role of [null, undefined, 'Hacker', '']) {
      expect(canAccessModule(role as string | null | undefined, 'keuangan')).toBe(false)
    }
  })

  it('Pengusul tidak boleh masuk modul pengguna (khusus Admin)', () => {
    expect(canAccessModule('Pengusul', 'pengguna')).toBe(false)
    expect(canAccessModule('Pengusul', 'cms')).toBe(false)
    expect(canAccessModule('Pengusul', 'audit')).toBe(false)
  })

  it('BMN tidak boleh mengakses keuangan', () => {
    expect(canAccessModule('BMN', 'keuangan')).toBe(false)
  })

  it('Teknis tidak boleh mengakses modul BMN', () => {
    expect(canAccessModule('Teknis', 'bmn')).toBe(false)
  })

  it('modul khusus Admin hanya boleh Admin', () => {
    for (const modul of ['pengguna', 'cms', 'audit'] as const) {
      for (const role of ROLES.filter((r) => r !== 'Admin')) {
        expect(canAccessModule(role, modul)).toBe(false)
      }
    }
  })
})

describe('normalizeModuleKey', () => {
  it('mengubah nama modul menjadi kunci yang sah', () => {
    expect(normalizeModuleKey('DIPA')).toBe('dipa')
    expect(normalizeModuleKey('dipa')).toBe('dipa')
    expect(normalizeModuleKey('  Keuangan  ')).toBe('keuangan')
  })

  it('menolak modul tak dikenal (mencegah lolos validasi upload)', () => {
    for (const v of ['', '   ', null, undefined, 'rahasia', '../../etc', 'admin']) {
      expect(normalizeModuleKey(v as string | null | undefined)).toBeNull()
    }
  })
})

describe('moduleForPath', () => {
  it('memetakan path dashboard ke modul yang benar', () => {
    expect(moduleForPath('/keuangan')).toBe('keuangan')
    expect(moduleForPath('/keuangan/detail')).toBe('keuangan')
    expect(moduleForPath('/bmn')).toBe('bmn')
  })

  it('memetakan halaman beranda ke modul dashboard', () => {
    expect(moduleForPath('/')).toBe('dashboard')
  })

  it('mengembalikan null untuk path di luar modul', () => {
    expect(moduleForPath('/login')).toBeNull()
    expect(moduleForPath('/halaman-tidak-ada')).toBeNull()
    expect(moduleForPath('/reset-password')).toBeNull()
  })
})

describe('getRoleLabel', () => {
  it('memberi label yang mudah dibaca', () => {
    expect(getRoleLabel('Teknis')).toBe('Operator Satker')
    expect(getRoleLabel('Perencanaan')).toBe('Operator Perencanaan')
  })

  it('mengembalikan nilai asli bila tidak dikenal', () => {
    expect(getRoleLabel('Entah')).toBe('Entah')
  })
})
