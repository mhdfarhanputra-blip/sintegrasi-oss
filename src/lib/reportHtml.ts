/**
 * Penghasil HTML laporan resmi (berkop) untuk dicetak / disimpan sebagai PDF.
 * Pendekatan ringan tanpa dependency: browser membuka dokumen lalu memicu
 * dialog cetak (Save as PDF). Semua nilai dinamis di-escape untuk mencegah
 * HTML injection.
 */

const APP_NAME = 'SINTEGRASI'
const BRAND_NAVY = '#0c1e3e'
const BRAND_GOLD = '#c79a4a'
const PAGE_SIZE = 'A4'
const PAGE_MARGIN = '1.5cm'
const ZEBRA_BG = '#f5f6f8'
const BORDER_COLOR = '#d7dbe0'
const EMPTY_LABEL = 'Tidak ada data'
const EMPTY_VALUE = '-'

export interface ReportColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  format?: (value: unknown, row: Record<string, unknown>) => string
}

export interface BuildReportOptions {
  title: string
  subtitle?: string
  columns: ReportColumn[]
  rows: Array<Record<string, unknown>>
  generatedBy: string
  generatedAt: string
}

/** Escape karakter HTML khusus agar tidak dieksekusi sebagai markup. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Nilai sel terformat dan ter-escape untuk satu kolom pada satu baris. */
function renderCell(column: ReportColumn, row: Record<string, unknown>): string {
  const raw = row[column.key]
  const formatted = column.format ? column.format(raw, row) : raw
  const text = formatted === null || formatted === undefined || formatted === '' ? EMPTY_VALUE : formatted
  const align = column.align ?? 'left'
  return `<td style="text-align:${align}">${escapeHtml(text)}</td>`
}

/** Baris header tabel. */
function renderHead(columns: ReportColumn[]): string {
  const cells = columns
    .map((c) => `<th style="text-align:${c.align ?? 'left'}">${escapeHtml(c.label)}</th>`)
    .join('')
  return `<thead><tr>${cells}</tr></thead>`
}

/** Seluruh baris data; tampilkan keterangan bila kosong. */
function renderTableRows(columns: ReportColumn[], rows: Array<Record<string, unknown>>): string {
  if (!rows || rows.length === 0) {
    return `<tbody><tr><td colspan="${columns.length}" class="empty">${EMPTY_LABEL}</td></tr></tbody>`
  }
  const body = rows
    .map((row) => `<tr>${columns.map((c) => renderCell(c, row)).join('')}</tr>`)
    .join('')
  return `<tbody>${body}</tbody>`
}

/** Blok CSS print-friendly (A4, zebra, kop, footer). */
function renderStyle(): string {
  return `<style>
    @page { size: ${PAGE_SIZE}; margin: ${PAGE_MARGIN}; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1f2933; margin: 0; font-size: 12px; }
    .kop { border-bottom: 3px solid ${BRAND_GOLD}; padding-bottom: 12px; margin-bottom: 20px; }
    .app-name { color: ${BRAND_NAVY}; font-size: 20px; font-weight: 700; letter-spacing: 1px; }
    .report-title { color: ${BRAND_NAVY}; font-size: 16px; font-weight: 700; margin-top: 10px; }
    .report-subtitle { color: #52606d; font-size: 12px; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid ${BORDER_COLOR}; padding: 6px 8px; vertical-align: top; }
    thead th { background: ${BRAND_NAVY}; color: #ffffff; font-size: 11px; }
    tbody tr:nth-child(even) { background: ${ZEBRA_BG}; }
    td.empty { text-align: center; color: #7b8794; font-style: italic; padding: 16px; }
    .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid ${BORDER_COLOR}; font-size: 10px; color: #52606d; }
    @media print { .footer { position: fixed; bottom: 0; left: 0; right: 0; } }
  </style>`
}

/** Bangun dokumen HTML laporan lengkap siap cetak. */
export function buildReportHtml(options: BuildReportOptions): string {
  const { title, subtitle, columns, rows, generatedBy, generatedAt } = options
  const subtitleHtml = subtitle ? `<div class="report-subtitle">${escapeHtml(subtitle)}</div>` : ''
  const footerText = `Dicetak oleh ${escapeHtml(generatedBy)} pada ${escapeHtml(generatedAt)}`
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${renderStyle()}
</head>
<body>
  <header class="kop">
    <div class="app-name">${escapeHtml(APP_NAME)}</div>
    <div class="report-title">${escapeHtml(title)}</div>
    ${subtitleHtml}
  </header>
  <table>
    ${renderHead(columns)}
    ${renderTableRows(columns, rows)}
  </table>
  <footer class="footer">${footerText}</footer>
  <script>window.onload = function () { window.print() }</script>
</body>
</html>`
}
