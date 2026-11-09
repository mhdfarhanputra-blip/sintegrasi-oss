import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { internalApiError } from '@/lib/apiError'
import {
  getIemonDataset,
  saveIemonDataset,
  appendIemonHistory,
  summarizeIemonDataset,
} from '@/lib/iemonStore'
import type { IemonDataset } from '@/lib/iemonParser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/iemon/ingest — endpoint khusus push otomatis dari VPS (pipeline iEMON).
 *
 * Auth: header `Authorization: Bearer <INGEST_SECRET>` (env: INGEST_SECRET, fallback CRON_SECRET).
 *
 * Proteksi data (lesson insiden 2026-10-02: payload kosong menimpa data baik dengan 200 OK):
 *  1. Tolak body bukan JSON / bukan objek                       → 400
 *  2. Tolak `paket` bukan array / kosong                        → 422
 *  3. Tolak push yang paketnya < 50% data existing TANPA
 *     `"force": true` di body (mis. scrape rusak)               → 409
 *
 * Respons sukses: { success: true, message, summary }
 */

const MIN_PAKET = 1
const SHRINK_GUARD_RATIO = 0.5

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(request: Request) {
  try {
    const secret = process.env.INGEST_SECRET || process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: 'Ingest dinonaktifkan: INGEST_SECRET belum dikonfigurasi' },
        { status: 503 },
      )
    }

    const auth = request.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token || token !== secret) return unauthorized()

    // Throttle per token: push otomatis hanya beberapa kali sehari
    if (!checkRateLimit(`iemon-ingest:${token.slice(-6)}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Terlalu banyak permintaan' }, { status: 429 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Body harus JSON valid' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body harus objek JSON dataset' }, { status: 400 })
    }

    const raw = body as Partial<IemonDataset> & { force?: unknown }
    const force = raw.force === true

    // ── Validasi 1: paket wajib array & tidak kosong ──
    if (!Array.isArray(raw.paket)) {
      return NextResponse.json(
        { error: 'Field "paket" wajib berupa array' },
        { status: 422 },
      )
    }
    if (raw.paket.length < MIN_PAKET) {
      return NextResponse.json(
        {
          error: 'Payload kosong ditolak — dataset dengan 0 paket tidak boleh menimpa data existing',
          hint: 'Jika memang benar-benar ingin mengosongkan, kirim "force": true',
        },
        { status: 422 },
      )
    }

    // ── Validasi 2: anti-shrink — paket baru < 50% existing harus force ──
    const existing = await getIemonDataset()
    const existingCount = existing.data?.paket?.length ?? 0
    if (
      !force &&
      existingCount >= MIN_PAKET * 4 &&
      raw.paket.length < existingCount * SHRINK_GUARD_RATIO
    ) {
      return NextResponse.json(
        {
          error: `Jumlah paket turun drastis (${existingCount} → ${raw.paket.length})`,
          hint: 'Kirim ulang dengan "force": true bila penurunan ini memang disengaja',
        },
        { status: 409 },
      )
    }

    const dataset: IemonDataset = {
      uploadedAt: new Date().toISOString(),
      sourceFiles: {
        paket: (raw.sourceFiles?.paket as string) ?? 'vps-ingest',
        kontraktual: (raw.sourceFiles?.kontraktual as string) ?? 'vps-ingest',
        rkakl: (raw.sourceFiles?.rkakl as string) ?? null,
      },
      paket: raw.paket,
      kontraktual: Array.isArray(raw.kontraktual) ? raw.kontraktual : [],
      rkakl: Array.isArray(raw.rkakl) ? raw.rkakl : [],
    }

    await saveIemonDataset(dataset)

    // Riwayat tren (non-fatal — kegagalan history tidak boleh menggagalkan ingest)
    let historyOk = true
    try {
      await appendIemonHistory(summarizeIemonDataset(dataset))
    } catch (histErr) {
      historyOk = false
      console.error('appendIemonHistory gagal (non-fatal):', histErr)
    }

    return NextResponse.json({
      success: true,
      message: 'iEMON scrape dataset ingested',
      history: historyOk,
      summary: {
        paket: dataset.paket.length,
        kontraktual: dataset.kontraktual.length,
        rkakl: dataset.rkakl.length,
        sourceFiles: dataset.sourceFiles,
        uploadedAt: dataset.uploadedAt,
      },
    })
  } catch (error) {
    return internalApiError('POST /api/iemon/ingest', error)
  }
}
