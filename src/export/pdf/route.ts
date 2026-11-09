import { NextResponse } from 'next/server'
import { requireModuleAccess } from '@/lib/apiAuth'
import { internalApiError, mapSupabaseError } from '@/lib/apiError'
import { checkRateLimit } from '@/lib/rateLimit'
import { buatLaporanPdf, namaBerkasPdf } from '@/lib/pdfLaporan.server'
import type { ModuleKey } from '@/lib/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/export/pdf — Buat laporan PDF di SERVER.
 *
 * MENGAPA DI SERVER
 *   Sebelumnya PDF dibuat di peramban dengan `jspdf` (±107 KB setelah gzip).
 *   Pustaka itu harus diunduh setiap kali tombol PDF ditekan dan ikut membebani
 *   halaman modul. Dengan endpoint ini peramban hanya mengirim data tabel yang
 *   sudah tampil, lalu menerima berkas PDF — pustaka PDF tidak lagi diunduh
 *   pengguna sama sekali.
 *
 * Badan permintaan:
 *   {
 *     modul: 'keuangan' | 'persediaan' | 'iemon' | 'utilitas' | ...,
 *     judul: string,
 *     periode?: string,
 *     kolom: string[],
 *     baris: (string|number)[][],
 *     kolomJumlah?: number[],
 *     landscape?: boolean,
 *     namaBerkas?: string
 *   }
 *
 * Batasan: maksimum 5000 baris dan 24 kolom agar tidak menyalahi batas memori
 * fungsi serverless.
 */
const MAKS_BARIS = 5000
const MAKS_KOLOM = 24

type Body = {
  modul?: string
  judul?: string
  periode?: string
  kolom?: unknown
  baris?: unknown
  kolomJumlah?: unknown
  landscape?: boolean
  namaBerkas?: string
}

export async function POST(request: Request) {
  try {
    let body: Body
    try {
      body = (await request.json()) as Body
    } catch {
      return NextResponse.json({ error: 'Badan permintaan bukan JSON yang sah.' }, { status: 400 })
    }

    const modul = String(body.modul ?? '').toLowerCase() as ModuleKey
    const auth = await requireModuleAccess(modul)
    if ('response' in auth) return auth.response

    if (!checkRateLimit(`export-pdf:${auth.me.id}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Terlalu banyak ekspor, coba lagi sebentar.' }, { status: 429 })
    }

    // ---------- Validasi ----------
    const kolom = Array.isArray(body.kolom) ? body.kolom.map((k) => String(k)) : []
    if (kolom.length === 0 || kolom.length > MAKS_KOLOM) {
      return NextResponse.json(
        { error: `Jumlah kolom harus antara 1 dan ${MAKS_KOLOM}.` },
        { status: 400 },
      )
    }

    const barisMentah = Array.isArray(body.baris) ? body.baris : []
    if (barisMentah.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data untuk diekspor.' }, { status: 400 })
    }
    if (barisMentah.length > MAKS_BARIS) {
      return NextResponse.json(
        { error: `Terlalu banyak baris (${barisMentah.length}). Maksimum ${MAKS_BARIS}.` },
        { status: 400 },
      )
    }

    const baris = barisMentah.map((r) => {
      const arr = Array.isArray(r) ? r : []
      // Samakan panjang baris dengan jumlah kolom agar tabel tidak rusak.
      const hasil: (string | number)[] = []
      for (let i = 0; i < kolom.length; i += 1) {
        const v = arr[i]
        hasil.push(typeof v === 'number' ? v : v === null || v === undefined ? '' : String(v))
      }
      return hasil
    })

    const kolomJumlah = Array.isArray(body.kolomJumlah)
      ? (body.kolomJumlah as unknown[])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < kolom.length)
      : []

    const judul = String(body.judul ?? 'Laporan').slice(0, 160)

    const buffer = await buatLaporanPdf({
      modul,
      judul,
      periode: body.periode ? String(body.periode).slice(0, 200) : undefined,
      kolom,
      baris,
      kolomJumlah,
      landscape: Boolean(body.landscape),
    })

    const nama = (body.namaBerkas ? String(body.namaBerkas) : namaBerkasPdf(modul))
      .replace(/[^\w.\-]/g, '-')
      .slice(0, 120)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nama.endsWith('.pdf') ? nama : `${nama}.pdf`}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    // Kegagalan pembuatan PDF tidak boleh membocorkan detail internal.
    const mapped = mapSupabaseError('export pdf', err)
    if (mapped) return mapped
    return internalApiError('export pdf POST', err)
  }
}
