import { describe, it, expect } from 'vitest'
import {
  canAccessModule,
  normalizeModuleKey,
  getRoleLabel,
  moduleForPath,
  isAppRole,
} from './access'

describe('canAccessModule', () => {
  it('Admin dapat mengakses keuangan', () => {
    expect(canAccessModule('Admin', 'keuangan')).toBe(true)
  })

  it('Pengusul tidak dapat mengakses keuangan', () => {
    expect(canAccessModule('Pengusul', 'keuangan')).toBe(false)
  })

  it('role null/empty mengembalikan false', () => {
    expect(canAccessModule(null, 'keuangan')).toBe(false)
    expect(canAccessModule('', 'keuangan')).toBe(false)
  })
})

describe('normalizeModuleKey', () => {
  it('alias RKA-KL dan rkakl menjadi dipa', () => {
    expect(normalizeModuleKey('RKA-KL')).toBe('dipa')
    expect(normalizeModuleKey('rkakl')).toBe('dipa')
  })

  it('keuangan tetap keuangan', () => {
    expect(normalizeModuleKey('keuangan')).toBe('keuangan')
  })

  it('null atau nilai tak dikenal mengembalikan null', () => {
    expect(normalizeModuleKey(null)).toBeNull()
    expect(normalizeModuleKey('tidakada')).toBeNull()
  })
})

describe('getRoleLabel', () => {
  it('Teknis dilabeli Operator Satker', () => {
    expect(getRoleLabel('Teknis')).toBe('Operator Satker')
  })

  it('role tak dikenal dikembalikan apa adanya', () => {
    expect(getRoleLabel('Bukan')).toBe('Bukan')
  })
})

describe('moduleForPath', () => {
  it('path persis cocok', () => {
    expect(moduleForPath('/keuangan')).toBe('keuangan')
  })

  it('path dengan sub-segmen cocok', () => {
    expect(moduleForPath('/keuangan/123')).toBe('keuangan')
  })

  it('path tak dikenal mengembalikan null', () => {
    expect(moduleForPath('/zzz')).toBeNull()
  })
})

describe('isAppRole', () => {
  it('Admin adalah role aplikasi', () => {
    expect(isAppRole('Admin')).toBe(true)
  })

  it('Bukan bukan role aplikasi', () => {
    expect(isAppRole('Bukan')).toBe(false)
  })
})
