import { createClient as createAdminClient } from '@supabase/supabase-js'
import fallbackData from '@/lib/realisasi-data.json'
import { normalizeUraian } from '@/lib/realisasiNormalize'
import type { RealisasiRow } from '@/lib/realisasiParser'

export const REALISASI_BUCKET_NAME = 'dokumen'
export const REALISASI_STORAGE_PATH = 'realisasi/data.json'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function inferLevel(uraian: string, kodeAkun: string | null, currentLevel: string, state: { hasProgram: boolean; hasKegiatan: boolean; hasKro: boolean; hasKomponen: boolean }): string {
  if (uraian.toUpperCase() === 'JUMLAH SELURUHNYA') return 'total'
  if (kodeAkun || /^[1-9]\d{5}\b/.test(uraian)) return 'akun'
  const first = uraian.split(/\s+/)[0] ?? ''
  if (/^\d{5,6}\./.test(first)) return 'detail'
  if (/^\d{3}\.[A-Z0-9]+$/i.test(first)) return 'subkomponen'
  if (/^\d{3}$/.test(first)) return 'komponen'
  if (/^[A-Z]{1,4}\.\d+$/i.test(first)) return state.hasKro ? 'ro' : 'kegiatan'
  if (/^[A-Z]{1,4}$/i.test(first)) return state.hasProgram || state.hasKegiatan ? 'kro' : 'program'
  return currentLevel === 'item' ? 'detail' : currentLevel || 'detail'
}

export function normalizeRealisasiRows(rows: RealisasiRow[]): RealisasiRow[] {
  const state = { hasProgram: false, hasKegiatan: false, hasKro: false, hasKomponen: false }
  return rows.map((row) => {
    const uraian = normalizeUraian(row.uraian)
    const kodeAkun = row.kode_akun ?? (/^[1-9]\d{5}\b/.test(uraian) ? uraian.slice(0, 6) : null)
    const level = inferLevel(uraian, kodeAkun, row.level, state)
    if (level === 'program') state.hasProgram = true
    if (level === 'kegiatan') state.hasKegiatan = true
    if (level === 'kro') state.hasKro = true
    if (level === 'komponen') state.hasKomponen = true
    return {
      ...row,
      uraian,
      kode_akun: kodeAkun,
      level,
    }
  })
}

export async function ensureRealisasiBucket(): Promise<void> {
  const admin = adminClient()
  const { data } = await admin.storage.getBucket(REALISASI_BUCKET_NAME)
  if (!data) {
    const { error } = await admin.storage.createBucket(REALISASI_BUCKET_NAME, { public: false })
    if (error && !error.message.includes('already exists')) throw error
  }
}

export async function saveRealisasiRows(rows: RealisasiRow[]): Promise<void> {
  await ensureRealisasiBucket()
  const admin = adminClient()
  const jsonContent = JSON.stringify(normalizeRealisasiRows(rows))
  const blob = new Blob([jsonContent], { type: 'application/json' })

  const { error } = await admin.storage
    .from(REALISASI_BUCKET_NAME)
    .upload(REALISASI_STORAGE_PATH, blob, { contentType: 'application/json', upsert: true })

  if (error) throw error
}

export async function getRealisasiRows(): Promise<{ data: RealisasiRow[]; source: 'storage' | 'static' }> {
  try {
    const admin = adminClient()
    const { data: fileData, error } = await admin.storage
      .from(REALISASI_BUCKET_NAME)
      .download(REALISASI_STORAGE_PATH)

    if (!error && fileData) {
      const parsed = JSON.parse(await fileData.text()) as RealisasiRow[]
      return { data: normalizeRealisasiRows(parsed), source: 'storage' }
    }
  } catch {
    // Fallback below.
  }

  return { data: normalizeRealisasiRows(fallbackData as RealisasiRow[]), source: 'static' }
}
