import {
  type IemonDataset,
  type IemonLevel,
  type IemonPaketRow,
  type IemonKontraktualRow,
} from '@/lib/iemonParser'
import { hitungStatusKontrak } from '@/lib/statusKontrak'

export type IemonLevelOption = {
  key: IemonLevel
  label: string
}

export interface IemonComparisonRow {
  code: string
  label: string
  paketCount: number
  paketPagu: number
  paketRealisasi: number
  paketFisik: number
  kontrakCount: number
  kontrakNilai: number
  rkaklCount: number
  rkaklPagu: number
  serapan: number
  gapPagu: number
}

export interface IemonContractRisk {
  code: string
  label: string
  status: string
  nilaiKontrak: number
  progressKeuangan: number
  progressFisik: number
  sisaHari: number | null
  tone: 'rose' | 'amber' | 'emerald'
}

export type IemonKinerjaStatus = 'on-track' | 'tertinggal' | 'kritis'

export interface IemonDeviationRow {
  code: string
  label: string
  paguTotal: number
  rencanaFisik: number
  realisasiFisik: number
  deviasiFisik: number
  rencanaKeuangan: number
  realisasiKeuangan: number
  deviasiKeuangan: number
  status: IemonKinerjaStatus
}

/** Baris gabungan Paket + Kontraktual untuk tabel kinerja paket kepada pimpinan. */
export interface IemonCombinedRow {
  kode: string
  namaPaket: string
  rekanan: string | null
  statusKontrak: string
  tanggalKontrak: string | null
  tanggalMulai: string | null
  tanggalSelesai: string | null
  masaPelaksanaanHari: number | null
  sisaHari: number | null
  pagu: number
  nilaiKontrak: number
  rencanaFisik: number
  realisasiFisik: number
  deviasiFisik: number
  rencanaKeuangan: number
  realisasiKeuangan: number
  deviasiKeuangan: number
  status: IemonKinerjaStatus
}

export interface IemonDashboardState {
  availableLevels: IemonLevelOption[]
  level: IemonLevel
  summary: {
    totalPaguRkakl: number
    totalPaguPaket: number
    totalRealisasiPaket: number
    totalKontrak: number
    serapanPaket: number
    sisaPaket: number
    paketCount: number
    kontrakCount: number
    paketOnTrack: number
    paketZero: number
    paketKritis: number
    kontrakAktif: number
  }
  /** Analisa deviasi rencana vs realisasi pada periode berjalan (tertimbang pagu). */
  kinerja: {
    periodeIndex: number
    periodeLabel: string
    rencanaFisik: number
    realisasiFisik: number
    deviasiFisik: number
    rencanaKeuangan: number
    realisasiKeuangan: number
    deviasiKeuangan: number
    /** Target akhir bulan berjalan (rencana bulanan penuh, tertimbang pagu). */
    targetFisikBulan: number
    targetKeuanganBulan: number
    status: IemonKinerjaStatus
    paketTertinggal: number
    paketKritis: number
    paketOnTrack: number
  }
  /** Target akhir bulan per bulan (rencana bulanan tertimbang pagu), dari bulan berjalan s/d Des. */
  targetBulanan: Array<{ bulan: number; label: string; fisik: number; keuangan: number }>
  deviationRows: IemonDeviationRow[]
  combinedRows: IemonCombinedRow[]
  comparisonRows: IemonComparisonRow[]
  topRows: IemonComparisonRow[]
  lowRows: IemonComparisonRow[]
  budgetRows: IemonComparisonRow[]
  monthlyLabels: string[]
  monthlyPlanFinance: number[]
  monthlyActualFinance: number[]
  monthlyPlanPhysical: number[]
  monthlyActualPhysical: number[]
  contractRisks: IemonContractRisk[]
  riskNotes: string[]
}

const LEVEL_LABELS: Record<IemonLevel, string> = {
  program: 'Program',
  kegiatan: 'Kegiatan',
  kro: 'KRO',
  ro: 'RO',
  komponen: 'Komponen',
  subkomponen: 'Subkomp',
  detil: 'Detil',
}

const MONTH_LABELS = ['Jan', 'Peb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nop', 'Des']

/** Ekstrak kode level dari kode paket/kontrak penuh (mis. 04.693859.GA.7696.CBR.002.307.AH). */
function levelCodeFromFullKode(fullKode: string, level: IemonLevel): string {
  const parts = fullKode.split('.')
  // Format: [satker, satker, program, giat, output, soutput, komponen, subkomponen]
  // Indeks:    0       1        2      3       4       5        6          7
  switch (level) {
    case 'program': return parts[2] ?? ''
    case 'kegiatan': return [parts[2], parts[3]].filter(Boolean).join('.')
    case 'kro': return [parts[2], parts[3], parts[4]].filter(Boolean).join('.')
    case 'ro': return [parts[2], parts[3], parts[4], parts[5]].filter(Boolean).join('.')
    case 'komponen': return [parts[2], parts[3], parts[4], parts[5], parts[6]].filter(Boolean).join('.')
    case 'subkomponen': return [parts[2], parts[3], parts[4], parts[5], parts[6], parts[7]].filter(Boolean).join('.')
    case 'detil': return fullKode
    default: return fullKode
  }
}

function levelValue(row: { programCode: string; kegiatanCode: string; kroCode: string; roCode: string; komponenCode: string; subkomponenCode: string; detilCode: string }, level: IemonLevel): string {
  return row[`${level}Code` as const]
}

function levelLabel(level: IemonLevel): string {
  return LEVEL_LABELS[level] ?? level
}

function monthWeightedSeries(rows: IemonPaketRow[], selector: keyof Pick<IemonPaketRow, 'monthlyPlanFinance' | 'monthlyActualFinance' | 'monthlyPlanPhysical' | 'monthlyActualPhysical'>): number[] {
  if (rows.length === 0) return Array.from({ length: 12 }, () => 0)
  const series = Array.from({ length: 12 }, () => 0)
  const weights = Array.from({ length: 12 }, () => 0)
  rows.forEach((row) => {
    const values = Array.isArray(row[selector]) ? row[selector] : []
    values.forEach((value, index) => {
      if (index >= 12) return
      const weight = row.paguTotal > 0 ? row.paguTotal : 1
      series[index] += (Number.isFinite(value) ? value : 0) * weight
      weights[index] += weight
    })
  })
  return series.map((value, index) => (weights[index] > 0 ? Math.round((value / weights[index]) * 100) / 100 : 0))
}

function getContractTone(progress: number, sisaHari: number | null): 'rose' | 'amber' | 'emerald' {
  if (sisaHari != null && sisaHari <= 45 && progress < 80) return 'rose'
  if (progress < 25) return 'amber'
  return 'emerald'
}

/**
 * Selisih hari menuju tanggal tertentu.
 *
 * Catatan: nilai NEGATIF dipertahankan karena dipakai untuk menilai keterlambatan
 * (lihat getContractTone). Yang diubah adalah cara menampilkannya — lihat
 * `teksSisaHari` di bawah, agar pengguna tidak melihat angka seperti "-128".
 */
function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) return null
  return Math.ceil((date.getTime() - Date.now()) / 86400000)
}

/**
 * Ubah sisa hari menjadi teks yang mudah dibaca.
 * -128 -> "lewat 128 hari" (bukan "-128").
 */
export function teksSisaHari(sisa: number | null): string {
  if (sisa === null) return '—'
  if (sisa < 0) return `lewat ${Math.abs(sisa)} hari`
  return `${sisa} hari`
}

function groupRows<T extends { code: string; label: string; pagu: number; realisasi: number; progressFisik: number; progressKeuangan: number; status?: string | null; value?: number | null; nilaiKontrak?: number | null; monthlyBudget?: number[] }>(
  rows: T[],
  level: IemonLevel,
  source: 'paket' | 'kontraktual' | 'rkakl',
): IemonComparisonRow[] {
  type GroupState = IemonComparisonRow & { paketFisikWeightedSum: number; paketFisikWeight: number }
  const groups = new Map<string, GroupState>()

  rows.forEach((row) => {
    const code = levelValue(row as unknown as Record<`${IemonLevel}Code`, string>, level)
    if (!code) return
    const existing = groups.get(code) ?? {
      code,
      label: row.label,
      paketCount: 0,
      paketPagu: 0,
      paketRealisasi: 0,
      paketFisik: 0,
      kontrakCount: 0,
      kontrakNilai: 0,
      rkaklCount: 0,
      rkaklPagu: 0,
      serapan: 0,
      gapPagu: 0,
      paketFisikWeightedSum: 0,
      paketFisikWeight: 0,
    }

    if (source === 'paket') {
      existing.paketCount += 1
      existing.paketPagu += row.pagu
      existing.paketRealisasi += row.realisasi
      existing.paketFisikWeightedSum += row.progressFisik * row.pagu
      existing.paketFisikWeight += row.pagu
      existing.paketFisik = existing.paketFisikWeight > 0 ? Math.round((existing.paketFisikWeightedSum / existing.paketFisikWeight) * 100) / 100 : 0
      existing.label = existing.paketPagu >= row.pagu ? existing.label : row.label
    } else if (source === 'kontraktual') {
      existing.kontrakCount += 1
      existing.kontrakNilai += row.nilaiKontrak ?? row.value ?? 0
      if (!existing.label) existing.label = row.label
    } else {
      existing.rkaklCount += 1
      existing.rkaklPagu += row.pagu
      if (!existing.label) existing.label = row.label
    }

    existing.serapan = existing.paketPagu > 0 ? Math.round((existing.paketRealisasi / existing.paketPagu) * 10000) / 100 : 0
    existing.gapPagu = existing.rkaklPagu - existing.paketPagu
    groups.set(code, existing)
  })

  return [...groups.values()]
    .map((group) => {
      const { paketFisikWeightedSum, paketFisikWeight, ...row } = group
      void paketFisikWeightedSum
      void paketFisikWeight
      return row
    })
    .sort((a, b) => b.paketPagu - a.paketPagu || b.rkaklPagu - a.rkaklPagu || a.code.localeCompare(b.code))
}

function buildContractRisks(rows: IemonKontraktualRow[]): IemonContractRisk[] {
  return rows
    .map((row) => {
      const sisaHari = daysUntil(row.tanggalSelesai)
      return {
        code: row.kode,
        label: row.cleanLabel || row.label,
        status: row.status || '-',
        nilaiKontrak: row.nilaiKontrak,
        progressKeuangan: row.progressKeuangan,
        progressFisik: row.progressFisik,
        sisaHari,
        tone: getContractTone(row.progressFisik, sisaHari),
      }
    })
    .filter((item) => item.tone !== 'emerald' || (item.sisaHari != null && item.sisaHari <= 90))
    .sort((a, b) => (a.sisaHari ?? 9999) - (b.sisaHari ?? 9999) || b.progressFisik - a.progressFisik)
}

// Ambang deviasi fisik (poin %) untuk klasifikasi kinerja paket.
const DEVIASI_TERTINGGAL = 5
const DEVIASI_KRITIS = 15

/** Indeks periode berjalan: bulan terakhir yang punya angka rencana > 0 (0-11). */
function detectPeriodeIndex(rows: IemonPaketRow[]): number {
  let lastPlanned = 0
  rows.forEach((row) => {
    const series = Array.isArray(row.monthlyPlanPhysical) ? row.monthlyPlanPhysical : []
    series.forEach((value, index) => {
      if (value > 0 && index > lastPlanned) lastPlanned = index
    })
  })
  const nowMonth = new Date().getMonth()
  return Math.min(lastPlanned || nowMonth, nowMonth, 11)
}

/** Nilai kumulatif tertimbang-pagu pada periode tertentu untuk satu seri bulanan. */
function weightedAt(
  rows: IemonPaketRow[],
  selector: keyof Pick<IemonPaketRow, 'monthlyPlanFinance' | 'monthlyActualFinance' | 'monthlyPlanPhysical' | 'monthlyActualPhysical'>,
  periodeIndex: number,
  baseDate?: Date,
): number {
  let sum = 0
  let weight = 0
  rows.forEach((row) => {
    const series = Array.isArray(row[selector]) ? row[selector] : []
    const value = (baseDate && selector.includes('Plan'))
      ? calculateDailyPlan(series, periodeIndex, baseDate) ?? 0
      : (series[periodeIndex] ?? series[series.length - 1] ?? 0)
    const w = row.paguTotal > 0 ? row.paguTotal : 1
    sum += (Number.isFinite(value) ? value : 0) * w
    weight += w
  })
  return weight > 0 ? Math.round((sum / weight) * 100) / 100 : 0
}

function classifyKinerja(deviasiFisik: number): IemonKinerjaStatus {
  if (deviasiFisik <= -DEVIASI_KRITIS) return 'kritis'
  if (deviasiFisik < -DEVIASI_TERTINGGAL) return 'tertinggal'
  return 'on-track'
}

/** Nilai kumulatif satu paket pada periode (fallback ke nilai terakhir bila kosong). */
function seriesAt(series: number[], periodeIndex: number): number {
  if (!Array.isArray(series) || series.length === 0) return 0
  const value = series[periodeIndex] ?? series[series.length - 1] ?? 0
  return Number.isFinite(value) ? value : 0
}

/** Hitung rencana berdasarkan proporsi hari berjalan terhadap sisa bobot bulan ini. */
function calculateDailyPlan(series: number[], periodeIndex: number, baseDate: Date): number | null {
  if (!Array.isArray(series) || series.length === 0 || !series.some(v => v > 0)) return null
  const month = baseDate.getMonth()
  const today = baseDate.getDate()
  const year = baseDate.getFullYear()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const bobotBulanLalu = month > 0 ? seriesAt(series, month - 1) : 0
  const bobotBulanIni = seriesAt(series, month)
  if (bobotBulanIni <= bobotBulanLalu) return bobotBulanIni
  const bobotHari = ((bobotBulanIni - bobotBulanLalu) / daysInMonth) * today
  return Math.round((bobotBulanLalu + bobotHari) * 100) / 100
}

/** Bangun baris deviasi per paket pada periode berjalan, urut deviasi fisik terburuk. */
function buildDeviationRows(rows: IemonPaketRow[], periodeIndex: number, baseDate: Date): IemonDeviationRow[] {
  return rows
    .filter((row) => row.paguTotal > 0)
    .map((row) => {
      const tMulai = row.tanggalMulai ?? null
      const tSelesai = row.tanggalSelesai ?? null
      const timeElapsed = timeElapsedPlan(tMulai, tSelesai, baseDate)

      const rencanaFisik = calculateDailyPlan(row.monthlyPlanPhysical, periodeIndex, baseDate) ?? timeElapsed ?? row.progressFisik
      const realisasiFisik = seriesAt(row.monthlyActualPhysical, periodeIndex) || row.progressFisik
      const rencanaKeuangan = calculateDailyPlan(row.monthlyPlanFinance, periodeIndex, baseDate) ?? timeElapsed ?? row.progressKeuangan
      const realisasiKeuangan = seriesAt(row.monthlyActualFinance, periodeIndex) || row.progressKeuangan
      const deviasiFisik = Math.round((realisasiFisik - rencanaFisik) * 100) / 100
      return {
        code: row.kode || row.detilCode,
        label: row.cleanLabel || row.label,
        paguTotal: row.paguTotal,
        rencanaFisik,
        realisasiFisik,
        deviasiFisik,
        rencanaKeuangan,
        realisasiKeuangan,
        deviasiKeuangan: Math.round((realisasiKeuangan - rencanaKeuangan) * 100) / 100,
        status: classifyKinerja(deviasiFisik),
      }
    })
    .sort((a, b) => a.deviasiFisik - b.deviasiFisik)
}

/** Gabungkan Paket (kurva rencana) + Kontraktual (tanggal & nilai kontrak) per kode. */
function buildCombinedRows(
  paketRows: IemonPaketRow[],
  kontraktualRows: IemonKontraktualRow[],
  periodeIndex: number,
  baseDate: Date,
): IemonCombinedRow[] {
  const kontrakByKode = new Map(kontraktualRows.map((row) => [row.kode, row]))
  const kontrakByLabel = new Map(kontraktualRows.filter(r => r.cleanLabel).map((row) => [row.cleanLabel, row]))

  const paketKodes = new Set(paketRows.map((row) => row.kode))
  const paketLabels = new Set(paketRows.filter(r => r.cleanLabel).map((row) => row.cleanLabel))

  const combined: IemonCombinedRow[] = paketRows.map((paket) => {
    const kontrak = kontrakByKode.get(paket.kode) ?? (paket.cleanLabel ? kontrakByLabel.get(paket.cleanLabel) : null) ?? null
    return mergeCombinedRow(paket, kontrak, periodeIndex, baseDate)
  })

  // Sertakan kontrak yang tidak punya padanan paket
  kontraktualRows.forEach((kontrak) => {
    const hasKode = paketKodes.has(kontrak.kode)
    const hasLabel = kontrak.cleanLabel ? paketLabels.has(kontrak.cleanLabel) : false
    if (!hasKode && !hasLabel) {
      combined.push(mergeCombinedRow(null, kontrak, periodeIndex, baseDate))
    }
  })
  return combined.sort((a, b) => a.deviasiFisik - b.deviasiFisik || b.pagu - a.pagu)
}

function timeElapsedPlan(startIso: string | null, endIso: string | null, baseDate: Date): number | null {
  if (!startIso || !endIso) return null
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const now = baseDate.getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (now >= end) return 100
  if (now <= start) return 0
  return Math.round(((now - start) / (end - start)) * 10000) / 100
}

/** Bentuk satu baris gabungan dari paket dan/atau kontrak (salah satu boleh null). */
function mergeCombinedRow(
  paket: IemonPaketRow | null,
  kontrak: IemonKontraktualRow | null,
  periodeIndex: number,
  baseDate: Date,
): IemonCombinedRow {
  const tanggalMulai = kontrak?.tanggalMulai ?? paket?.tanggalMulai ?? null
  const tanggalSelesai = kontrak?.tanggalSelesai ?? paket?.tanggalSelesai ?? null
  const timeElapsed = timeElapsedPlan(tanggalMulai, tanggalSelesai, baseDate)

  const rencanaFisik = (paket ? calculateDailyPlan(paket.monthlyPlanPhysical, periodeIndex, baseDate) : null) ?? timeElapsed ?? 0
  const realisasiFisik = paket
    ? seriesAt(paket.monthlyActualPhysical, periodeIndex) || paket.progressFisik
    : kontrak?.progressFisik ?? 0
  const rencanaKeuangan = (paket ? calculateDailyPlan(paket.monthlyPlanFinance, periodeIndex, baseDate) : null) ?? timeElapsed ?? 0
  const realisasiKeuangan = paket
    ? seriesAt(paket.monthlyActualFinance, periodeIndex) || paket.progressKeuangan
    : kontrak?.progressKeuangan ?? 0
  const deviasiFisik = Math.round((realisasiFisik - rencanaFisik) * 100) / 100
  return {
    kode: paket?.kode || kontrak?.kode || '',
    namaPaket: paket?.cleanLabel || paket?.label || kontrak?.cleanLabel || kontrak?.label || '-',
    rekanan: kontrak?.rekanan ?? null,
    // Status dihitung dari tanggal, BUKAN disalin mentah dari SIPP.
    // SIPP tidak memperbarui status menjadi selesai setelah tanggal selesai
    // terlewati, sehingga paket yang kontraknya sudah berakhir tetap tampil
    // "Terkontrak". Lihat lib/statusKontrak.ts.
    statusKontrak: (() => {
      const hasil = hitungStatusKontrak(
        tanggalMulai,
        tanggalSelesai,
        kontrak?.status ?? (paket ? 'Belum Kontrak' : null),
        new Date(),
        // Progres fisik 100% berarti paket sudah selesai/PHO.
        realisasiFisik,
      )
      return hasil.status === 'selesai'
        ? 'Selesai'
        : hasil.status === 'akan-pho'
          ? 'Terkontrak (akan selesai)'
          : hasil.status === 'belum'
            ? 'Belum Kontrak'
            : 'Terkontrak'
    })(),
    tanggalKontrak: kontrak?.jadwalKontrak ?? null,
    tanggalMulai,
    tanggalSelesai,
    masaPelaksanaanHari: tanggalMulai && tanggalSelesai ? rangeDays(tanggalMulai, tanggalSelesai) : null,
    sisaHari: daysUntil(tanggalSelesai),
    pagu: paket?.paguTotal ?? kontrak?.paguTotalDipa ?? 0,
    nilaiKontrak: kontrak?.nilaiKontrak ?? 0,
    rencanaFisik,
    realisasiFisik,
    deviasiFisik,
    rencanaKeuangan,
    realisasiKeuangan,
    deviasiKeuangan: Math.round((realisasiKeuangan - rencanaKeuangan) * 100) / 100,
    status: classifyKinerja(deviasiFisik),
  }
}

/** Selisih hari antara dua tanggal ISO (positif). */
function rangeDays(startIso: string, endIso: string): number | null {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
}

export function buildIemonDashboardState(dataset: IemonDataset, level: IemonLevel = 'komponen'): IemonDashboardState {
  const availableLevels = (['program', 'kegiatan', 'kro', 'ro', 'komponen', 'subkomponen', 'detil'] as IemonLevel[]).filter((candidate) =>
    [...dataset.paket, ...dataset.kontraktual, ...dataset.rkakl].some((row) => Boolean((row as unknown as Record<`${IemonLevel}Code`, string>)[`${candidate}Code` as const])),
  ).map((candidate) => ({ key: candidate, label: levelLabel(candidate) }))

  const normalizedLevel = availableLevels.some((item) => item.key === level) ? level : availableLevels[0]?.key ?? 'detil'

  const paketRows = dataset.paket
  const kontraktualRows = dataset.kontraktual
  const rkaklRows = dataset.rkakl

  const paketGroups = groupRows(
    paketRows.map((row) => ({
      ...row,
      code: (row as unknown as Record<`${IemonLevel}Code`, string>)[`${normalizedLevel}Code` as const] ?? row.detilCode,
      pagu: row.paguTotal,
      realisasi: row.realTotal,
      progressFisik: row.progressFisik,
      progressKeuangan: row.progressKeuangan,
      value: null,
      nilaiKontrak: null,
    })),
    normalizedLevel,
    'paket',
  )
  const kontrakGroups = groupRows(
    kontraktualRows.map((row) => ({
      ...row,
      code: (row as unknown as Record<`${IemonLevel}Code`, string>)[`${normalizedLevel}Code` as const] ?? row.detilCode,
      pagu: row.paguTotalDipa,
      realisasi: row.realisasi,
      progressFisik: row.progressFisik,
      progressKeuangan: row.progressKeuangan,
      value: row.nilaiKontrak,
      nilaiKontrak: row.nilaiKontrak,
    })),
    normalizedLevel,
    'kontraktual',
  )
  const rkaklGroups = groupRows(
    rkaklRows.map((row) => ({
      ...row,
      code: (row as unknown as Record<`${IemonLevel}Code`, string>)[`${normalizedLevel}Code` as const] ?? row.detilCode,
      pagu: row.jumlah,
      realisasi: 0,
      progressFisik: 0,
      progressKeuangan: 0,
      value: null,
      nilaiKontrak: null,
    })),
    normalizedLevel,
    'rkakl',
  )

  const groups = new Map<string, IemonComparisonRow>()
  for (const source of [paketGroups, kontrakGroups, rkaklGroups]) {
    for (const row of source) {
      const existing = groups.get(row.code) ?? {
        code: row.code,
        label: row.label,
        paketCount: 0,
        paketPagu: 0,
        paketRealisasi: 0,
        paketFisik: 0,
        kontrakCount: 0,
        kontrakNilai: 0,
        rkaklCount: 0,
        rkaklPagu: 0,
        serapan: 0,
        gapPagu: 0,
      }
      existing.label = existing.label || row.label
      existing.paketCount += row.paketCount
      existing.paketPagu += row.paketPagu
      existing.paketRealisasi += row.paketRealisasi
      existing.paketFisik = row.paketCount > 0 ? row.paketFisik : existing.paketFisik
      existing.kontrakCount += row.kontrakCount
      existing.rkaklCount += row.rkaklCount
      existing.rkaklPagu += row.rkaklPagu
      existing.serapan = existing.paketPagu > 0 ? Math.round((existing.paketRealisasi / existing.paketPagu) * 10000) / 100 : 0
      existing.gapPagu = existing.rkaklPagu - existing.paketPagu
      groups.set(row.code, existing)
    }
  }

  // Analisa deviasi rencana vs realisasi pada periode berjalan.
  const baseDate = dataset.uploadedAt ? new Date(dataset.uploadedAt) : new Date()
  const periodeIndex = detectPeriodeIndex(paketRows)
  const rencanaFisikKini = weightedAt(paketRows, 'monthlyPlanPhysical', periodeIndex, baseDate)
  const realisasiFisikKini = weightedAt(paketRows, 'monthlyActualPhysical', periodeIndex)
  const rencanaKeuanganKini = weightedAt(paketRows, 'monthlyPlanFinance', periodeIndex, baseDate)
  const realisasiKeuanganKini = weightedAt(paketRows, 'monthlyActualFinance', periodeIndex)
  // Target akhir bulan berjalan (rencana bulanan penuh, tanpa interpolasi harian) + deret target bulanan s/d Des.
  const targetFisikBulan = weightedAt(paketRows, 'monthlyPlanPhysical', periodeIndex)
  const targetKeuanganBulan = weightedAt(paketRows, 'monthlyPlanFinance', periodeIndex)
  const targetBulanan = MONTH_LABELS
    .map((label, bulan) => ({
      bulan,
      label,
      fisik: weightedAt(paketRows, 'monthlyPlanPhysical', bulan),
      keuangan: weightedAt(paketRows, 'monthlyPlanFinance', bulan),
    }))
    .filter((t) => t.bulan >= periodeIndex)
  const deviasiFisikKini = Math.round((realisasiFisikKini - rencanaFisikKini) * 100) / 100
  const deviationRows = buildDeviationRows(paketRows, periodeIndex, baseDate)
  const combinedRows = buildCombinedRows(paketRows, kontraktualRows, periodeIndex, baseDate)

  // Hitung kontrakNilai dari combinedRows (sumber yang sama dengan tabel Kinerja Paket & Kontrak)
  // agar kedua tabel konsisten menampilkan angka yang sama.
  combinedRows.forEach((row) => {
    if (row.nilaiKontrak <= 0) return
    const code = levelCodeFromFullKode(row.kode, normalizedLevel)
    if (!code) return
    const group = groups.get(code)
    if (group) group.kontrakNilai += row.nilaiKontrak
  })

  // Fallback pembanding RKAKL: tanpa baris RKAKL, anggap pagu RKAKL = pagu paket (DIPA iEMON)
  if (rkaklRows.length === 0) {
    for (const row of groups.values()) {
      row.rkaklPagu = row.paketPagu
      row.gapPagu = 0
    }
  }

  const comparisonRows = [...groups.values()].sort((a, b) => b.rkaklPagu - a.rkaklPagu || b.paketPagu - a.paketPagu || a.code.localeCompare(b.code))
  const topRows = [...comparisonRows].sort((a, b) => b.paketRealisasi - a.paketRealisasi || b.serapan - a.serapan).slice(0, 10)
  const lowRows = [...comparisonRows].filter((row) => row.paketPagu > 0 && row.serapan < 20).sort((a, b) => a.serapan - b.serapan || a.paketPagu - b.paketPagu).slice(0, 8)
  const budgetRows = rkaklRows.length > 0
    ? [...rkaklGroups].sort((a, b) => b.rkaklPagu - a.rkaklPagu).slice(0, 9)
    : comparisonRows.filter((row) => row.paketPagu > 0).sort((a, b) => b.rkaklPagu - a.rkaklPagu).slice(0, 9)
  const monthlyLabels = [...MONTH_LABELS]
  const monthlyPlanFinance = monthWeightedSeries(paketRows, 'monthlyPlanFinance')
  const monthlyActualFinance = monthWeightedSeries(paketRows, 'monthlyActualFinance')
  const monthlyPlanPhysical = monthWeightedSeries(paketRows, 'monthlyPlanPhysical')
  const monthlyActualPhysical = monthWeightedSeries(paketRows, 'monthlyActualPhysical')
  const contractRisks = buildContractRisks(kontraktualRows)
  const totalPaguPaket = paketRows.reduce((sum, row) => sum + row.paguTotal, 0)
  // Pagu RKAKL = pagu total DIPA dari iEMON: jika data RKAKL belum tersedia, pakai pagu total paket
  // (satu sumber kebenaran DIPA) agar pembanding tidak menampilkan Rp 0.
  const totalPaguRkakl = rkaklRows.length > 0
    ? rkaklRows.reduce((sum, row) => sum + row.jumlah, 0)
    : totalPaguPaket
  const totalRealisasiPaket = paketRows.reduce((sum, row) => sum + row.realTotal, 0)
  const totalKontrak = kontraktualRows.reduce((sum, row) => sum + row.nilaiKontrak, 0)
  const paketOnTrack = paketRows.filter((row) => row.progressFisik >= row.progressKeuangan).length
  const paketZero = paketRows.filter((row) => row.paguTotal > 0 && row.realTotal === 0).length
  const paketKritis = paketRows.filter((row) => row.paguTotal > 0 && row.progressFisik >= 80).length
  const kontrakAktif = kontraktualRows.filter((row) => (row.status || '').toLowerCase() === 'terkontrak').length

  const riskNotes: string[] = []
  const zeroRows = paketRows.filter((row) => row.paguTotal > 0 && row.realTotal === 0)
  if (zeroRows.length > 0) riskNotes.push(`${zeroRows.length} paket belum ada realisasi sama sekali`)
  const overRows = paketRows.filter((row) => row.paguTotal > 0 && row.progressFisik >= 80)
  if (overRows.length > 0) riskNotes.push(`${overRows.length} paket mendekati/melebihi target serapan`)
  const deadlineRows = contractRisks.filter((row) => row.sisaHari != null && row.sisaHari <= 90)
  if (deadlineRows.length > 0) riskNotes.push(`${deadlineRows.length} kontrak berada di bawah 90 hari sisa waktu`)
  if (budgetRows.length === 0) riskNotes.push('Belum ada data RKAKL yang bisa dibandingkan')
  const paketTertinggal = deviationRows.filter((row) => row.status === 'tertinggal').length
  const paketKinerjaKritis = deviationRows.filter((row) => row.status === 'kritis').length
  const paketKinerjaOnTrack = deviationRows.filter((row) => row.status === 'on-track').length
  if (deviasiFisikKini < -DEVIASI_TERTINGGAL) {
    riskNotes.push(`Progres fisik tertinggal ${Math.abs(deviasiFisikKini).toFixed(1)} poin dari rencana ${MONTH_LABELS[periodeIndex]}`)
  }

  return {
    availableLevels,
    level: normalizedLevel,
    summary: {
      totalPaguRkakl,
      totalPaguPaket,
      totalRealisasiPaket,
      totalKontrak,
      serapanPaket: totalPaguPaket > 0 ? Math.round((totalRealisasiPaket / totalPaguPaket) * 10000) / 100 : 0,
      sisaPaket: totalPaguPaket - totalRealisasiPaket,
      paketCount: paketRows.length,
      kontrakCount: kontraktualRows.length,
      paketOnTrack,
      paketZero,
      paketKritis,
      kontrakAktif,
    },
    kinerja: {
      periodeIndex,
      periodeLabel: MONTH_LABELS[periodeIndex] ?? '',
      rencanaFisik: rencanaFisikKini,
      realisasiFisik: realisasiFisikKini,
      deviasiFisik: deviasiFisikKini,
      rencanaKeuangan: rencanaKeuanganKini,
      realisasiKeuangan: realisasiKeuanganKini,
      deviasiKeuangan: Math.round((realisasiKeuanganKini - rencanaKeuanganKini) * 100) / 100,
      targetFisikBulan,
      targetKeuanganBulan,
      status: classifyKinerja(deviasiFisikKini),
      paketTertinggal,
      paketKritis: paketKinerjaKritis,
      paketOnTrack: paketKinerjaOnTrack,
    },
    targetBulanan,
    deviationRows,
    combinedRows,
    comparisonRows,
    topRows,
    lowRows,
    budgetRows,
    monthlyLabels,
    monthlyPlanFinance,
    monthlyActualFinance,
    monthlyPlanPhysical,
    monthlyActualPhysical,
    contractRisks,
    riskNotes,
  }
}

export function defaultIemonLevel(dataset: IemonDataset): IemonLevel {
  const levels = buildIemonDashboardState(dataset).availableLevels
  return levels.some((level) => level.key === 'komponen') ? 'komponen' : levels[0]?.key ?? 'detil'
}

export function levelOptions(): IemonLevelOption[] {
  return (['program', 'kegiatan', 'kro', 'ro', 'komponen', 'subkomponen', 'detil'] as IemonLevel[]).map((key) => ({ key, label: levelLabel(key) }))
}
