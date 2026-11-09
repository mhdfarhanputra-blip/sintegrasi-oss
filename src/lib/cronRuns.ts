/**
 * cronRuns.ts — Pencatatan riwayat eksekusi cron.
 *
 * Semua pekerjaan terjadwal melaporkan diri ke tabel `cron_runs` lewat helper
 * ini, sehingga dasbor /cron dapat menampilkan status nyata tanpa harus
 * membuka log server.
 *
 * PRINSIP
 *   Pencatatan TIDAK BOLEH menggagalkan pekerjaan utama. Bila tabel belum ada
 *   (migration_v28 belum dijalankan) atau jaringan bermasalah, helper menelan
 *   galat dan mengembalikan null. Cron tetap berjalan seperti biasa.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'

export type StatusCronRun = 'berjalan' | 'sukses' | 'gagal' | 'dilewati'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Mulai pencatatan satu eksekusi.
 *
 * @returns id baris bila berhasil (dipakai untuk menutup eksekusi), atau null
 *   bila pencatatan tidak tersedia — pemanggil harus tetap berjalan normal.
 */
export async function mulaiCronRun(
  cronId: string,
  opts?: { sumber?: 'vercel' | 'vps'; meta?: Record<string, unknown> },
): Promise<string | null> {
  try {
    const admin = adminClient()
    if (!admin) return null
    const { data, error } = await admin
      .from('cron_runs')
      .insert({
        cron_id: cronId,
        status: 'berjalan',
        mulai_at: new Date().toISOString(),
        sumber: opts?.sumber ?? 'vercel',
        meta: opts?.meta ?? null,
      })
      .select('id')
      .single()
    if (error) {
      console.warn('[cronRuns] gagal mencatat mulai:', error.message)
      return null
    }
    return (data as { id: string }).id
  } catch (err) {
    console.warn('[cronRuns] gagal mencatat mulai:', err)
    return null
  }
}

/**
 * Tutup pencatatan eksekusi.
 *
 * Bila `id` null (pencatatan awal gagal), fungsi mencoba menyisipkan baris
 * lengkap sekaligus agar hasil akhir tetap tercatat.
 */
export async function selesaiCronRun(
  id: string | null,
  hasil: {
    cronId: string
    status: Exclude<StatusCronRun, 'berjalan'>
    mulaiMs: number
    pesan?: string | null
    galat?: string | null
    meta?: Record<string, unknown>
    sumber?: 'vercel' | 'vps'
  },
): Promise<void> {
  const selesaiAt = new Date().toISOString()
  const durasiMs = Math.max(0, Date.now() - hasil.mulaiMs)
  const baris = {
    status: hasil.status,
    selesai_at: selesaiAt,
    durasi_ms: durasiMs,
    pesan: hasil.pesan ?? null,
    galat: hasil.galat ? String(hasil.galat).slice(0, 4000) : null,
    meta: hasil.meta ?? null,
  }
  try {
    const admin = adminClient()
    if (!admin) return
    if (id) {
      const { error } = await admin.from('cron_runs').update(baris).eq('id', id)
      if (error) console.warn('[cronRuns] gagal menutup eksekusi:', error.message)
      return
    }
    const { error } = await admin.from('cron_runs').insert({
      ...baris,
      cron_id: hasil.cronId,
      mulai_at: new Date(hasil.mulaiMs).toISOString(),
      sumber: hasil.sumber ?? 'vercel',
    })
    if (error) console.warn('[cronRuns] gagal mencatat hasil:', error.message)
  } catch (err) {
    console.warn('[cronRuns] gagal mencatat hasil:', err)
  }
}

/** Eksekusi terakhir per cron_id. */
export type CronTerakhir = {
  cron_id: string
  mulai_at: string
  status: StatusCronRun
  durasi_ms: number | null
  pesan: string | null
  galat: string | null
}
