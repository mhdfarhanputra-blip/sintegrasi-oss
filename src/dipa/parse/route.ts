import { NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/apiAuth'
import { internalApiError } from '@/lib/apiError'
import { checkRateLimit } from '@/lib/rateLimit'
import { ekstrakItemDipa } from '@/lib/dipaParser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_INPUT_CHARS = 30_000

/**
 * Batas permintaan parse per Admin.
 *
 * Parser kini berjalan lokal (tanpa AI) sehingga tidak ada biaya per token,
 * tetapi batas tetap dipertahankan: setiap permintaan memproses hingga 30.000
 * karakter dan tidak ada gunanya menembak endpoint ini berulang-ulang.
 */
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * POST /api/dipa/parse — Ekstraksi mata anggaran dari teks DIPA/RKA-KL.
 *
 * PERUBAHAN PENTING: sebelumnya endpoint ini mengirim teks dokumen ke DeepSeek
 * (AI) lalu meminta JSON kembali. Kini seluruh ekstraksi dilakukan aturan lokal
 * di lib/dipaParser.ts. Alasannya:
 *   1. Dokumen DIPA memuat pagu, kode akun, dan uraian belanja internal —
 *      tidak semestinya dikirim ke pihak ketiga.
 *   2. Hasil AI tidak deterministik: teks yang sama bisa menghasilkan angka
 *      berbeda antar-percobaan, sehingga tidak dapat diuji maupun diaudit.
 *   3. Ada biaya per token, batas kuota, dan kegagalan bila jaringan putus.
 *   4. Format "kode akun + uraian + pagu" cukup ditangani aturan pasti.
 *
 * Body: { "text": "..." }
 * Respons: { items: [{ kode_mak, uraian, pagu }], jumlah }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireActiveUser()
    if ('response' in auth) return auth.response
    // Mengubah data anggaran: tetap khusus Admin.
    if (auth.me.role !== 'Admin') {
      return NextResponse.json({ error: 'Hanya Admin aktif yang boleh parse DIPA' }, { status: 403 })
    }

    if (!checkRateLimit(`dipa-parse:${auth.me.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan parse. Tunggu sebentar lalu coba lagi.' },
        { status: 429 },
      )
    }

    let body: { text?: unknown }
    try {
      body = (await request.json()) as { text?: unknown }
    } catch {
      return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
    }

    const text = typeof body.text === 'string' ? body.text : ''
    if (text.trim().length < 20) {
      return NextResponse.json({ error: 'Teks DIPA terlalu pendek' }, { status: 400 })
    }

    const items = ekstrakItemDipa(text.slice(0, MAX_INPUT_CHARS))

    // Tidak ada kode akun terdeteksi bukan galat server — beri pesan yang
    // membantu agar operator tahu format yang diharapkan.
    if (items.length === 0) {
      return NextResponse.json(
        {
          items: [],
          jumlah: 0,
          pesan:
            'Tidak ada baris mata anggaran yang dikenali. Pastikan tiap baris memuat kode akun (mis. 521211 atau 5.2.02.01.01.0001) di awal, lalu uraian, lalu nilai pagu.',
        },
        { status: 200 },
      )
    }

    return NextResponse.json({ items, jumlah: items.length })
  } catch (err) {
    return internalApiError('DIPA Parse POST', err)
  }
}
