import ExcelJS from 'exceljs'
import {
  joinCodeSegments,
  normalizeIemonLabel,
  textCell,
  toDateIso,
  toNumber,
  toPercent,
} from '@/lib/iemonNormalize'

export type IemonLevel = 'program' | 'kegiatan' | 'kro' | 'ro' | 'komponen' | 'subkomponen' | 'detil'

export interface IemonPaketRow {
  source: 'paket'
  kode: string
  label: string
  cleanLabel: string
  category: string
  programCode: string
  kegiatanCode: string
  kroCode: string
  roCode: string
  komponenCode: string
  subkomponenCode: string
  detilCode: string
  kdsatker: string
  kdunit: string
  kdprogram: string
  kdgiat: string
  kdoutput: string
  kdsoutput: string
  kdkmpnen: string
  kdskmpnen: string
  metode: string | null
  pengadaan: string | null
  volume: number
  satuan: string | null
  tanggalMulai: string | null
  tanggalSelesai: string | null
  pagu51: number
  pagu52: number
  pagu53: number
  paguRpm: number
  paguSbsn: number
  paguPhln: number
  paguTotal: number
  real51: number
  real52: number
  real53: number
  realRpm: number
  realSbsn: number
  realPhln: number
  realTotal: number
  progressKeuangan: number
  progressFisik: number
  monthlyPlanFinance: number[]
  monthlyActualFinance: number[]
  monthlyPlanPhysical: number[]
  monthlyActualPhysical: number[]
}

export interface IemonKontraktualRow {
  source: 'kontraktual'
  kode: string
  label: string
  cleanLabel: string
  category: string
  programCode: string
  kegiatanCode: string
  kroCode: string
  roCode: string
  komponenCode: string
  subkomponenCode: string
  detilCode: string
  kdsatker: string
  metode: string | null
  jenisKontrak: string | null
  volume: number
  satuan: string | null
  tanggalMulai: string | null
  tanggalSelesai: string | null
  jadwalPengumuman: string | null
  jadwalPemenang: string | null
  jadwalKontrak: string | null
  status: string | null
  nilaiKontrak: number
  nomorKontrak: string | null
  rekanan: string | null
  npwp: string | null
  paguRpm: number
  paguSbsn: number
  paguPhln: number
  paguTotalDipa: number
  paguPengadaan: number
  realisasi: number
  progressKeuangan: number
  progressFisik: number
}

export interface IemonRkaklRow {
  source: 'rkakl'
  kode: string
  label: string
  cleanLabel: string
  category: string
  programCode: string
  kegiatanCode: string
  kroCode: string
  roCode: string
  komponenCode: string
  subkomponenCode: string
  detilCode: string
  kdsatker: string
  kdunit: string
  kdprogram: string
  kdgiat: string
  kdoutput: string
  kdsoutput: string
  kdkmpnen: string
  kdskmpnen: string
  kdakun: string
  noitem: string
  header1: string | null
  header2: string | null
  volume: number
  satuan: string | null
  hargaSatuan: number
  jumlah: number
  paguPhln: number
  paguRmp: number
  paguRkp: number
  blokir: number
  monthlyBudget: number[]
}

export interface IemonDataset {
  uploadedAt: string
  sourceFiles: {
    paket: string | null
    kontraktual: string | null
    rkakl: string | null
  }
  paket: IemonPaketRow[]
  kontraktual: IemonKontraktualRow[]
  rkakl: IemonRkaklRow[]
}

type Cell = string | number | Date | null

const PACKAGE_MONTH_SUFFIXES = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'] as const
const RKAKL_MONTH_HEADERS = ['JANUARI', 'PEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOPEMBER', 'DESEMBER'] as const

const PAKET_HEADER_ALIASES: Record<string, string[]> = {
  kdunit: ['kdunit'],
  kdsatker: ['kdsatker'],
  kdprogram: ['kdprogram'],
  kdgiat: ['kdgiat'],
  kdoutput: ['kdoutput'],
  kdsoutput: ['kdsoutput'],
  kdkmpnen: ['kdkmpnen', 'kdkmpenan'],
  kdskmpnen: ['kdskmpnen', 'kdsubkomponen'],
  kode: ['kode'],
  nmpaket: ['nmpaket', 'nama paket', 'nama_paket'],
  kdlokasi: ['kdlokasi'],
  kdkabkota: ['kdkabkota'],
  metode: ['metode'],
  kdpengadaan: ['kdpengadaan'],
  vol: ['vol', 'volume'],
  sat: ['sat', 'satuan'],
  tgl_mulai: ['tgl_mulai', 'tanggal mulai'],
  tgl_selesai: ['tgl_selesai', 'tanggal selesai'],
  pagu_total: ['pagu_total'],
  real_total: ['real_total'],
  progres_keuangan: ['progres_keuangan'],
  progres_fisik: ['progres_fisik'],
}

const KONTRAK_HEADER_ALIASES: Record<string, string[]> = {
  kdsatker: ['kdsatker'],
  kode: ['kode'],
  nmpaket: ['nmpaket', 'nama paket'],
  metode: ['metode'],
  jenis_kontrak: ['jenis_kontrak', 'jenis kontrak'],
  vol: ['vol', 'volume'],
  sat: ['sat', 'satuan'],
  tgl_mulai: ['tgl_mulai', 'tanggal mulai'],
  tgl_selesai: ['tgl_selesai', 'tanggal selesai'],
  jadwal_pengumuman: ['jadwal_pengumuman'],
  jadwal_pemenang: ['jadwal_pemenang'],
  jadwal_kontrak: ['jadwal_kontrak'],
  status: ['status'],
  nilai_kontrak: ['nilai_kontrak'],
  nomor_kontrak: ['nomor_kontrak'],
  rkn_nama: ['rkn_nama', 'nama penyedia', 'rekanan'],
  rkn_npwp: ['rkn_npwp', 'npwp'],
  pagu_rpm: ['pagu_rpm'],
  pagu_sbsn: ['pagu_sbsn'],
  pagu_phln: ['pagu_phln'],
  pagu_total_dipa: ['pagu_total_dipa', 'pagu_total'],
  pagu_pengadaan: ['pagu_pengadaan'],
  realisasi: ['realisasi'],
  progres_keuangan: ['progres_keuangan'],
  progres_fisik: ['progres_fisik'],
}

const RKAKL_HEADER_ALIASES: Record<string, string[]> = {
  kdsatker: ['kdsatker'],
  kdunit: ['kdunit'],
  kdprogram: ['kdprogram'],
  kdgiat: ['kdgiat'],
  kdoutput: ['kdoutput'],
  kdsoutput: ['kdsoutput'],
  kdkmpnen: ['kdkmpnen'],
  kdskmpnen: ['kdskmpnen'],
  kdakun: ['kdakun'],
  noitem: ['noitem'],
  header1: ['header1'],
  header2: ['header2'],
  nmitem: ['nmitem'],
  volkeg: ['volkeg'],
  satkeg: ['satkeg'],
  hargasat: ['hargasat'],
  jumlah: ['jumlah'],
  paguphln: ['paguphln'],
  pagurmp: ['pagurmp'],
  pagurkp: ['pagurkp'],
  blokir: ['rphblokir', 'blokirphln', 'blokirrmp', 'blokirrkp'],
}

function scalarCell(value: ExcelJS.CellValue | undefined): Cell {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) {
      const result = value.result
      return typeof result === 'string' || typeof result === 'number' || result instanceof Date ? result : String(result)
    }
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('')
    }
  }
  return String(value)
}

function readRow(sheet: ExcelJS.Worksheet, rowNumber: number): Cell[] {
  if (rowNumber < 1 || rowNumber > sheet.rowCount) return []
  const worksheetRow = sheet.getRow(rowNumber)
  return Array.from({ length: Math.max(worksheetRow.cellCount, 80) }, (_, index) =>
    scalarCell(worksheetRow.getCell(index + 1).value),
  )
}

function headerKey(value: Cell): string {
  return textCell(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function matchesHeader(label: string, alias: string): boolean {
  // Hindari kecocokan palsu pada sel kosong/terlalu pendek (mis. baris judul kosong
  // yang membuat includes('') selalu true). Wajib keduanya minimal 3 karakter.
  if (label.length < 3 || alias.length < 3) return label === alias
  return label === alias || label.includes(alias) || alias.includes(label)
}

function findHeaderIndex(headers: Cell[], aliases: string[]): number {
  const normalized = headers.map(headerKey)
  const normalizedAliases = aliases.map((item) => item.toLowerCase().replace(/[^a-z0-9]+/g, ''))
  // Prioritas 1: kecocokan persis (mis. 'progresfisik' tidak tertukar dengan 'progresfisikjan').
  for (const alias of normalizedAliases) {
    const exact = normalized.findIndex((header) => header === alias)
    if (exact >= 0) return exact
  }
  // Prioritas 2: kecocokan parsial (substring dua arah) untuk variasi penamaan.
  for (const alias of normalizedAliases) {
    const found = normalized.findIndex((header) => matchesHeader(header, alias))
    if (found >= 0) return found
  }
  return -1
}

function detectHeaderRow(sheet: ExcelJS.Worksheet, aliasMap: Record<string, string[]>): number {
  let bestRow = 2
  let bestScore = -1

  for (let rowNumber = 1; rowNumber <= Math.min(10, sheet.rowCount); rowNumber++) {
    const headers = readRow(sheet, rowNumber)
    let score = 0
    for (const aliases of Object.values(aliasMap)) {
      if (findHeaderIndex(headers, aliases) >= 0) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestRow = rowNumber
    }
  }

  return bestRow
}

function getColumn(headers: Cell[], aliases: string[]): number {
  return findHeaderIndex(headers, aliases)
}

function packageMonthColumns(headers: Cell[], prefix: string): number[] {
  return PACKAGE_MONTH_SUFFIXES.map((suffix) => getColumn(headers, [`${prefix}_${suffix}`])).filter((index) => index >= 0)
}

function rkaklMonthColumns(headers: Cell[]): number[] {
  return RKAKL_MONTH_HEADERS.map((month) => getColumn(headers, [month])).filter((index) => index >= 0)
}

function sumColumns(row: Cell[], columns: number[]): number {
  return columns.reduce((sum, column) => sum + toNumber(row[column]), 0)
}

function inferCategory(label: string, metode?: string | null, jenisKontrak?: string | null): string {
  const text = `${label} ${metode ?? ''} ${jenisKontrak ?? ''}`.toLowerCase()
  if (/konsultan|konsult|pengawasan|perencanaan|monev|monitoring|evaluasi/.test(text)) return 'konsultansi'
  if (/pengadaan|barang|perangkat|alat/.test(text)) return 'pengadaan'
  if (/pemeliharaan|operasional|belanja bahan|barang operasional|administrasi/.test(text)) return 'operasional'
  if (/konstruksi|jalan|jembatan|preservasi|rehab|bangunan/.test(text)) return 'konstruksi'
  return 'lainnya'
}

function classifyLevelFromCode(code: string): IemonLevel {
  const segments = code.split('.').filter(Boolean)
  if (segments.length <= 1) return 'program'
  if (segments.length === 2) return 'kegiatan'
  if (segments.length === 3) return 'kro'
  if (segments.length === 4) return 'ro'
  if (segments.length === 5) return 'komponen'
  if (segments.length === 6) return 'subkomponen'
  return 'detil'
}

function buildPackageHierarchy(row: Cell[], headers: Cell[]): {
  kode: string
  programCode: string
  kegiatanCode: string
  kroCode: string
  roCode: string
  komponenCode: string
  subkomponenCode: string
  detilCode: string
} {
  const kdunit = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdunit)])
  const kdsatker = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdsatker)])
  const kdprogram = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdprogram)])
  const kdgiat = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdgiat)])
  const kdoutput = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdoutput)])
  const kdsoutput = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdsoutput)])
  const kdkmpnen = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdkmpnen)])
  const kdskmpnen = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdskmpnen)])
  const kode = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kode)])
  const programCode = joinCodeSegments(kdprogram)
  const kegiatanCode = joinCodeSegments(kdprogram, kdgiat)
  const kroCode = joinCodeSegments(kdprogram, kdgiat, kdoutput)
  const roCode = joinCodeSegments(kdprogram, kdgiat, kdoutput, kdsoutput)
  const komponenCode = joinCodeSegments(kdprogram, kdgiat, kdoutput, kdsoutput, kdkmpnen)
  const subkomponenCode = joinCodeSegments(kdprogram, kdgiat, kdoutput, kdsoutput, kdkmpnen, kdskmpnen)
  return {
    kode,
    programCode,
    kegiatanCode,
    kroCode,
    roCode,
    komponenCode,
    subkomponenCode,
    detilCode: joinCodeSegments(kdunit, kdsatker, kode || kdprogram, kdgiat, kdoutput, kdsoutput, kdkmpnen, kdskmpnen),
  }
}

function buildKontrakHierarchy(row: Cell[], headers: Cell[]): {
  kode: string
  programCode: string
  kegiatanCode: string
  kroCode: string
  roCode: string
  komponenCode: string
  subkomponenCode: string
  detilCode: string
} {
  const kode = textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.kode)])
  const parts = kode.split('.')
  const programCode = parts[2] ?? ''
  const kegiatanCode = joinCodeSegments(parts[2] ?? '', parts[3] ?? '')
  const kroCode = joinCodeSegments(parts[2] ?? '', parts[3] ?? '', parts[4] ?? '')
  const roCode = joinCodeSegments(parts[2] ?? '', parts[3] ?? '', parts[4] ?? '', parts[5] ?? '')
  const komponenCode = joinCodeSegments(parts[2] ?? '', parts[3] ?? '', parts[4] ?? '', parts[5] ?? '', parts[6] ?? '')
  const subkomponenCode = joinCodeSegments(parts[2] ?? '', parts[3] ?? '', parts[4] ?? '', parts[5] ?? '', parts[6] ?? '', parts[7] ?? '')
  return {
    kode,
    programCode,
    kegiatanCode,
    kroCode,
    roCode,
    komponenCode,
    subkomponenCode,
    detilCode: kode,
  }
}

function buildRkaklHierarchy(row: Cell[], headers: Cell[]): {
  kode: string
  programCode: string
  kegiatanCode: string
  kroCode: string
  roCode: string
  komponenCode: string
  subkomponenCode: string
  detilCode: string
} {
  const kdprogram = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdprogram)])
  const kdgiat = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdgiat)])
  const kdoutput = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdoutput)])
  const kdsoutput = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdsoutput)])
  const kdkmpnen = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdkmpnen)])
  const kdskmpnen = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdskmpnen)])
  const kdakun = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdakun)])
  const noitem = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.noitem)])
  return {
    kode: joinCodeSegments(kdprogram, kdgiat, kdoutput, kdsoutput, kdkmpnen, kdskmpnen, kdakun, noitem),
    programCode: joinCodeSegments(kdprogram),
    kegiatanCode: joinCodeSegments(kdprogram, kdgiat),
    kroCode: joinCodeSegments(kdprogram, kdgiat, kdoutput),
    roCode: joinCodeSegments(kdprogram, kdgiat, kdoutput, kdsoutput),
    komponenCode: joinCodeSegments(kdprogram, kdgiat, kdoutput, kdsoutput, kdkmpnen),
    subkomponenCode: joinCodeSegments(kdprogram, kdgiat, kdoutput, kdsoutput, kdkmpnen, kdskmpnen),
    detilCode: joinCodeSegments(kdprogram, kdgiat, kdoutput, kdsoutput, kdkmpnen, kdskmpnen, kdakun, noitem),
  }
}

export function parsePaketWorkbook(workbook: ExcelJS.Workbook): IemonPaketRow[] {
  return workbook.worksheets.flatMap((sheet) => parsePaketSheet(sheet))
}

function parsePaketSheet(sheet: ExcelJS.Worksheet): IemonPaketRow[] {
  const headerRow = detectHeaderRow(sheet, PAKET_HEADER_ALIASES)
  const headers = readRow(sheet, headerRow)
  const monthlyPlanFinanceColumns = packageMonthColumns(headers, 'ren_keu')
  const monthlyActualFinanceColumns = packageMonthColumns(headers, 'progres_keu')
  const monthlyPlanPhysicalColumns = packageMonthColumns(headers, 'ren_fis')
  const monthlyActualPhysicalColumns = packageMonthColumns(headers, 'progres_fisik')

  const rows: IemonPaketRow[] = []
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = readRow(sheet, rowNumber)
    const label = normalizeIemonLabel(textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.nmpaket)]))
    const kode = textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kode)])
    if (!label && !kode) continue

    const hierarchy = buildPackageHierarchy(row, headers)
    const pagu51 = toNumber(row[getColumn(headers, ['pagu_51'])])
    const pagu52 = toNumber(row[getColumn(headers, ['pagu_52'])])
    const pagu53 = toNumber(row[getColumn(headers, ['pagu_53'])])
    const paguRpm = toNumber(row[getColumn(headers, ['pagu_rpm'])])
    const paguSbsn = toNumber(row[getColumn(headers, ['pagu_sbsn'])])
    const paguPhln = toNumber(row[getColumn(headers, ['pagu_phln'])])
    const paguTotalRaw = toNumber(row[getColumn(headers, ['pagu_total'])])
    const real51 = toNumber(row[getColumn(headers, ['real_51'])])
    const real52 = toNumber(row[getColumn(headers, ['real_52'])])
    const real53 = toNumber(row[getColumn(headers, ['real_53'])])
    const realRpm = toNumber(row[getColumn(headers, ['real_rpm'])])
    const realSbsn = toNumber(row[getColumn(headers, ['real_sbsn'])])
    const realPhln = toNumber(row[getColumn(headers, ['real_phln'])])
    const realTotalRaw = toNumber(row[getColumn(headers, ['real_total'])])
    const realTotal = realTotalRaw || real51 + real52 + real53 + realRpm + realSbsn + realPhln
    const paguTotal = paguTotalRaw || pagu51 + pagu52 + pagu53 + paguRpm + paguSbsn + paguPhln
    const progressKeuangan = toPercent(row[getColumn(headers, ['progres_keuangan'])])
    const progressFisik = toPercent(row[getColumn(headers, ['progres_fisik'])])

    rows.push({
      source: 'paket',
      kode,
      label,
      cleanLabel: normalizeIemonLabel(label),
      category: inferCategory(label),
      programCode: hierarchy.programCode,
      kegiatanCode: hierarchy.kegiatanCode,
      kroCode: hierarchy.kroCode,
      roCode: hierarchy.roCode,
      komponenCode: hierarchy.komponenCode,
      subkomponenCode: hierarchy.subkomponenCode,
      detilCode: hierarchy.detilCode,
      kdsatker: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdsatker)]),
      kdunit: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdunit)]),
      kdprogram: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdprogram)]),
      kdgiat: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdgiat)]),
      kdoutput: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdoutput)]),
      kdsoutput: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdsoutput)]),
      kdkmpnen: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdkmpnen)]),
      kdskmpnen: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdskmpnen)]),
      metode: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.metode)]) || null,
      pengadaan: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.kdpengadaan)]) || null,
      volume: toNumber(row[getColumn(headers, PAKET_HEADER_ALIASES.vol)]),
      satuan: textCell(row[getColumn(headers, PAKET_HEADER_ALIASES.sat)]) || null,
      tanggalMulai: toDateIso(row[getColumn(headers, PAKET_HEADER_ALIASES.tgl_mulai)]),
      tanggalSelesai: toDateIso(row[getColumn(headers, PAKET_HEADER_ALIASES.tgl_selesai)]),
      pagu51,
      pagu52,
      pagu53,
      paguRpm,
      paguSbsn,
      paguPhln,
      paguTotal,
      real51,
      real52,
      real53,
      realRpm,
      realSbsn,
      realPhln,
      realTotal,
      progressKeuangan,
      progressFisik,
      monthlyPlanFinance: monthlyPlanFinanceColumns.map((column) => toPercent(row[column])),
      monthlyActualFinance: monthlyActualFinanceColumns.map((column) => toPercent(row[column])),
      monthlyPlanPhysical: monthlyPlanPhysicalColumns.map((column) => toPercent(row[column])),
      monthlyActualPhysical: monthlyActualPhysicalColumns.map((column) => toPercent(row[column])),
    })
  }

  return rows
}

export function parseKontraktualWorkbook(workbook: ExcelJS.Workbook): IemonKontraktualRow[] {
  return workbook.worksheets.flatMap((sheet) => parseKontraktualSheet(sheet))
}

function parseKontraktualSheet(sheet: ExcelJS.Worksheet): IemonKontraktualRow[] {
  const headerRow = detectHeaderRow(sheet, KONTRAK_HEADER_ALIASES)
  const headers = readRow(sheet, headerRow)
  const rows: IemonKontraktualRow[] = []

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = readRow(sheet, rowNumber)
    const label = normalizeIemonLabel(textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.nmpaket)]))
    const kode = textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.kode)])
    if (!label && !kode) continue

    const hierarchy = buildKontrakHierarchy(row, headers)
    rows.push({
      source: 'kontraktual',
      kode,
      label,
      cleanLabel: normalizeIemonLabel(label),
      category: inferCategory(label, textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.metode)]) || null, textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.jenis_kontrak)]) || null),
      programCode: hierarchy.programCode,
      kegiatanCode: hierarchy.kegiatanCode,
      kroCode: hierarchy.kroCode,
      roCode: hierarchy.roCode,
      komponenCode: hierarchy.komponenCode,
      subkomponenCode: hierarchy.subkomponenCode,
      detilCode: hierarchy.detilCode,
      kdsatker: textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.kdsatker)]),
      metode: textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.metode)]) || null,
      jenisKontrak: textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.jenis_kontrak)]) || null,
      volume: toNumber(row[getColumn(headers, KONTRAK_HEADER_ALIASES.vol)]),
      satuan: textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.sat)]) || null,
      tanggalMulai: toDateIso(row[getColumn(headers, KONTRAK_HEADER_ALIASES.tgl_mulai)]),
      tanggalSelesai: toDateIso(row[getColumn(headers, KONTRAK_HEADER_ALIASES.tgl_selesai)]),
      jadwalPengumuman: toDateIso(row[getColumn(headers, KONTRAK_HEADER_ALIASES.jadwal_pengumuman)]),
      jadwalPemenang: toDateIso(row[getColumn(headers, KONTRAK_HEADER_ALIASES.jadwal_pemenang)]),
      jadwalKontrak: toDateIso(row[getColumn(headers, KONTRAK_HEADER_ALIASES.jadwal_kontrak)]),
      status: textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.status)]) || null,
      nilaiKontrak: toNumber(row[getColumn(headers, KONTRAK_HEADER_ALIASES.nilai_kontrak)]),
      nomorKontrak: textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.nomor_kontrak)]) || null,
      rekanan: textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.rkn_nama)]) || null,
      npwp: textCell(row[getColumn(headers, KONTRAK_HEADER_ALIASES.rkn_npwp)]) || null,
      paguRpm: toNumber(row[getColumn(headers, KONTRAK_HEADER_ALIASES.pagu_rpm)]),
      paguSbsn: toNumber(row[getColumn(headers, KONTRAK_HEADER_ALIASES.pagu_sbsn)]),
      paguPhln: toNumber(row[getColumn(headers, KONTRAK_HEADER_ALIASES.pagu_phln)]),
      paguTotalDipa: toNumber(row[getColumn(headers, KONTRAK_HEADER_ALIASES.pagu_total_dipa)]),
      paguPengadaan: toNumber(row[getColumn(headers, KONTRAK_HEADER_ALIASES.pagu_pengadaan)]),
      realisasi: toNumber(row[getColumn(headers, KONTRAK_HEADER_ALIASES.realisasi)]),
      progressKeuangan: toPercent(row[getColumn(headers, KONTRAK_HEADER_ALIASES.progres_keuangan)]),
      progressFisik: toPercent(row[getColumn(headers, KONTRAK_HEADER_ALIASES.progres_fisik)]),
    })
  }

  return rows
}

export function parseRkaklWorkbook(workbook: ExcelJS.Workbook): IemonRkaklRow[] {
  return workbook.worksheets.flatMap((sheet) => parseRkaklSheet(sheet))
}

function parseRkaklSheet(sheet: ExcelJS.Worksheet): IemonRkaklRow[] {
  const headerRow = detectHeaderRow(sheet, RKAKL_HEADER_ALIASES)
  const headers = readRow(sheet, headerRow)
  const monthlyBudgetColumns = rkaklMonthColumns(headers)
  const rows: IemonRkaklRow[] = []

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = readRow(sheet, rowNumber)
    const label = normalizeIemonLabel(textCell(row[getColumn(headers, ['nmitem'])] || row[getColumn(headers, RKAKL_HEADER_ALIASES.header2)]))
    const kdakun = textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdakun)])
    if (!label && !kdakun) continue

    const hierarchy = buildRkaklHierarchy(row, headers)
    const jumlah = toNumber(row[getColumn(headers, RKAKL_HEADER_ALIASES.jumlah)])
    const paguPhln = toNumber(row[getColumn(headers, RKAKL_HEADER_ALIASES.paguphln)])
    const paguRmp = toNumber(row[getColumn(headers, RKAKL_HEADER_ALIASES.pagurmp)])
    const paguRkp = toNumber(row[getColumn(headers, RKAKL_HEADER_ALIASES.pagurkp)])
    const hargaSatuan = toNumber(row[getColumn(headers, RKAKL_HEADER_ALIASES.hargasat)])
    const volume = toNumber(row[getColumn(headers, RKAKL_HEADER_ALIASES.volkeg)])
    const blokir = sumColumns(row, [
      getColumn(headers, ['rphblokir']),
      getColumn(headers, ['blokirphln']),
      getColumn(headers, ['blokirrmp']),
      getColumn(headers, ['blokirrkp']),
    ].filter((index) => index >= 0))

    rows.push({
      source: 'rkakl',
      kode: hierarchy.kode,
      label,
      cleanLabel: normalizeIemonLabel(label),
      category: inferCategory(label),
      programCode: hierarchy.programCode,
      kegiatanCode: hierarchy.kegiatanCode,
      kroCode: hierarchy.kroCode,
      roCode: hierarchy.roCode,
      komponenCode: hierarchy.komponenCode,
      subkomponenCode: hierarchy.subkomponenCode,
      detilCode: hierarchy.detilCode,
      kdsatker: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdsatker)]),
      kdunit: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdunit)]),
      kdprogram: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdprogram)]),
      kdgiat: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdgiat)]),
      kdoutput: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdoutput)]),
      kdsoutput: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdsoutput)]),
      kdkmpnen: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdkmpnen)]),
      kdskmpnen: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.kdskmpnen)]),
      kdakun,
      noitem: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.noitem)]),
      header1: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.header1)]) || null,
      header2: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.header2)]) || null,
      volume,
      satuan: textCell(row[getColumn(headers, RKAKL_HEADER_ALIASES.satkeg)]) || null,
      hargaSatuan,
      jumlah: jumlah || paguRmp + paguRkp + paguPhln,
      paguPhln,
      paguRmp,
      paguRkp,
      blokir,
      monthlyBudget: monthlyBudgetColumns.map((column) => toNumber(row[column])),
    })
  }

  return rows
}

export async function parseIemonWorkbookSet(files: {
  paket: ArrayBuffer
  kontraktual: ArrayBuffer
  rkakl: ArrayBuffer
}): Promise<IemonDataset> {
  const paketWorkbook = new ExcelJS.Workbook()
  const kontrakWorkbook = new ExcelJS.Workbook()
  const rkaklWorkbook = new ExcelJS.Workbook()

  await Promise.all([
    paketWorkbook.xlsx.load(files.paket),
    kontrakWorkbook.xlsx.load(files.kontraktual),
    rkaklWorkbook.xlsx.load(files.rkakl),
  ])

  const paket = parsePaketWorkbook(paketWorkbook)
  const kontraktual = parseKontraktualWorkbook(kontrakWorkbook)
  const rkakl = parseRkaklWorkbook(rkaklWorkbook)

  return {
    uploadedAt: new Date().toISOString(),
    sourceFiles: {
      paket: null,
      kontraktual: null,
      rkakl: null,
    },
    paket,
    kontraktual,
    rkakl,
  }
}

export function normalizeIemonDataset(dataset: IemonDataset): IemonDataset {
  return {
    ...dataset,
    paket: dataset.paket.map((row) => ({
      ...row,
      label: normalizeIemonLabel(row.label),
      cleanLabel: normalizeIemonLabel(row.cleanLabel || row.label),
      category: row.category || inferCategory(row.label, row.metode),
      progressKeuangan: toPercent(row.progressKeuangan),
      progressFisik: toPercent(row.progressFisik),
    })),
    kontraktual: dataset.kontraktual.map((row) => ({
      ...row,
      label: normalizeIemonLabel(row.label),
      cleanLabel: normalizeIemonLabel(row.cleanLabel || row.label),
      category: row.category || inferCategory(row.label, row.metode, row.jenisKontrak),
      progressKeuangan: toPercent(row.progressKeuangan),
      progressFisik: toPercent(row.progressFisik),
    })),
    rkakl: dataset.rkakl.map((row) => ({
      ...row,
      label: normalizeIemonLabel(row.label),
      cleanLabel: normalizeIemonLabel(row.cleanLabel || row.label),
      category: row.category || inferCategory(row.label),
      jumlah: toNumber(row.jumlah),
      paguPhln: toNumber(row.paguPhln),
      paguRmp: toNumber(row.paguRmp),
      paguRkp: toNumber(row.paguRkp),
      blokir: toNumber(row.blokir),
      monthlyBudget: row.monthlyBudget.map((value) => toNumber(value)),
    })),
  }
}

export function classifyIemonLevel(code: string): IemonLevel {
  return classifyLevelFromCode(code)
}
