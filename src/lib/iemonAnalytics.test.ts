import { describe, it, expect } from 'vitest'
import {
  buildIemonDashboardState,
  defaultIemonLevel,
  levelOptions,
} from '@/lib/iemonAnalytics'
import type {
  IemonDataset,
  IemonPaketRow,
  IemonKontraktualRow,
  IemonRkaklRow,
} from '@/lib/iemonParser'

// Factory: baris paket dengan semua field wajib terisi default, lalu override sebagian.
function makePaket(partial: Partial<IemonPaketRow> = {}): IemonPaketRow {
  return {
    source: 'paket',
    kode: '',
    label: '',
    cleanLabel: '',
    category: 'lainnya',
    programCode: '',
    kegiatanCode: '',
    kroCode: '',
    roCode: '',
    komponenCode: '',
    subkomponenCode: '',
    detilCode: '',
    kdsatker: '',
    kdunit: '',
    kdprogram: '',
    kdgiat: '',
    kdoutput: '',
    kdsoutput: '',
    kdkmpnen: '',
    kdskmpnen: '',
    metode: null,
    pengadaan: null,
    volume: 0,
    satuan: null,
    tanggalMulai: null,
    tanggalSelesai: null,
    pagu51: 0,
    pagu52: 0,
    pagu53: 0,
    paguRpm: 0,
    paguSbsn: 0,
    paguPhln: 0,
    paguTotal: 0,
    real51: 0,
    real52: 0,
    real53: 0,
    realRpm: 0,
    realSbsn: 0,
    realPhln: 0,
    realTotal: 0,
    progressKeuangan: 0,
    progressFisik: 0,
    monthlyPlanFinance: [],
    monthlyActualFinance: [],
    monthlyPlanPhysical: [],
    monthlyActualPhysical: [],
    ...partial,
  }
}

// Factory: baris kontraktual lengkap.
function makeKontrak(partial: Partial<IemonKontraktualRow> = {}): IemonKontraktualRow {
  return {
    source: 'kontraktual',
    kode: '',
    label: '',
    cleanLabel: '',
    category: 'lainnya',
    programCode: '',
    kegiatanCode: '',
    kroCode: '',
    roCode: '',
    komponenCode: '',
    subkomponenCode: '',
    detilCode: '',
    kdsatker: '',
    metode: null,
    jenisKontrak: null,
    volume: 0,
    satuan: null,
    tanggalMulai: null,
    tanggalSelesai: null,
    jadwalPengumuman: null,
    jadwalPemenang: null,
    jadwalKontrak: null,
    status: null,
    nilaiKontrak: 0,
    nomorKontrak: null,
    rekanan: null,
    npwp: null,
    paguRpm: 0,
    paguSbsn: 0,
    paguPhln: 0,
    paguTotalDipa: 0,
    paguPengadaan: 0,
    realisasi: 0,
    progressKeuangan: 0,
    progressFisik: 0,
    ...partial,
  }
}

// Factory: baris RKAKL lengkap.
function makeRkakl(partial: Partial<IemonRkaklRow> = {}): IemonRkaklRow {
  return {
    source: 'rkakl',
    kode: '',
    label: '',
    cleanLabel: '',
    category: 'lainnya',
    programCode: '',
    kegiatanCode: '',
    kroCode: '',
    roCode: '',
    komponenCode: '',
    subkomponenCode: '',
    detilCode: '',
    kdsatker: '',
    kdunit: '',
    kdprogram: '',
    kdgiat: '',
    kdoutput: '',
    kdsoutput: '',
    kdkmpnen: '',
    kdskmpnen: '',
    kdakun: '',
    noitem: '',
    header1: null,
    header2: null,
    volume: 0,
    satuan: null,
    hargaSatuan: 0,
    jumlah: 0,
    paguPhln: 0,
    paguRmp: 0,
    paguRkp: 0,
    blokir: 0,
    monthlyBudget: [],
    ...partial,
  }
}

function makeDataset(partial: Partial<IemonDataset> = {}): IemonDataset {
  return {
    uploadedAt: '2026-01-01T00:00:00.000Z',
    sourceFiles: { paket: null, kontraktual: null, rkakl: null },
    paket: [],
    kontraktual: [],
    rkakl: [],
    ...partial,
  }
}

describe('levelOptions', () => {
  it('mengembalikan 7 level dengan key & label', () => {
    const options = levelOptions()
    expect(options).toHaveLength(7)
    expect(options.map((o) => o.key)).toEqual([
      'program',
      'kegiatan',
      'kro',
      'ro',
      'komponen',
      'subkomponen',
      'detil',
    ])
    options.forEach((o) => {
      expect(typeof o.label).toBe('string')
      expect(o.label.length).toBeGreaterThan(0)
    })
  })
})

describe('buildIemonDashboardState - dataset kosong', () => {
  it('mengembalikan summary nol tanpa melempar error', () => {
    const state = buildIemonDashboardState(makeDataset())
    expect(state.summary.totalPaguRkakl).toBe(0)
    expect(state.summary.totalPaguPaket).toBe(0)
    expect(state.summary.totalRealisasiPaket).toBe(0)
    expect(state.summary.paketCount).toBe(0)
    expect(state.summary.serapanPaket).toBe(0)
    expect(state.comparisonRows).toEqual([])
    expect(state.contractRisks).toEqual([])
    expect(state.availableLevels).toEqual([])
  })
})

describe('buildIemonDashboardState - 1 paket + 1 rkakl pada level komponen', () => {
  const dataset = makeDataset({
    paket: [
      makePaket({
        label: 'Paket Uji',
        komponenCode: '001.01.02',
        paguTotal: 1_000_000_000,
        realTotal: 250_000_000,
        progressFisik: 30,
        progressKeuangan: 25,
      }),
    ],
    rkakl: [
      makeRkakl({
        label: 'RKAKL Uji',
        komponenCode: '001.01.02',
        jumlah: 1_000_000_000,
      }),
    ],
  })

  it('menghitung summary paket dengan benar', () => {
    const state = buildIemonDashboardState(dataset, 'komponen')
    expect(state.level).toBe('komponen')
    expect(state.summary.totalPaguPaket).toBeCloseTo(1_000_000_000, 2)
    expect(state.summary.totalRealisasiPaket).toBeCloseTo(250_000_000, 2)
    expect(state.summary.serapanPaket).toBeCloseTo(25, 2)
    expect(state.summary.paketCount).toBe(1)
    expect(state.summary.totalPaguRkakl).toBeCloseTo(1_000_000_000, 2)
  })

  it('membentuk satu grup comparison dengan kode komponen', () => {
    const state = buildIemonDashboardState(dataset, 'komponen')
    expect(state.comparisonRows).toHaveLength(1)
    const row = state.comparisonRows[0]
    expect(row.code).toBe('001.01.02')
    // Setelah perbaikan double-count: nilai paket dihitung sekali.
    expect(row.paketPagu).toBeCloseTo(1_000_000_000, 2)
    expect(row.paketRealisasi).toBeCloseTo(250_000_000, 2)
    expect(row.serapan).toBeCloseTo(25, 2)
    expect(row.rkaklPagu).toBeCloseTo(1_000_000_000, 2)
  })
})

describe('buildIemonDashboardState - paket tanpa realisasi', () => {
  it('mencatat paketZero dan riskNote belum ada realisasi', () => {
    const dataset = makeDataset({
      paket: [
        makePaket({
          label: 'Paket Belum Realisasi',
          komponenCode: '001.01.03',
          paguTotal: 500_000_000,
          realTotal: 0,
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')
    expect(state.summary.paketZero).toBeGreaterThanOrEqual(1)
    expect(state.riskNotes.some((note) => note.includes('belum ada realisasi'))).toBe(true)
  })
})

describe('buildIemonDashboardState - kontrak ikut teragregasi', () => {
  it('menjumlahkan totalKontrak dari baris kontraktual', () => {
    const dataset = makeDataset({
      kontraktual: [
        makeKontrak({
          label: 'Kontrak Uji',
          komponenCode: '001.01.02',
          paguTotalDipa: 800_000_000,
          nilaiKontrak: 750_000_000,
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')
    expect(state.summary.totalKontrak).toBeCloseTo(750_000_000, 2)
    expect(state.summary.kontrakCount).toBe(1)
  })
})

describe('defaultIemonLevel', () => {
  it('mengembalikan komponen ketika komponenCode terisi', () => {
    const dataset = makeDataset({
      paket: [makePaket({ komponenCode: '001.01.02', paguTotal: 1 })],
    })
    expect(defaultIemonLevel(dataset)).toBe('komponen')
  })
})

// Helper: array kumulatif 12 bulan dengan nilai sama di setiap bulan.
// Nilai konstan membuat hasil deviasi tidak bergantung pada bulan berjalan,
// karena detectPeriodeIndex => min(11, bulanSekarang) selalu menunjuk bulan
// dengan nilai yang sama.
// PENTING: rencana diprorate per-hari dari dataset.uploadedAt (calculateDailyPlan),
// jadi dataset uji WAJIB pakai uploadedAt akhir bulan agar bobot = nilai bulan penuh.
const END_OF_MONTH_UPLOADED_AT = '2026-10-31T23:59:59.000Z'
function filled12(value: number): number[] {
  return Array.from({ length: 12 }, () => value)
}

describe('buildIemonDashboardState - kinerja & deviasi (tahan-banting tanggal)', () => {
  it('1. paket tertinggal berat diklasifikasikan kritis (deviasi ~ -35)', () => {
    const dataset = makeDataset({
      uploadedAt: END_OF_MONTH_UPLOADED_AT,
      paket: [
        makePaket({
          kode: 'PKT-01',
          label: 'Paket Tertinggal Berat',
          cleanLabel: 'Paket Tertinggal Berat',
          komponenCode: '001.01.02',
          paguTotal: 1_000_000_000,
          monthlyPlanPhysical: filled12(80),
          monthlyActualPhysical: filled12(45),
          monthlyPlanFinance: filled12(80),
          monthlyActualFinance: filled12(45),
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')

    expect(state.kinerja.rencanaFisik).toBeCloseTo(80, 1)
    expect(state.kinerja.realisasiFisik).toBeCloseTo(45, 1)
    expect(state.kinerja.deviasiFisik).toBeCloseTo(-35, 1)
    expect(state.kinerja.status).toBe('kritis')

    expect(state.deviationRows).toHaveLength(1)
    expect(state.deviationRows[0].status).toBe('kritis')
    expect(state.deviationRows[0].deviasiFisik).toBeCloseTo(-35, 1)
    expect(state.kinerja.paketKritis).toBeGreaterThanOrEqual(1)
  })

  it('2. paket on-track (deviasi +2) berstatus on-track', () => {
    const dataset = makeDataset({
      uploadedAt: END_OF_MONTH_UPLOADED_AT,
      paket: [
        makePaket({
          kode: 'PKT-02',
          label: 'Paket On Track',
          cleanLabel: 'Paket On Track',
          komponenCode: '001.01.02',
          paguTotal: 1_000_000_000,
          monthlyPlanPhysical: filled12(50),
          monthlyActualPhysical: filled12(52),
          monthlyPlanFinance: filled12(50),
          monthlyActualFinance: filled12(52),
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')

    expect(state.kinerja.deviasiFisik).toBeCloseTo(2, 1)
    expect(state.kinerja.status).toBe('on-track')
    expect(state.kinerja.paketOnTrack).toBeGreaterThanOrEqual(1)
    expect(state.deviationRows[0].status).toBe('on-track')
  })

  it('3. paket tertinggal sedang (deviasi -8) berstatus tertinggal', () => {
    const dataset = makeDataset({
      uploadedAt: END_OF_MONTH_UPLOADED_AT,
      paket: [
        makePaket({
          kode: 'PKT-03',
          label: 'Paket Tertinggal Sedang',
          cleanLabel: 'Paket Tertinggal Sedang',
          komponenCode: '001.01.02',
          paguTotal: 1_000_000_000,
          monthlyPlanPhysical: filled12(50),
          monthlyActualPhysical: filled12(42),
          monthlyPlanFinance: filled12(50),
          monthlyActualFinance: filled12(42),
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')

    expect(state.kinerja.deviasiFisik).toBeCloseTo(-8, 1)
    expect(state.kinerja.status).toBe('tertinggal')
    expect(state.deviationRows[0].status).toBe('tertinggal')
    expect(state.kinerja.paketTertinggal).toBeGreaterThanOrEqual(1)
  })

  it('4. deviationRows terurut: deviasi paling negatif tampil lebih dulu', () => {
    const dataset = makeDataset({
      uploadedAt: END_OF_MONTH_UPLOADED_AT,
      paket: [
        makePaket({
          kode: 'PKT-OK',
          label: 'Paket Aman',
          cleanLabel: 'Paket Aman',
          komponenCode: '001.01.02',
          paguTotal: 1_000_000_000,
          monthlyPlanPhysical: filled12(50),
          monthlyActualPhysical: filled12(52),
          monthlyPlanFinance: filled12(50),
          monthlyActualFinance: filled12(52),
        }),
        makePaket({
          kode: 'PKT-BAD',
          label: 'Paket Terburuk',
          cleanLabel: 'Paket Terburuk',
          komponenCode: '001.01.03',
          paguTotal: 1_000_000_000,
          monthlyPlanPhysical: filled12(80),
          monthlyActualPhysical: filled12(45),
          monthlyPlanFinance: filled12(80),
          monthlyActualFinance: filled12(45),
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')

    expect(state.deviationRows).toHaveLength(2)
    expect(state.deviationRows[0].deviasiFisik).toBeCloseTo(-35, 1)
    expect(state.deviationRows[0].code).toBe('PKT-BAD')
    expect(state.deviationRows[0].status).toBe('kritis')
    expect(state.deviationRows[1].deviasiFisik).toBeCloseTo(2, 1)
    // Terurut menaik: row pertama harus <= row kedua.
    expect(state.deviationRows[0].deviasiFisik).toBeLessThanOrEqual(
      state.deviationRows[1].deviasiFisik,
    )
  })

  it('5. dataset kosong: deviasi 0, on-track, deviationRows kosong (tanpa error)', () => {
    const state = buildIemonDashboardState(makeDataset())
    expect(state.kinerja.deviasiFisik).toBeCloseTo(0, 5)
    expect(state.kinerja.status).toBe('on-track')
    expect(state.deviationRows).toEqual([])
  })
})

describe('buildIemonDashboardState - combinedRows (gabungan Paket + Kontraktual)', () => {
  it('1. paket + kontrak kode sama digabung jadi satu baris dengan field lengkap', () => {
    const dataset = makeDataset({
      uploadedAt: END_OF_MONTH_UPLOADED_AT,
      paket: [
        makePaket({
          kode: '04.X.001',
          label: 'Paket Gabung',
          cleanLabel: 'Paket Gabung',
          komponenCode: '001.01.02',
          paguTotal: 1_000_000_000,
          monthlyPlanPhysical: filled12(80),
          monthlyActualPhysical: filled12(45),
          monthlyPlanFinance: filled12(80),
          monthlyActualFinance: filled12(45),
        }),
      ],
      kontraktual: [
        makeKontrak({
          kode: '04.X.001',
          label: 'Kontrak Gabung',
          cleanLabel: 'Kontrak Gabung',
          komponenCode: '001.01.02',
          nilaiKontrak: 900_000_000,
          paguTotalDipa: 1_000_000_000,
          tanggalMulai: '2026-03-02',
          tanggalSelesai: '2026-12-10',
          jadwalKontrak: '2026-02-11',
          status: 'Terkontrak',
          rekanan: 'PT Uji',
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')

    expect(state.combinedRows).toHaveLength(1)
    const row = state.combinedRows[0]
    expect(row.kode).toBe('04.X.001')
    expect(row.nilaiKontrak).toBeCloseTo(900_000_000, 1)
    expect(row.pagu).toBeCloseTo(1_000_000_000, 1)
    expect(row.rencanaFisik).toBeCloseTo(80, 1)
    expect(row.realisasiFisik).toBeCloseTo(45, 1)
    expect(row.deviasiFisik).toBeCloseTo(-35, 1)
    expect(row.status).toBe('kritis')
    expect(row.statusKontrak).toBe('Terkontrak')
    expect(row.rekanan).toBe('PT Uji')
    expect(row.tanggalKontrak).toContain('2026-02-11')
    expect(typeof row.masaPelaksanaanHari).toBe('number')
    expect(row.masaPelaksanaanHari as number).toBeGreaterThan(0)
  })

  it('2. kontrak tanpa paket tetap muncul sebagai baris (pagu dari paguTotalDipa)', () => {
    const dataset = makeDataset({
      kontraktual: [
        makeKontrak({
          kode: '07.Z.999',
          label: 'Kontrak Konsultansi',
          cleanLabel: 'Kontrak Konsultansi',
          komponenCode: '001.01.05',
          nilaiKontrak: 350_000_000,
          paguTotalDipa: 400_000_000,
          progressFisik: 60,
          progressKeuangan: 55,
          status: 'Terkontrak',
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')

    expect(state.combinedRows).toHaveLength(1)
    const row = state.combinedRows[0]
    expect(row.kode).toBe('07.Z.999')
    expect(row.pagu).toBeCloseTo(400_000_000, 1)
    expect(row.nilaiKontrak).toBeCloseTo(350_000_000, 1)
    expect(row.rencanaFisik).toBeCloseTo(0, 1)
    expect(row.realisasiFisik).toBeCloseTo(60, 1)
  })

  it('3. paket tanpa kontrak: statusKontrak "Belum Kontrak" & nilaiKontrak 0', () => {
    const dataset = makeDataset({
      paket: [
        makePaket({
          kode: '04.X.777',
          label: 'Paket Tanpa Kontrak',
          cleanLabel: 'Paket Tanpa Kontrak',
          komponenCode: '001.01.02',
          paguTotal: 500_000_000,
          monthlyPlanPhysical: filled12(50),
          monthlyActualPhysical: filled12(50),
          monthlyPlanFinance: filled12(50),
          monthlyActualFinance: filled12(50),
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')

    expect(state.combinedRows).toHaveLength(1)
    const row = state.combinedRows[0]
    expect(row.kode).toBe('04.X.777')
    expect(row.statusKontrak).toBe('Belum Kontrak')
    expect(row.nilaiKontrak).toBeCloseTo(0, 5)
  })

  it('4. combinedRows terurut: deviasi paling negatif tampil lebih dulu', () => {
    const dataset = makeDataset({
      uploadedAt: END_OF_MONTH_UPLOADED_AT,
      paket: [
        makePaket({
          kode: 'CMB-OK',
          label: 'Paket Aman',
          cleanLabel: 'Paket Aman',
          komponenCode: '001.01.02',
          paguTotal: 1_000_000_000,
          monthlyPlanPhysical: filled12(50),
          monthlyActualPhysical: filled12(52),
          monthlyPlanFinance: filled12(50),
          monthlyActualFinance: filled12(52),
        }),
        makePaket({
          kode: 'CMB-BAD',
          label: 'Paket Terburuk',
          cleanLabel: 'Paket Terburuk',
          komponenCode: '001.01.03',
          paguTotal: 1_000_000_000,
          monthlyPlanPhysical: filled12(80),
          monthlyActualPhysical: filled12(45),
          monthlyPlanFinance: filled12(80),
          monthlyActualFinance: filled12(45),
        }),
      ],
    })
    const state = buildIemonDashboardState(dataset, 'komponen')

    expect(state.combinedRows).toHaveLength(2)
    expect(state.combinedRows[0].kode).toBe('CMB-BAD')
    expect(state.combinedRows[0].deviasiFisik).toBeCloseTo(-35, 1)
    expect(state.combinedRows[1].deviasiFisik).toBeCloseTo(2, 1)
    expect(state.combinedRows[0].deviasiFisik).toBeLessThanOrEqual(
      state.combinedRows[1].deviasiFisik,
    )
  })

  it('5. dataset kosong: combinedRows kosong (tanpa error)', () => {
    const state = buildIemonDashboardState(makeDataset())
    expect(state.combinedRows).toEqual([])
  })
})
