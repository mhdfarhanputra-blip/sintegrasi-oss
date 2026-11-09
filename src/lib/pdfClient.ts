/**
 * pdfClient.ts — Permintaan laporan PDF ke server.
 *
 * MENGAPA BERUBAH
 *   Dulu PDF dibuat di peramban (`lib/exportPdf.ts` + jspdf ±107 KB). Pustaka itu
 *   harus diunduh setiap kali tombol PDF ditekan dan ikut membebani halaman modul.
 *   Sekarang peramban hanya mengirim data tabel yang SUDAH tampil ke
 *   `POST /api/export/pdf`, lalu menerima berkas PDF siap unduh.
 *
 *   Keuntungan: peramban tidak mengunduh pustaka PDF sama sekali, hasil seragam
 *   di semua perangkat, dan sejalan dengan laporan Excel yang juga dibuat server.
 */

export type ExportPdfOptions = {
  /** Kunci modul untuk pemeriksaan hak akses di server. */
  modul: string
  judul: string
  periode?: string
  kolom: string[]
  baris: (string | number)[][]
  /** Indeks kolom (0-based) yang dijumlahkan pada baris TOTAL. */
  kolomJumlah?: number[]
  landscape?: boolean
  namaBerkas?: string
}

/** Galat khusus agar pemanggil dapat menampilkan pesan yang jelas. */
export class ExportPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExportPdfError'
  }
}

/**
 * Minta server membuat PDF lalu unduh berkasnya.
 * Melempar ExportPdfError bila gagal.
 */
export async function unduhPdfLaporan(opsi: ExportPdfOptions): Promise<void> {
  if (!opsi.baris || opsi.baris.length === 0) {
    throw new ExportPdfError('Tidak ada data untuk diekspor')
  }

  let res: Response
  try {
    res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opsi),
    })
  } catch {
    throw new ExportPdfError('Tidak dapat menghubungi server. Periksa koneksi Anda.')
  }

  if (!res.ok) {
    // Server membalas JSON berisi pesan yang aman ditampilkan.
    let pesan = 'Gagal membuat PDF.'
    try {
      const json = (await res.json()) as { error?: string }
      if (json.error) pesan = json.error
    } catch {
      // biarkan pesan bawaan
    }
    throw new ExportPdfError(pesan)
  }

  const blob = await res.blob()

  // Nama berkas diambil dari header Content-Disposition bila tersedia.
  let nama = `laporan-${new Date().toISOString().slice(0, 10)}.pdf`
  const cd = res.headers.get('Content-Disposition') ?? ''
  const m = cd.match(/filename="([^"]+)"/)
  if (m) nama = m[1]

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nama
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Lepaskan memori setelah unduhan dimulai.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}
