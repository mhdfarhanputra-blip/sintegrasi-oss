import { describe, expect, it } from 'vitest'
import { normalizeUraian } from './realisasiNormalize'

describe('normalizeUraian', () => {
  it('menghapus kode dan judul berulang dari hasil merge Excel', () => {
    expect(normalizeUraian('521211 521211 521211 521211 521211 Belanja Bahan Belanja Bahan Belanja Bahan')).toBe('521211 Belanja Bahan')
    expect(normalizeUraian('401.AA 401.AA Monitoring dan Evaluasi Pelaksanaan Monitoring dan Evaluasi Pelaksanaan')).toBe('401.AA Monitoring dan Evaluasi Pelaksanaan')
  })

  it('menghapus pengulangan frasa panjang yang berdekatan', () => {
    expect(
      normalizeUraian('000033. Biaya Tiket Pesawat Kota A Kota B 000033. Biaya Tiket Pesawat Kota A Kota B'),
    ).toBe('000033. Biaya Tiket Pesawat Kota A Kota B')
  })
})
