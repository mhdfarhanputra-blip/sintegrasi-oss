import { describe, expect, it } from 'vitest'
import { normalizeRealisasiRows } from './realisasiStore'

describe('normalizeRealisasiRows', () => {
  it('membersihkan uraian duplikat dan memperbaiki level dasar dari data lama', () => {
    const rows = normalizeRealisasiRows([
      {
        uraian: '521211 521211 521211 521211 521211 Belanja Bahan Belanja Bahan',
        kode_akun: null,
        level: 'item',
        pagu: 1_700_000,
        realisasi_lalu: 0,
        realisasi_ini: 0,
        realisasi_sd: 0,
        persen: 0,
        sisa: 1_700_000,
      },
      {
        uraian: '401.AA 401.AA Monitoring dan Evaluasi Pelaksanaan',
        kode_akun: null,
        level: 'item',
        pagu: 100,
        realisasi_lalu: 0,
        realisasi_ini: 0,
        realisasi_sd: 50,
        persen: 50,
        sisa: 50,
      },
    ])

    expect(rows[0]).toMatchObject({
      uraian: '521211 Belanja Bahan',
      kode_akun: '521211',
      level: 'akun',
    })
    expect(rows[1]).toMatchObject({
      uraian: '401.AA Monitoring dan Evaluasi Pelaksanaan',
      level: 'subkomponen',
    })
  })
})
