import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  normalizeIemonDataset,
  type IemonDataset,
} from '@/lib/iemonParser'

export const IEMON_BUCKET_NAME = 'dokumen'
export const IEMON_STORAGE_PATH = 'iemon/data.json'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export function emptyIemonDataset(): IemonDataset {
  return {
    uploadedAt: '',
    sourceFiles: {
      paket: null,
      kontraktual: null,
      rkakl: null,
    },
    paket: [],
    kontraktual: [],
    rkakl: [],
  }
}

export async function ensureIemonBucket(): Promise<void> {
  const admin = adminClient()
  const { data } = await admin.storage.getBucket(IEMON_BUCKET_NAME)
  if (!data) {
    const { error } = await admin.storage.createBucket(IEMON_BUCKET_NAME, { public: false })
    if (error && !error.message.includes('already exists')) throw error
  }
}

export async function saveIemonDataset(dataset: IemonDataset): Promise<void> {
  await ensureIemonBucket()
  const admin = adminClient()
  const normalized = normalizeIemonDataset({
    ...dataset,
    uploadedAt: dataset.uploadedAt || new Date().toISOString(),
  })
  const blob = new Blob([JSON.stringify(normalized)], { type: 'application/json' })
  const { error } = await admin.storage
    .from(IEMON_BUCKET_NAME)
    .upload(IEMON_STORAGE_PATH, blob, { contentType: 'application/json', upsert: true })
  if (error) throw error
}

export async function getIemonDataset(): Promise<{ data: IemonDataset; source: 'storage' | 'empty' }> {
  try {
    const admin = adminClient()
    const { data: fileData, error } = await admin.storage
      .from(IEMON_BUCKET_NAME)
      .download(IEMON_STORAGE_PATH)

    if (!error && fileData) {
      const parsed = JSON.parse(await fileData.text()) as IemonDataset
      return { data: normalizeIemonDataset(parsed), source: 'storage' }
    }
  } catch {
    // fallback below
  }

  return { data: emptyIemonDataset(), source: 'empty' }
}


export interface IemonHistoryPoint {
  uploadedAt: string
  paketCount: number
  kontrakCount: number
  rerataFisik: number | null
  rerataKeuangan: number | null
  paguTotal: number
  realisasiTotal: number
}

export const IEMON_HISTORY_PATH = 'iemon/history.jsonl'
const IEMON_HISTORY_MAX = 60

/** Ringkas dataset utk satu titik riwayat. */
export function summarizeIemonDataset(data: IemonDataset): IemonHistoryPoint {
  const paket = data.paket ?? []
  const kontrak = data.kontraktual ?? []
  const paguTotal = paket.reduce((acc, p) => acc + (p.paguTotal || 0), 0)
  const realisasiTotal = paket.reduce((acc, p) => acc + (p.realTotal || 0), 0)
  const withFis = paket.filter((p) => typeof p.progressFisik === 'number' && p.progressFisik > 0)
  const withKeu = paket.filter((p) => typeof p.progressKeuangan === 'number' && p.progressKeuangan > 0)
  const avg = (rows: typeof paket, pick: (p: typeof paket[number]) => number) =>
    rows.length > 0 ? Math.round((rows.reduce((acc, p) => acc + pick(p), 0) / rows.length) * 100) / 100 : null
  return {
    uploadedAt: data.uploadedAt || new Date().toISOString(),
    paketCount: paket.length,
    kontrakCount: kontrak.length,
    rerataFisik: avg(withFis, (p) => p.progressFisik || 0),
    rerataKeuangan: avg(withKeu, (p) => p.progressKeuangan || 0),
    paguTotal,
    realisasiTotal,
  }
}

/** Append satu titik riwayat (JSONL, max N baris terakhir disimpan). */
export async function appendIemonHistory(point: IemonHistoryPoint): Promise<void> {
  const admin = adminClient()
  let lines: string[] = []
  try {
    const { data: old } = await admin.storage.from(IEMON_BUCKET_NAME).download(IEMON_HISTORY_PATH)
    if (old) {
      lines = (await old.text()).split('\n').filter((l) => l.trim().length > 0)
    }
  } catch {
    // file belum ada — mulai baru
  }
  lines.push(JSON.stringify(point))
  if (lines.length > IEMON_HISTORY_MAX) lines = lines.slice(-IEMON_HISTORY_MAX)
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-ndjson' })
  const { error } = await admin.storage
    .from(IEMON_BUCKET_NAME)
    .upload(IEMON_HISTORY_PATH, blob, { contentType: 'application/x-ndjson', upsert: true })
  if (error) throw error
}

/** Baca riwayat (terakhir N titik). */
export async function getIemonHistory(limit = 30): Promise<IemonHistoryPoint[]> {
  try {
    const admin = adminClient()
    const { data } = await admin.storage.from(IEMON_BUCKET_NAME).download(IEMON_HISTORY_PATH)
    if (!data) return []
    const lines = (await data.text()).split('\n').filter((l) => l.trim().length > 0)
    return lines.slice(-limit).map((l) => JSON.parse(l) as IemonHistoryPoint)
  } catch {
    return []
  }
}

/**
 * Ringkasan + riwayat dalam SATU unduhan.
 *
 * Sebelumnya /api/iemon/summary mengunduh `iemon/data.json` lalu mengunduh
 * `iemon/history.jsonl` secara terpisah (2 round-trip ke storage pada setiap
 * permintaan). Karena kedua berkas berada di bucket yang sama, keduanya dibaca
 * paralel dan hasilnya digabung — jumlah round-trip tetap dua tetapi tidak lagi
 * berurutan, sehingga latensi turun. Bila salah satu gagal, bagian lain tetap
 * dikembalikan (tidak pernah menggagalkan seluruh respons).
 */
export async function getIemonSnapshot(historyLimit = 30): Promise<{
  data: IemonDataset
  source: 'storage' | 'empty'
  history: IemonHistoryPoint[]
}> {
  const admin = adminClient()
  const [datasetResult, historyResult] = await Promise.allSettled([
    (async (): Promise<{ data: IemonDataset; source: 'storage' | 'empty' }> => {
      const { data: fileData, error } = await admin.storage.from(IEMON_BUCKET_NAME).download(IEMON_STORAGE_PATH)
      if (error || !fileData) return { data: emptyIemonDataset(), source: 'empty' }
      const parsed = JSON.parse(await fileData.text()) as IemonDataset
      return { data: normalizeIemonDataset(parsed), source: 'storage' }
    })(),
    (async (): Promise<IemonHistoryPoint[]> => {
      const { data: histData } = await admin.storage.from(IEMON_BUCKET_NAME).download(IEMON_HISTORY_PATH)
      if (!histData) return []
      const lines = (await histData.text()).split('\n').filter((l) => l.trim().length > 0)
      return lines.slice(-historyLimit).map((l) => JSON.parse(l) as IemonHistoryPoint)
    })(),
  ])

  return {
    data: datasetResult.status === 'fulfilled' ? datasetResult.value.data : emptyIemonDataset(),
    source: datasetResult.status === 'fulfilled' ? datasetResult.value.source : 'empty',
    history: historyResult.status === 'fulfilled' ? historyResult.value : [],
  }
}
