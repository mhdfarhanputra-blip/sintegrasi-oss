// Utilitas ekspor CSV sisi-klien (pattern dari AuditClient, dipakai lintas modul).
const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@']

export const escapeCsvCell = (value: string | number | null | undefined): string => {
  let cell = value == null ? '' : String(value)
  if (cell.length > 0 && CSV_FORMULA_PREFIXES.includes(cell.charAt(0))) {
    cell = `'${cell}`
  }
  if (/[",\n\r]/.test(cell)) {
    cell = `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

export const buildCsv = (headers: string[], rows: Array<Array<string | number | null | undefined>>): string => {
  const esc = (cells: Array<string | number | null | undefined>) => cells.map(escapeCsvCell).join(',')
  return ['\uFEFF' + esc(headers), ...rows.map((r) => esc(r))].join('\r\n')
}

export const downloadCsv = (content: string, fileName: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
