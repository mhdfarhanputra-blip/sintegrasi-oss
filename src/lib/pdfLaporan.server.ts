/**
 * pdfLaporan.server.ts — Pembuat laporan PDF di SERVER.
 *
 * MENGAPA DI SERVER
 *   Sebelumnya PDF dibuat di peramban dengan `jspdf` (±107 KB setelah gzip).
 *   Pustaka itu harus diunduh setiap kali pengguna menekan tombol PDF, dan ikut
 *   membebani halaman modul. Dengan memindahkannya ke server:
 *     - peramban TIDAK mengunduh pustaka PDF sama sekali,
 *     - hasil PDF seragam untuk semua perangkat,
 *     - sejalan dengan laporan Excel yang sudah dibuat di server.
 *
 * BERKAS INI HANYA UNTUK SERVER. Jangan diimpor dari komponen klien — modul
 * Node jspdf akan menggagalkan build peramban.
 *
 * Gaya mengikuti kop laporan Excel: logo organisasi (opsional), judul navy, garis,
 * baris total, dan footer nomor halaman.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { promises as fs } from 'node:fs'

export type KolomPdf = { judul: string; lebar?: number }

export type OpsiLaporanPdf = {
  modul: string
  judul: string
  periode?: string
  kolom: string[]
  baris: (string | number)[][]
  /** Nomor kolom (0-based) yang dijumlahkan pada baris TOTAL. */
  kolomJumlah?: number[]
  /** Arah kertas; laporan lebar sebaiknya landscape. */
  landscape?: boolean
}

const NAVY: [number, number, number] = [15, 44, 89]
const GOLD: [number, number, number] = [199, 154, 74]
const ABU: [number, number, number] = [110, 120, 135]
const ZEBRA: [number, number, number] = [244, 246, 250]

const MARGIN = 10

/** Baca logo organisasi (opsional) dari folder public. null bila tidak ditemukan. */
async function bacaLogo(): Promise<{ dataUrl: string; rasio: number } | null> {
  const kandidat = [
    process.env.SINTEGRASI_LOGO_PDF_PATH,
    `${process.cwd()}/public/logo-pu.png`,
    '/var/task/public/logo-pu.png',
  ].filter(Boolean) as string[]

  for (const jalur of kandidat) {
    try {
      const buf = await fs.readFile(jalur)
      return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, rasio: 280 / 317 }
    } catch {
      // coba kandidat berikutnya
    }
  }
  return null
}

function rupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`
}

/**
 * Susun laporan PDF dan kembalikan sebagai Buffer.
 */
export async function buatLaporanPdf(opsi: OpsiLaporanPdf): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: opsi.landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const lebarHalaman = doc.internal.pageSize.getWidth()

  // ---------- Kop ----------
  let y = 12
  const logo = await bacaLogo()
  if (logo) {
    const tinggi = 14
    const lebar = tinggi * logo.rasio
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, y - 4, lebar, tinggi)
  }

  const xTeks = logo ? MARGIN + 14 * logo.rasio + 4 : MARGIN

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text((process.env.REPORT_ORG_NAME ?? 'NAMA ORGANISASI').toUpperCase(), xTeks, y + 1)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...ABU)
  doc.text('Sistem Informasi Terintegrasi — SINTEGRASI', xTeks, y + 6)

  y += 14
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, lebarHalaman - MARGIN, y)
  y += 6

  // ---------- Judul ----------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NAVY)
  doc.text(opsi.judul, MARGIN, y)
  y += 5

  if (opsi.periode) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...ABU)
    doc.text(opsi.periode, MARGIN, y)
    y += 4
  }

  doc.setFontSize(8)
  doc.setTextColor(...ABU)
  doc.text(
    `Dicetak: ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`,
    MARGIN,
    y,
  )
  y += 4

  // ---------- Baris TOTAL ----------
  const barisTampil = [...opsi.baris]
  if (opsi.kolomJumlah && opsi.kolomJumlah.length > 0) {
    const total: (string | number)[] = opsi.kolom.map(() => '')
    total[0] = 'TOTAL'
    for (const idx of opsi.kolomJumlah) {
      const jumlah = opsi.baris.reduce((acc, r) => {
        const v = r[idx]
        const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''))
        return acc + (Number.isFinite(n) ? n : 0)
      }, 0)
      total[idx] = rupiah(jumlah)
    }
    barisTampil.push(total)
  }

  // ---------- Tabel ----------
  autoTable(doc, {
    head: [opsi.kolom],
    body: barisTampil.map((r) => r.map((c) => (c === null || c === undefined ? '—' : String(c)))),
    startY: y + 2,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak', lineColor: [213, 219, 229], lineWidth: 0.1 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    theme: 'grid',
    didParseCell: (data) => {
      // Baris terakhir = TOTAL: tebalkan.
      if (opsi.kolomJumlah && data.section === 'body' && data.row.index === barisTampil.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [232, 237, 245]
      }
    },
  })

  // ---------- Footer ----------
  const jumlahHalaman = doc.getNumberOfPages()
  const tinggiHalaman = doc.internal.pageSize.getHeight()
  for (let h = 1; h <= jumlahHalaman; h += 1) {
    doc.setPage(h)
    doc.setFontSize(7)
    doc.setTextColor(...ABU)
    doc.setDrawColor(213, 219, 229)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, tinggiHalaman - 12, lebarHalaman - MARGIN, tinggiHalaman - 12)
    doc.text('Dicetak otomatis oleh SINTEGRASI', MARGIN, tinggiHalaman - 8)
    doc.text(`Halaman ${h} dari ${jumlahHalaman}`, lebarHalaman - MARGIN, tinggiHalaman - 8, {
      align: 'right',
    })
  }

  return Buffer.from(doc.output('arraybuffer'))
}

/** Nama berkas laporan: {modul}-{tanggal}.pdf */
export function namaBerkasPdf(modul: string): string {
  return `${modul}-${new Date().toISOString().slice(0, 10)}.pdf`
}
