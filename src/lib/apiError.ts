import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'

export function internalApiError(context: string, error: unknown, status = 500) {
  const requestId = randomUUID()
  console.error(`[${requestId}] ${context}`, error)
  return NextResponse.json(
    {
      error: 'Permintaan gagal diproses. Silakan coba kembali.',
      requestId,
    },
    { status },
  )
}

/** Bentuk galat Supabase/PostgREST yang perlu dipetakan ke status HTTP wajar. */
type SupabaseLikeError = { code?: string; message?: string; details?: string | null }

/**
 * Petakan galat Supabase ke respons HTTP yang tepat.
 *
 * Sebelumnya galat seperti PGRST116 ("tidak ada baris") dilempar apa adanya ke
 * `internalApiError` sehingga klien menerima 500 — padahal datanya memang tidak
 * ada (404) atau masukan pengguna yang salah (400). Akibatnya antarmuka
 * menampilkan "kesalahan server" untuk kondisi normal dan pemantauan produksi
 * dipenuhi alarm palsu.
 *
 * Mengembalikan `null` bila galat bukan pola yang dikenal, agar pemanggil dapat
 * meneruskannya ke `internalApiError`.
 */
export function mapSupabaseError(context: string, error: unknown): NextResponse | null {
  const e = error as SupabaseLikeError | null
  const code = e?.code

  // Tidak ada baris yang cocok saat memakai .single()
  if (code === 'PGRST116' || /0 rows|no rows/i.test(e?.message ?? '')) {
    return NextResponse.json({ error: 'Data tidak ditemukan.' }, { status: 404 })
  }

  // Pelanggaran unique / foreign key → konflik data pengguna, bukan kesalahan server
  if (code === '23505') {
    return NextResponse.json({ error: 'Data serupa sudah ada.' }, { status: 409 })
  }
  if (code === '23503') {
    return NextResponse.json({ error: 'Data terkait tidak ditemukan.' }, { status: 400 })
  }

  // Pelanggaran check/not-null → masukan tidak valid
  if (code === '23502' || code === '23514') {
    return NextResponse.json({ error: 'Data yang dikirim tidak memenuhi aturan.' }, { status: 400 })
  }

  // Hak akses ditolak oleh RLS
  if (code === '42501') {
    return NextResponse.json({ error: 'Anda tidak berhak melakukan tindakan ini.' }, { status: 403 })
  }

  if (code) {
    const requestId = randomUUID()
    console.error(`[${requestId}] ${context}`, error)
    return NextResponse.json(
      { error: 'Permintaan gagal diproses. Silakan coba kembali.', requestId },
      { status: 500 },
    )
  }

  return null
}

/** Baca body JSON dengan aman; mengembalikan null bila body rusak/kosong. */
export async function safeJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
