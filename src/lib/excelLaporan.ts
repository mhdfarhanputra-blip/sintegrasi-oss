import ExcelJS from 'exceljs'

/**
 * excelLaporan.ts — Pembuat laporan Excel berformat untuk SINTEGRASI.
 *
 * Latar belakang: ekspor sebelumnya hanya CSV mentah, sehingga hasilnya harus
 * dirapikan manual di Excel (lebar kolom, garis tabel, format rupiah, judul).
 * Untuk laporan yang diserahkan ke pihak lain, itu pekerjaan berulang yang
 * membuang waktu.
 *
 * Berkas ini menyediakan satu jalur pembuatan laporan yang konsisten:
 *   - judul laporan + periode + waktu cetak
 *   - kepala tabel berwarna, teks putih, garis penuh
 *   - baris belang (zebra) agar mudah dibaca
 *   - tipe kolom: teks / angka / rupiah / tanggal / status (berwarna)
 *   - baris total otomatis untuk kolom angka/rupiah
 *   - lebar kolom, pembekuan kepala, dan filter otomatis
 *   - area cetak A4 melintang siap ekspor PDF
 */

export type TipeKolom = 'teks' | 'angka' | 'rupiah' | 'tanggal' | 'status'

export type KolomLaporan<T> = {
  /** Judul kolom pada berkas Excel */
  judul: string
  /** Pengambil nilai dari baris data */
  nilai: (row: T) => string | number | Date | null | undefined
  tipe?: TipeKolom
  lebar?: number
  /** Total dijumlahkan pada baris terakhir (hanya untuk angka/rupiah) */
  jumlahkan?: boolean
}

export type OpsiLaporan<T> = {
  /** Nama modul, dipakai sebagai nama sheet dan nama berkas */
  modul: string
  /** Judul besar di atas tabel */
  judul: string
  /** Keterangan periode/filter yang berlaku */
  periode?: string
  kolom: KolomLaporan<T>[]
  baris: T[]
  /** Nama instansi pada kop laporan */
  instansi?: string
}

/**
 * Logo organisasi (opsional) pada kop laporan.
 *
 * Dibaca dari public/logo-pu.png saat runtime agar setiap berkas Excel memuat
 * identitas resmi. Path disusun dari process.cwd() (bukan `new URL(import.meta)`)
 * karena Turbopack mencoba mem-bundel aset statis dan gagal me-resolve-nya.
 *
 * Bila berkas tidak ditemukan, laporan TETAP dibuat tanpa logo — kegagalan logo
 * tidak boleh menggagalkan pembuatan laporan.
 */
async function bacaLogo(): Promise<Buffer | null> {
  const kandidat = [
    process.env.SINTEGRASI_LOGO_PATH,
    `${process.cwd()}/public/logo-pu.png`,
    '/var/task/public/logo-pu.png',
  ].filter(Boolean) as string[]

  const fs = await import('fs/promises')
  for (const jalur of kandidat) {
    try {
      return await fs.readFile(jalur)
    } catch {
      continue
    }
  }
  return null
}

const WARNA = {
  navy: 'FF0F2C59',
  navyTerang: 'FF1B3C6E',
  zebra: 'FFF4F6FA',
  garis: 'FFD5DBE5',
  totalBg: 'FFE8EDF5',
  emerald: 'FFD1FAE5',
  amber: 'FFFEF3C7',
  rose: 'FFFEE2E2',
} as const

const FORMAT_RUPIAH = '"Rp" #,##0'
const FORMAT_ANGKA = '#,##0.##'
const FORMAT_TANGGAL = 'dd-mmm-yyyy'

function formatTanggal(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Warna latar untuk kolom status agar kondisi penting langsung terlihat. */
function warnaStatus(nilai: string): string | null {
  const t = nilai.toLowerCase()
  if (t.includes('baik') || t.includes('lunas') || t.includes('selesai') || t.includes('digunakan')) return WARNA.emerald
  if (t.includes('rusak ringan') || t.includes('menunggu') || t.includes('pending')) return WARNA.amber
  if (t.includes('rusak berat') || t.includes('tolak') || t.includes('gagal')) return WARNA.rose
  return null
}

export async function buatLaporanExcel<T>(opsi: OpsiLaporan<T>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SINTEGRASI'
  wb.created = new Date()

  const namaSheet = opsi.modul.slice(0, 28).replace(/[\\/?*[\]:]/g, '-') || 'Laporan'
  const ws = wb.addWorksheet(namaSheet, {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })

  ws.columns = opsi.kolom.map((k) => ({ width: k.lebar ?? 18 }))
  const jmlKolom = opsi.kolom.length

  // ---- Kop laporan (baris 1-3) ----
  // Logo organisasi (opsional) ditempatkan pada baris judul, di atas kolom pertama.
  const logo = await bacaLogo()
  if (logo) {
    const id = wb.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: 'png' })
    // Rasio logo PU ≈ 280x317 (0.883). Tinggi 52 px agar seimbang dengan judul.
    ws.addImage(id, {
      tl: { col: 0.15, row: 0.1 },
      ext: { width: 46, height: 52 },
      editAs: 'oneCell',
    })
  }

  ws.mergeCells(1, 1, 1, jmlKolom)
  const judul = ws.getCell(1, 1)
  judul.value = opsi.judul
  judul.font = { bold: true, size: 15, color: { argb: WARNA.navy } }
  judul.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, jmlKolom)
  const sub = ws.getCell(2, 1)
  const waktu = new Date().toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  sub.value = [opsi.instansi ?? 'SINTEGRASI', opsi.periode ? `Periode: ${opsi.periode}` : null, `Dicetak: ${waktu}`]
    .filter(Boolean).join('  •  ')
  sub.font = { size: 9, color: { argb: 'FF5A6678' } }
  sub.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 16

  ws.getRow(3).height = 6 // spacer

  // ---- Kepala tabel (baris 4) ----
  const barisKepala = 4
  const kepala = ws.getRow(barisKepala)
  opsi.kolom.forEach((k, i) => {
    const sel = kepala.getCell(i + 1)
    sel.value = k.judul
    sel.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.navy } }
    sel.alignment = {
      horizontal: k.tipe === 'angka' || k.tipe === 'rupiah' ? 'right' : 'center',
      vertical: 'middle',
      wrapText: true,
    }
    sel.border = {
      top: { style: 'thin', color: { argb: WARNA.garis } },
      left: { style: 'thin', color: { argb: WARNA.garis } },
      bottom: { style: 'medium', color: { argb: WARNA.navy } },
      right: { style: 'thin', color: { argb: WARNA.garis } },
    }
  })
  kepala.height = 30

  // ---- Baris data ----
  const mulaiData = barisKepala + 1
  opsi.baris.forEach((row, idx) => {
    const r = ws.getRow(mulaiData + idx)
    opsi.kolom.forEach((k, ci) => {
      const sel = r.getCell(ci + 1)
      const asli = k.nilai(row)

      if (k.tipe === 'tanggal') {
        const d = formatTanggal(asli)
        sel.value = d ?? '—'
        if (d) sel.numFmt = FORMAT_TANGGAL
      } else if (k.tipe === 'rupiah' || k.tipe === 'angka') {
        const n = typeof asli === 'number' ? asli : Number(String(asli ?? '').replace(/[^0-9.-]/g, ''))
        sel.value = Number.isFinite(n) ? n : 0
        sel.numFmt = k.tipe === 'rupiah' ? FORMAT_RUPIAH : FORMAT_ANGKA
      } else {
        sel.value = asli == null || asli === '' ? '—' : String(asli)
      }

      sel.font = { size: 10, name: 'Calibri' }
      sel.alignment = {
        horizontal: k.tipe === 'angka' || k.tipe === 'rupiah' ? 'right' : k.tipe === 'tanggal' ? 'center' : 'left',
        vertical: 'middle',
        wrapText: k.tipe === 'teks',
      }
      sel.border = {
        top: { style: 'hair', color: { argb: WARNA.garis } },
        left: { style: 'hair', color: { argb: WARNA.garis } },
        bottom: { style: 'hair', color: { argb: WARNA.garis } },
        right: { style: 'hair', color: { argb: WARNA.garis } },
      }

      // Belang baris agar mata tidak melompat antar baris
      if (idx % 2 === 1) {
        sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.zebra } }
      }
      // Warna status menimpa belang
      if (k.tipe === 'status' && sel.value) {
        const w = warnaStatus(String(sel.value))
        if (w) sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: w } }
      }
    })
    r.height = 18
  })

  // ---- Baris total ----
  const kolomJumlah = opsi.kolom.filter((k) => k.jumlahkan && (k.tipe === 'angka' || k.tipe === 'rupiah'))
  if (kolomJumlah.length > 0 && opsi.baris.length > 0) {
    const r = ws.getRow(mulaiData + opsi.baris.length)
    opsi.kolom.forEach((k, ci) => {
      const sel = r.getCell(ci + 1)
      sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.totalBg } }
      sel.font = { bold: true, size: 10 }
      sel.border = {
        top: { style: 'medium', color: { argb: WARNA.navy } },
        left: { style: 'thin', color: { argb: WARNA.garis } },
        bottom: { style: 'double', color: { argb: WARNA.navy } },
        right: { style: 'thin', color: { argb: WARNA.garis } },
      }
      if (ci === 0) {
        sel.value = 'TOTAL'
        sel.alignment = { horizontal: 'left', vertical: 'middle' }
      } else if (k.jumlahkan) {
        const huruf = ws.getColumn(ci + 1).letter
        sel.value = { formula: `SUM(${huruf}${mulaiData}:${huruf}${mulaiData + opsi.baris.length - 1})` }
        sel.numFmt = k.tipe === 'rupiah' ? FORMAT_RUPIAH : FORMAT_ANGKA
        sel.alignment = { horizontal: 'right', vertical: 'middle' }
      }
    })
    r.height = 20
  }

  // ---- Filter & area cetak ----
  const hurufAkhir = ws.getColumn(jmlKolom).letter
  ws.autoFilter = { from: { row: barisKepala, column: 1 }, to: { row: barisKepala, column: jmlKolom } }
  ws.pageSetup.printArea = `A1:${hurufAkhir}${mulaiData + opsi.baris.length}`
  ws.headerFooter.oddFooter = '&L&SINTEGRASI&R Halaman &P dari &N'

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}

/** Nama berkas standar: {modul}-{tanggal}.xlsx */
export function namaBerkasLaporan(modul: string, ekstensi = 'xlsx'): string {
  const tanggal = new Date().toISOString().slice(0, 10)
  return `${modul}-${tanggal}.${ekstensi}`
}
