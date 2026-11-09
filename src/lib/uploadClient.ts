/**
 * uploadClient.ts — Unggah berkas ke Google Drive.
 *
 * Alur (satu jalur untuk seluruh aplikasi):
 *   1. POST /api/upload/gdrive  → server meneruskan berkas ke Google Drive
 *   2. Server mencatat metadata ke arsip_dokumen (status 'terarsip')
 *   3. Bila gagal dicatat, entri disimpan di localStorage untuk dicoba ulang
 *
 * Google Drive adalah penyimpanan utama; Cloudinary tidak dipakai lagi.
 * Berkas > 4 MB ditolak lebih awal dengan pesan jelas karena platform
 * serverless membatasi ukuran badan permintaan.
 */
import {
  PENDING_ARCHIVE_KEY,
  validateUploadFile,
  type PendingArchive,
} from '@/lib/uploadArsip'

export class UploadError extends Error {
  readonly stage: 'validasi' | 'izin' | 'unggah' | 'catat'
  readonly status?: number

  constructor(message: string, stage: UploadError['stage'], status?: number) {
    super(message)
    this.name = 'UploadError'
    this.stage = stage
    this.status = status
  }
}

/** Membaca JSON dengan aman: bila server membalas teks/HTML, ubah jadi pesan manusiawi. */
async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const raw = await response.text()

  if (!contentType.includes('application/json')) {
    // Vercel membalas teks biasa untuk galat platform (mis. 413 Request Entity Too Large).
    if (response.status === 413 || /Request Entity Too Large/i.test(raw)) {
      throw new UploadError(
        'Berkas terlalu besar untuk server. Berkas seharusnya diunggah langsung ke penyimpanan — hubungi admin bila masalah berulang.',
        'unggah',
        413,
      )
    }
    if (response.status === 504 || /timeout/i.test(raw)) {
      throw new UploadError('Server kehabisan waktu memproses. Coba lagi dengan berkas lebih kecil.', 'unggah', 504)
    }
    throw new UploadError(fallback, 'unggah', response.status)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new UploadError(fallback, 'unggah', response.status)
  }

  if (!response.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : fallback
    throw new UploadError(message, response.status === 401 || response.status === 403 ? 'izin' : 'unggah', response.status)
  }

  return parsed as T
}

function readPending(): PendingArchive[] {
  try {
    const raw = localStorage.getItem(PENDING_ARCHIVE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PendingArchive[]) : []
  } catch {
    return []
  }
}

function writePending(list: PendingArchive[]) {
  try {
    if (!list.length) localStorage.removeItem(PENDING_ARCHIVE_KEY)
    else localStorage.setItem(PENDING_ARCHIVE_KEY, JSON.stringify(list.slice(-20)))
  } catch {
    // localStorage dapat diblokir; pengarsipan tetap berjalan lewat jalur normal.
  }
}

function forgetPending(publicId: string) {
  writePending(readPending().filter((item) => item.publicId !== publicId))
}

/**
 * Catat ulang berkas yang sudah berada di Drive.
 *
 * Endpoint /api/upload/gdrive menerima berkas, jadi antrean lama (yang hanya
 * menyimpan URL) tidak dapat dipakai lagi. Entri lama dibersihkan agar tidak
 * menumpuk; unggahan baru selalu tercatat langsung di server sehingga antrean
 * ini praktis tidak terpakai lagi.
 */
async function completeArchive(entry: PendingArchive): Promise<{ id: string; status: string }> {
  const response = await fetch('/api/upload/gdrive/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modul: entry.modul,
      name: entry.namaAsli,
      size: entry.ukuran,
      type: entry.mime,
      url: entry.url,
      publicId: entry.publicId,
      folder: entry.folder,
    }),
  })
  return readJson<{ id: string; status: string }>(response, 'Berkas terunggah tetapi gagal dicatat. Silakan coba lagi.')
}

export type UploadResult = {
  url: string
  publicId: string
  name: string
  size: number
  modul: string
  id: string
  status: string
}

/**
 * Unggah satu berkas dokumen dan catat ke arsip.
 * @param modul kunci modul (mis. 'cms', 'bmn', 'dipa')
 * @param onProgress callback 0–100 (tahap unggah ke penyimpanan)
 */
export async function uploadDokumen(
  modul: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const check = validateUploadFile({ name: file.name, size: file.size, type: file.type })
  if (!check.ok) throw new UploadError(check.error, 'validasi')

  // Google Drive sekarang menjadi penyimpanan utama (Cloudinary tidak dipakai lagi).
  // Berkas dikirim ke server lalu diteruskan ke Drive; batas badan permintaan
  // platform (4 MB) diperiksa lebih dulu agar pesannya jelas bagi pengguna.
  const BATAS_PLATFORM = 4 * 1024 * 1024
  if (file.size > BATAS_PLATFORM) {
    throw new UploadError(
      `Berkas ini ${(file.size / 1048576).toFixed(1)} MB, melebihi batas 4 MB untuk unggahan langsung. ` +
        'Kompres berkas terlebih dahulu, atau unggah melalui menu CMS.',
      'validasi',
    )
  }

  const form = new FormData()
  form.append('modul', modul)
  form.append('file', file, file.name)

  // XHR agar progres unggahan dapat ditampilkan (fetch belum memberi progres).
  const hasil = await new Promise<{
    url: string
    webViewLink?: string
    fileId?: string
    name?: string
    size?: number
    modul?: string
    status?: string
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload/gdrive')

    // Pembatalan: pengguna menekan "Batalkan" saat berkas besar sedang dikirim.
    // Tanpa ini, unggahan tetap berjalan di latar dan pengguna tidak tahu.
    if (signal) {
      if (signal.aborted) {
        reject(new UploadError('Unggahan dibatalkan.', 'unggah'))
        return
      }
      signal.addEventListener('abort', () => {
        xhr.abort()
        reject(new UploadError('Unggahan dibatalkan.', 'unggah'))
      }, { once: true })
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }
    xhr.onload = () => {
      let payload: Record<string, unknown> = {}
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        reject(new UploadError('Server membalas format tak dikenal. Coba lagi.', 'unggah', xhr.status))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300 || typeof payload.url !== 'string') {
        const pesan = typeof payload.error === 'string' ? payload.error : 'Unggah ke Google Drive gagal.'
        reject(new UploadError(pesan, xhr.status === 401 || xhr.status === 403 ? 'izin' : 'unggah', xhr.status))
        return
      }
      resolve(payload as never)
    }
    xhr.onerror = () => reject(new UploadError('Koneksi terputus saat mengunggah berkas.', 'unggah'))
    xhr.ontimeout = () => reject(new UploadError('Unggahan melebihi batas waktu.', 'unggah'))
    xhr.timeout = 5 * 60_000
    xhr.send(form)
  })

  onProgress?.(100)

  return {
    url: hasil.url,
    publicId: hasil.fileId || '',
    name: hasil.name || file.name,
    size: hasil.size || file.size,
    modul: (hasil.modul || modul).toUpperCase(),
    id: hasil.fileId || '',
    status: hasil.status || 'terarsip',
  }
}

/** Mencoba ulang berkas yang sebelumnya gagal dicatat. Aman dipanggil saat halaman dibuka. */
export async function retryPendingArchives(): Promise<number> {
  const list = readPending()
  if (!list.length) return 0
  let done = 0
  for (const entry of list) {
    try {
      await completeArchive(entry)
      forgetPending(entry.publicId)
      done += 1
    } catch {
      // Tetap di antrean; dicoba lagi pada pembukaan berikutnya.
    }
  }
  return done
}

export function pendingArchiveCount(): number {
  return readPending().length
}
