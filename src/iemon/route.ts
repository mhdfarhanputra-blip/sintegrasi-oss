import { NextResponse } from 'next/server'
import { requireModuleAccess } from '@/lib/apiAuth'
import { getIemonDataset } from '@/lib/iemonStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Umur cache untuk data iEMON (detik).
 *
 * Dataset hanya berubah saat push harian (cron 09:15 WIB) atau unggah manual
 * lewat CMS. Cache singkat membuat navigasi dashboard terasa instan tanpa
 * membuat data tampak basi. Saat pemuatan ulang paksa (`?fresh=1`) cache
 * dilewati sehingga operator selalu dapat angka terbaru.
 */
const CACHE_SECONDS = 30
const STALE_SECONDS = 120

export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.get('fresh') === '1'
  const cacheHeaders: Record<string, string> = fresh
    ? { 'Cache-Control': 'no-store' }
    : {
        'Cache-Control': `private, max-age=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
        'CDN-Cache-Control': `private, max-age=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
      }

  try {
    const auth = await requireModuleAccess('iemon')
    if ('response' in auth) return auth.response

    const result = await getIemonDataset()
    return NextResponse.json(result, { headers: cacheHeaders })
  } catch {
    // Jalur cadangan: tetap sajikan data agar dashboard tidak kosong.
    const result = await getIemonDataset()
    return NextResponse.json(result, { headers: cacheHeaders })
  }
}
