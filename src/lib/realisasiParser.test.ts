import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseExcelToRealisasi } from './realisasiParser'

function setRow(sheet: ExcelJS.Worksheet, rowNumber: number, cells: Record<number, string | number>) {
  const row = sheet.getRow(rowNumber)
  for (const [column, value] of Object.entries(cells)) row.getCell(Number(column)).value = value
}

async function workbookBuffer(sheetRows: Array<[number, Record<number, string | number>]>) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('GLP039_LAPORAN REALISASI SUPER')
  for (const [rowNumber, cells] of sheetRows) setRow(sheet, rowNumber, cells)
  return workbook.xlsx.writeBuffer()
}

describe('parseExcelToRealisasi', () => {
  it('membaca format FA Detail 16 segmen dengan cell merge berulang', async () => {
    const buffer = await workbookBuffer([
      [
        9,
        {
          1: 'JUMLAH SELURUHNYA',
          2: 'JUMLAH SELURUHNYA',
          16: 'JUMLAH SELURUHNYA',
          17: 11_435_801_000,
          23: 4_296_313_055,
          24: 983_747_136,
          26: 5_280_060_191,
          29: 0.4617131927,
          31: 6_155_740_809,
        },
      ],
      [
        10,
        {
          2: 'GA',
          3: 'GA',
          4: 'Program Infrastruktur Konektivitas',
          16: 'Program Infrastruktur Konektivitas',
          17: 10_814_731_000,
          23: 4_061_393_489,
          24: 974_847_136,
          26: 5_036_240_625,
          29: 0.4656833928,
          31: 5_778_490_375,
        },
      ],
      [
        11,
        {
          2: 'GA.7696',
          9: 'Pembangunan dan Preservasi Jalan Nasional',
          16: 'Pembangunan dan Preservasi Jalan Nasional',
          17: 10_814_731_000,
          26: 5_036_240_625,
          29: 0.4656833928,
          31: 5_778_490_375,
        },
      ],
      [
        12,
        {
          3: 'CBR',
          7: 'Dukungan Teknis',
          16: 'Dukungan Teknis',
          17: 10_814_731_000,
          26: 5_036_240_625,
          29: 0.4656833928,
          31: 5_778_490_375,
        },
      ],
      [
        13,
        {
          3: 'CBR.001',
          11: 'Layanan Penyiapan dan Pengendalian Pelaksanaan',
          16: 'Layanan Penyiapan dan Pengendalian Pelaksanaan',
          17: 441_855_000,
          26: 255_794_435,
          29: 0.5789103552,
          31: 186_060_565,
        },
      ],
      [
        14,
        {
          5: 401,
          6: 401,
          10: 'Monitoring Dan Evaluasi',
          16: 'Monitoring Dan Evaluasi',
          17: 243_855_000,
          23: 95_911_267,
          24: 9_883_168,
          26: 105_794_435,
          29: 0.4338415656,
          31: 138_060_565,
        },
      ],
      [
        15,
        {
          6: '401.AA',
          12: 'Monitoring dan Evaluasi Pelaksanaan Paket-Paket Jalan Nasional Satker',
          16: 'Monitoring dan Evaluasi Pelaksanaan Paket-Paket Jalan Nasional Satker',
          17: 109_406_000,
          26: 36_295_248,
          29: 0.3317482404,
          31: 73_110_752,
        },
      ],
      [
        16,
        {
          8: 521211,
          12: 521211,
          13: 'Belanja Bahan',
          16: 'Belanja Bahan',
          17: 1_700_000,
          26: 0,
          29: 0,
          31: 1_700_000,
        },
      ],
      [
        17,
        {
          14: '000010. Biaya Penggandaan laporan',
          16: '000010. Biaya Penggandaan laporan',
          17: 500_000,
          26: 0,
          29: 0,
          31: 500_000,
        },
      ],
    ])

    const rows = await parseExcelToRealisasi(buffer)

    expect(rows).toHaveLength(9)
    expect(rows[0]).toMatchObject({
      uraian: 'JUMLAH SELURUHNYA',
      level: 'total',
      pagu: 11_435_801_000,
      realisasi_sd: 5_280_060_191,
      persen: 46.17,
    })
    expect(rows[1]).toMatchObject({
      uraian: 'GA Program Infrastruktur Konektivitas',
      level: 'program',
    })
    expect(rows[2]).toMatchObject({
      uraian: 'GA.7696 Pembangunan dan Preservasi Jalan Nasional',
      level: 'kegiatan',
    })
    expect(rows[3]).toMatchObject({
      uraian: 'CBR Dukungan Teknis',
      level: 'kro',
    })
    expect(rows[4]).toMatchObject({
      uraian: 'CBR.001 Layanan Penyiapan dan Pengendalian Pelaksanaan',
      level: 'ro',
    })
    expect(rows[5]).toMatchObject({
      uraian: '401 Monitoring Dan Evaluasi',
      kode_akun: null,
      level: 'komponen',
    })
    expect(rows[6]).toMatchObject({
      uraian: '401.AA Monitoring dan Evaluasi Pelaksanaan Paket-Paket Jalan Nasional Satker',
      level: 'subkomponen',
    })
    expect(rows[7]).toMatchObject({
      uraian: '521211 Belanja Bahan',
      kode_akun: '521211',
      level: 'akun',
    })
    expect(rows[8]).toMatchObject({
      uraian: '000010. Biaya Penggandaan laporan',
      level: 'detail',
    })
  })

  it('membaca tabel biasa berdasarkan header meskipun urutan kolom berbeda', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Kosong')
    const sheet = workbook.addWorksheet('Upload Manual')
    setRow(sheet, 1, {
      1: 'Kode Akun',
      2: 'Uraian',
      3: 'Level',
      4: 'Sisa Anggaran',
      5: 'Realisasi s.d. Periode',
      6: 'Pagu Revisi',
      7: '%',
    })
    setRow(sheet, 2, {
      1: 521211,
      2: 'Belanja Bahan',
      3: 'akun',
      4: 1_000_000,
      5: 2_000_000,
      6: 3_000_000,
      7: '66,67%',
    })

    const rows = await parseExcelToRealisasi(await workbook.xlsx.writeBuffer())

    expect(rows).toEqual([
      {
        uraian: 'Belanja Bahan',
        kode_akun: '521211',
        level: 'akun',
        pagu: 3_000_000,
        realisasi_lalu: 0,
        realisasi_ini: 0,
        realisasi_sd: 2_000_000,
        persen: 66.67,
        sisa: 1_000_000,
      },
    ])
  })
})
