/**
 * uploadArsip.ts — Aturan unggah berkas CMS (dipakai server & klien).
 *
 * Mengapa berkas TIDAK diunggah lewat fungsi Vercel:
 *   Vercel membatasi badan permintaan fungsi ke 4,5 MB dan menolak lebih awal
 *   dengan teks biasa "Request Entity Too Large" (bukan JSON). Peramban yang
 *   memanggil `response.json()` lalu gagal dengan "Unexpected token 'R'".
 *   Karena itu berkas diunggah LANGSUNG dari peramban ke Cloudinary memakai
 *   tanda tangan yang dibuat server; fungsi Vercel hanya menerima JSON kecil.
 *
 * Berkas ini sengaja bebas dependensi Node agar aman diimpor dari komponen
 * klien maupun route handler.
 */

/** Batas unggah nyata untuk dokumen (bukan batas Vercel). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.xlsx',
  '.xls',
  '.docx',
  '.doc',
  '.pptx',
  '.zip',
  '.rar',
] as const

/** Ekstensi berbahaya yang selalu ditolak, walau MIME-nya mengaku aman. */
export const BLOCKED_EXTENSIONS = [
  '.svg',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.php',
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.jar',
] as const

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/zip',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/octet-stream',
] as const

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx).toLowerCase() : ''
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export type FileRejection = { ok: false; error: string } | { ok: true }

/**
 * Validasi awal di sisi peramban supaya pengguna langsung mendapat pesan jelas
 * tanpa menunggu jaringan. Server tetap memvalidasi ulang (jangan percaya klien).
 */
export function validateUploadFile(file: { name: string; size: number; type: string }): FileRejection {
  const ext = fileExtension(file.name)
  if (!ext) return { ok: false, error: 'Berkas tanpa ekstensi tidak dapat diarsipkan.' }
  if ((BLOCKED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: `Ekstensi ${ext} tidak diizinkan demi keamanan.` }
  }
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: `Ekstensi ${ext} belum didukung. Gunakan PDF, Office, gambar, atau arsip ZIP/RAR.` }
  }
  if (file.size <= 0) return { ok: false, error: 'Berkas kosong (0 byte) tidak dapat diunggah.' }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Ukuran berkas ${formatBytes(file.size)} melebihi batas ${formatBytes(MAX_UPLOAD_BYTES)}.` }
  }
  return { ok: true }
}

/** Berkas gambar memakai resource_type "image", selain itu "raw" (PDF/Office/zip). */
export type SignResponse = {
  ok: true
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
  resourceType: 'image' | 'raw'
  maxBytes: number
  uploadUrl: string
}

export type CompleteResponse = {
  ok: true
  id: string
  status: string
  url: string
}

/**
 * Penanda berkas yang sudah diunggah ke Cloudinary namun gagal dicatat ke
 * basis data. Disimpan di localStorage supaya dapat dicoba ulang otomatis
 * saat halaman dibuka kembali — mencegah "berkas hanya nyangkut di Cloudinary".
 */
export type PendingArchive = {
  modul: string
  namaAsli: string
  ukuran: number
  mime: string
  url: string
  publicId: string
  folder: string
  createdAt: string
}

export const PENDING_ARCHIVE_KEY = 'sintegrasi:pending-archive'
