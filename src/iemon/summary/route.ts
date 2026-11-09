import { NextResponse } from 'next/server'
import { getIemonSnapshot } from '@/lib/iemonStore'
import { internalApiError } from '@/lib/apiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/iemon/summary
 *
 * Ringkasan PUBLIK (tanpa login) untuk monitoring/otomasi — HANYA agregat,
 * tidak ada detail paket/rekanan. Dipakai watchdog VPS (sintegrasi_status.py)
 * dan cek sehat harian.
 *
 * Kinerja:
 *   - data.json dan history.jsonl dibaca PARALEL (bukan berurutan)
 *   - respons di-cache 60 detik di edge Vercel + stale-while-revalidate 300 detik
 *     sehingga permintaan berulang tidak menyentuh storage sama sekali.
 *     Data hanya berubah sekali sehari (cron push 09:15 WIB), jadi jeda maksimal
 *     satu menit setelah push tidak terasa bagi pengguna.
 *
 * Respons:
 * {
 *   ok, uploadedAt (ISO|null), ageHours, paketCount, kontrakCount,
 *   rerataFisik, rerataKeuangan, paguTotal, realisasiTotal, source
 * }
 */

/** Umur cache (detik) — sejalan dengan siklus push harian. */
const CACHE_SECONDS = 60
const STALE_SECONDS = 300

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET() {
  try {
    const { data, source, history } = await getIemonSnapshot(30)
    const paket = data.paket ?? []
    const kontrak = data.kontraktual ?? []

    const paguTotal = paket.reduce((acc, p) => acc + (p.paguTotal || 0), 0)
    const realisasiTotal = paket.reduce((acc, p) => acc + (p.realTotal || 0), 0)

    const withFis = paket.filter((p) => typeof p.progressFisik === 'number' && p.progressFisik > 0)
    const withKeu = paket.filter((p) => typeof p.progressKeuangan === 'number' && p.progressKeuangan > 0)
    const rerataFisik = withFis.length > 0
      ? round2(withFis.reduce((acc, p) => acc + (p.progressFisik || 0), 0) / withFis.length)
      : null
    const rerataKeuangan = withKeu.length > 0
      ? round2(withKeu.reduce((acc, p) => acc + (p.progressKeuangan || 0), 0) / withKeu.length)
      : null

    let ageHours: number | null = null
    if (data.uploadedAt) {
      const t = Date.parse(data.uploadedAt)
      if (Number.isFinite(t)) ageHours = round2((Date.now() - t) / 3_600_000)
    }

    return NextResponse.json(
      {
        ok: true,
        uploadedAt: data.uploadedAt || null,
        ageHours,
        paketCount: paket.length,
        kontrakCount: kontrak.length,
        rerataFisik,
        rerataKeuangan,
        paguTotal,
        realisasiTotal,
        source,
        history,
      },
      {
        headers: {
          // Cache di edge: permintaan berulang dilayani tanpa menyentuh storage.
          'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
          'CDN-Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
        },
      },
    )
  } catch (error) {
    return internalApiError('Gagal membaca ringkasan iEMON', error)
  }
}
