import ExcelJS from 'exceljs'
import { normalizeUraian } from '@/lib/realisasiNormalize'

export interface RealisasiRow {
  uraian: string
  kode_akun: string | null
  level: string
  pagu: number
  realisasi_lalu: number
  realisasi_ini: number
  realisasi_sd: number
  persen: number
  sisa: number
}

type Cell = string | number | null

interface ColumnMap {
  mode: 'fa-detail' | 'table'
  dataStart: number
  uraianStart: number
  uraianEnd: number
  pagu: number
  realisasiLalu?: number
  realisasiIni?: number
  realisasiSd: number
  persen?: number
  sisa?: number
  kodeAkun?: number
  level?: number
}

const DEFAULT_FA_MAP: Omit<ColumnMap, 'dataStart'> = {
  mode: 'fa-detail',
  uraianStart: 0,
  uraianEnd: 16,
  pagu: 16,
  realisasiLalu: 22,
  realisasiIni: 23,
  realisasiSd: 25,
  persen: 28,
  sisa: 30,
}

const MIN_DATA_COLUMNS = 35
const TOTAL_LABEL = 'JUMLAH SELURUHNYA'
const VALID_LEVELS = new Set(['total', 'program', 'kegiatan', 'kro', 'ro', 'komponen', 'subkomponen', 'akun', 'detail', 'item'])

function scalarCell(value: ExcelJS.CellValue | undefined): Cell {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) {
      const result = value.result
      return typeof result === 'string' || typeof result === 'number' ? result : String(result)
    }
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('')
    }
  }
  return String(value)
}

function numericCell(value: Cell): number {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const compact = value.replace(/[^\d,.-]/g, '')
  const normalized =
    compact.includes(',') && compact.includes('.')
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function textCell(value: Cell): string {
  if (value == null) return ''
  return String(value).trim()
}

function normalizeText(value: Cell): string {
  return textCell(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .trim()
}

function readRow(sheet: ExcelJS.Worksheet, rowNumber: number): Cell[] {
  if (rowNumber < 1 || rowNumber > sheet.rowCount) return []
  const worksheetRow = sheet.getRow(rowNumber)
  return Array.from({ length: Math.max(MIN_DATA_COLUMNS, worksheetRow.cellCount) }, (_, index) =>
    scalarCell(worksheetRow.getCell(index + 1).value),
  )
}

function uniqueUraian(row: Cell[], start: number, end: number): string {
  const parts: string[] = []
  for (let col = start; col < Math.min(end, row.length); col++) {
    const current = textCell(row[col])
    if (!current) continue
    if (parts[parts.length - 1] !== current) parts.push(current)
  }
  return normalizeUraian(parts.join(' '))
}

function firstTextColumn(row: Cell[], start: number, end: number): number | null {
  for (let col = start; col < Math.min(end, row.length); col++) {
    if (textCell(row[col])) return col
  }
  return null
}

function findAccountCode(row: Cell[], start: number, end: number): string | null {
  for (let col = start; col < Math.min(end, row.length); col++) {
    const text = textCell(row[col])
    if (/^[1-9]\d{5}$/.test(text)) return text
  }
  return null
}

function classifyFaLevel(row: Cell[], map: ColumnMap, uraian: string, kodeAkun: string | null): string {
  if (uraian.toUpperCase() === TOTAL_LABEL) return 'total'
  if (kodeAkun) return 'akun'

  const firstCol = firstTextColumn(row, map.uraianStart, map.uraianEnd)
  if (firstCol == null) return 'item'

  const relativeCol = firstCol - map.uraianStart + 1
  const code = textCell(row[firstCol]).split(/\s+/)[0] ?? ''

  if (/^\d{5,6}\./.test(code) || relativeCol >= 13) return 'detail'
  if (/^[1-9]\d{5}$/.test(code)) return 'akun'
  if (/^[1-9]\d{5}\b/.test(uraian)) return 'akun'
  if (/^\d{3}\.[A-Z0-9]+$/i.test(code)) return 'subkomponen'
  if (/^\d{3}$/.test(code)) return 'komponen'
  if (/^[A-Z]{1,4}\.\d+$/i.test(code)) return relativeCol <= 2 ? 'kegiatan' : 'ro'
  if (/^[A-Z]{1,4}$/i.test(code)) return relativeCol <= 2 ? 'program' : 'kro'

  if (relativeCol <= 2) return 'program'
  if (relativeCol <= 4) return 'kro'
  if (relativeCol <= 5) return 'komponen'
  if (relativeCol <= 7) return 'subkomponen'
  if (relativeCol <= 12) return 'akun'
  return 'detail'
}

function normalizeLevel(value: Cell): string | null {
  const level = normalizeText(value)
  return VALID_LEVELS.has(level) ? level : null
}

function percentValue(value: Cell): number {
  const n = numericCell(value)
  return Math.abs(n) <= 1 ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100
}

function rowHasAnyAmount(row: Cell[], map: ColumnMap): boolean {
  return numericCell(row[map.pagu]) !== 0 || numericCell(row[map.realisasiSd]) !== 0
}

function parseWithMap(sheet: ExcelJS.Worksheet, map: ColumnMap): RealisasiRow[] {
  const results: RealisasiRow[] = []

  for (let rowNumber = map.dataStart; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = readRow(sheet, rowNumber)
    if (!rowHasAnyAmount(row, map)) continue

    const uraian = uniqueUraian(row, map.uraianStart, map.uraianEnd)
    if (!uraian) continue

    const kodeAkun =
      map.kodeAkun != null && textCell(row[map.kodeAkun])
        ? textCell(row[map.kodeAkun])
        : findAccountCode(row, map.uraianStart, map.uraianEnd)
    const level =
      map.level != null
        ? normalizeLevel(row[map.level]) ?? (kodeAkun ? 'akun' : 'item')
        : map.mode === 'fa-detail'
          ? classifyFaLevel(row, map, uraian, kodeAkun)
          : kodeAkun
            ? 'akun'
            : 'item'

    const pagu = numericCell(row[map.pagu])
    const realisasiSd = numericCell(row[map.realisasiSd])
    const sisa = map.sisa != null ? numericCell(row[map.sisa]) : pagu - realisasiSd
    const persen =
      map.persen != null && textCell(row[map.persen])
        ? percentValue(row[map.persen])
        : pagu > 0
          ? Math.round((realisasiSd / pagu) * 10000) / 100
          : 0

    results.push({
      uraian,
      kode_akun: kodeAkun,
      level,
      pagu,
      realisasi_lalu: map.realisasiLalu != null ? numericCell(row[map.realisasiLalu]) : 0,
      realisasi_ini: map.realisasiIni != null ? numericCell(row[map.realisasiIni]) : 0,
      realisasi_sd: realisasiSd,
      persen,
      sisa,
    })
  }
  return results
}

function findFaDataStart(sheet: ExcelJS.Worksheet): number {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 40); rowNumber++) {
    const row = readRow(sheet, rowNumber)
    const uraian = uniqueUraian(row, DEFAULT_FA_MAP.uraianStart, DEFAULT_FA_MAP.uraianEnd)
    if (uraian.toUpperCase() === TOTAL_LABEL) return rowNumber
  }

  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 40); rowNumber++) {
    const row = readRow(sheet, rowNumber)
    if (uniqueUraian(row, DEFAULT_FA_MAP.uraianStart, DEFAULT_FA_MAP.uraianEnd) && rowHasAnyAmount(row, { ...DEFAULT_FA_MAP, dataStart: rowNumber })) {
      return rowNumber
    }
  }

  return 9
}

function labelAt(rows: Cell[][], column: number): string {
  return rows.map((row) => normalizeText(row[column])).filter(Boolean).join(' ')
}

function findFirstColumn(labels: string[], predicate: (label: string) => boolean): number | undefined {
  const found = labels.findIndex(predicate)
  return found >= 0 ? found : undefined
}

function findSimpleTableMaps(sheet: ExcelJS.Worksheet): ColumnMap[] {
  const maps: ColumnMap[] = []
  const maxHeaderRow = Math.min(sheet.rowCount, 25)

  for (let rowNumber = 1; rowNumber <= maxHeaderRow; rowNumber++) {
    const headerRows = [readRow(sheet, rowNumber - 1), readRow(sheet, rowNumber), readRow(sheet, rowNumber + 1)]
    const labels = Array.from({ length: Math.max(...headerRows.map((row) => row.length)) }, (_, column) => labelAt(headerRows, column))

    const uraian = findFirstColumn(labels, (label) => /uraian|description|keterangan|nama/.test(label))
    const pagu = findFirstColumn(labels, (label) => /pagu|anggaran|budget/.test(label) && !/sisa/.test(label))
    const realisasiSd = findFirstColumn(labels, (label) =>
      /realisasi/.test(label) && (/sd|s d|sampai|periode|total|jumlah|akumulasi/.test(label)) && !/lalu|ini/.test(label),
    )
    const fallbackRealisasi = findFirstColumn(labels, (label) => /realisasi|serapan/.test(label) && !/lalu|ini|%|persen/.test(label))

    if (uraian == null || pagu == null || (realisasiSd == null && fallbackRealisasi == null)) continue

    maps.push({
      mode: 'table',
      dataStart: rowNumber + 1,
      uraianStart: uraian,
      uraianEnd: uraian + 1,
      pagu,
      realisasiLalu: findFirstColumn(labels, (label) => /lalu/.test(label)),
      realisasiIni: findFirstColumn(labels, (label) => /ini/.test(label)),
      realisasiSd: realisasiSd ?? fallbackRealisasi!,
      persen: findFirstColumn(labels, (label) => /%|persen|percent/.test(label)),
      sisa: findFirstColumn(labels, (label) => /sisa|saldo/.test(label)),
      kodeAkun: findFirstColumn(labels, (label) => /kode.*akun|akun/.test(label) && !/uraian/.test(label)),
      level: findFirstColumn(labels, (label) => /level|jenis|hierarki/.test(label)),
    })
  }

  return maps
}

function scoreRows(rows: RealisasiRow[]): number {
  if (rows.length === 0) return 0
  const hasTotal = rows.some((row) => row.level === 'total') ? 50 : 0
  const hasHierarchy = rows.some((row) => ['program', 'kegiatan', 'kro', 'ro', 'komponen', 'subkomponen'].includes(row.level)) ? 25 : 0
  const hasAkun = rows.some((row) => row.level === 'akun') ? 10 : 0
  const amountRows = rows.filter((row) => row.pagu !== 0 || row.realisasi_sd !== 0).length
  return amountRows + hasTotal + hasHierarchy + hasAkun
}

export async function parseExcelToRealisasi(buffer: ArrayBuffer): Promise<RealisasiRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  let bestRows: RealisasiRow[] = []
  let bestScore = 0

  for (const sheet of workbook.worksheets) {
    const maps: ColumnMap[] = [
      { ...DEFAULT_FA_MAP, dataStart: findFaDataStart(sheet) },
      ...findSimpleTableMaps(sheet),
    ]

    for (const map of maps) {
      const rows = parseWithMap(sheet, map)
      const score = scoreRows(rows)
      if (score > bestScore) {
        bestRows = rows
        bestScore = score
      }
    }
  }

  return bestRows
}
