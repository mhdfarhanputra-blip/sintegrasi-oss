import { describe, it, expect } from 'vitest'
import { ITEMS_PER_PAGE, tahunAnggaranOptions } from './constants'
import { currentYear } from './format'

describe('ITEMS_PER_PAGE', () => {
  it('bernilai 20', () => {
    expect(ITEMS_PER_PAGE).toBe(20)
  })
})

describe('tahunAnggaranOptions', () => {
  it('mengembalikan array berisi number', () => {
    const opsi = tahunAnggaranOptions()
    expect(Array.isArray(opsi)).toBe(true)
    expect(opsi.length).toBeGreaterThan(0)
    opsi.forEach((y) => expect(typeof y).toBe('number'))
  })

  it('hanya memuat tahun >= 2024', () => {
    tahunAnggaranOptions().forEach((y) => expect(y).toBeGreaterThanOrEqual(2024))
  })

  it('terurut menaik', () => {
    const opsi = tahunAnggaranOptions()
    const terurut = [...opsi].sort((a, b) => a - b)
    expect(opsi).toEqual(terurut)
  })

  it('mengandung tahun berjalan', () => {
    expect(tahunAnggaranOptions()).toContain(currentYear())
  })
})
