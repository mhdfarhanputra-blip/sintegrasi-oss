/**
 * gdriveUpload.ts — Unggah berkas ke Google Drive tanpa pustaka googleapis.
 *
 * Mengapa tanpa googleapis:
 *   Paket `googleapis` berukuran puluhan MB dan memperlambat cold start fungsi
 *   serverless. Yang dibutuhkan di sini hanya tiga panggilan REST, sehingga
 *   cukup memakai `fetch` bawaan Node.
 *
 * Kredensial (diset sebagai environment variable di Vercel):
 *   GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN, GDRIVE_FOLDER_ID
 *
 * Refresh token milik akun pemilik folder; access token dibuat ulang otomatis
 * setiap kali hampir kedaluwarsa (disimpan singkat di memori proses).
 */

const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const PARENT_FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1K119TnIdVPvPOP937yofczp-Z9yw-TqF'

type TokenCache = { token: string; kedaluwarsa: number }
let cache: TokenCache | null = null

/** Galat unggah Drive dengan pesan yang layak ditampilkan ke pengguna. */
export class DriveError extends Error {
  readonly status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'DriveError'
    this.status = status
  }
}

/** Ambil access token dari refresh token (di-cache sampai ~1 menit sebelum kedaluwarsa). */
async function accessToken(): Promise<string> {
  const now = Date.now()
  if (cache && cache.kedaluwarsa > now) return cache.token

  const clientId = process.env.GDRIVE_CLIENT_ID
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new DriveError('Penyimpanan Google Drive belum dikonfigurasi. Hubungi admin.', 503)
  }

  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })

  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !json.access_token) {
    throw new DriveError(`Gagal memperbarui akses Google Drive (${json.error || res.status}).`, 502)
  }

  const umur = (json.expires_in ?? 3600) * 1000
  cache = { token: json.access_token, kedaluwarsa: now + umur - 60_000 }
  return json.access_token
}

/** Buang karakter yang tidak sah untuk nama berkas Drive. */
function namaAman(nama: string): string {
  return nama.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 200) || 'berkas'
}

async function cariFolder(token: string, nama: string, induk: string): Promise<string> {
  const q = [
    `name = '${nama.replace(/'/g, "\\'")}'`,
    `'${induk}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=1`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!res.ok) throw new DriveError(`Gagal mencari folder Drive (${res.status}).`)
  const json = (await res.json()) as { files?: Array<{ id: string }> }
  if (json.files?.length) return json.files[0].id

  const buat = await fetch(`${DRIVE_API}/files?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nama,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [induk],
    }),
  })
  const hasil = (await buat.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
  if (!buat.ok || !hasil.id) {
    throw new DriveError(`Gagal membuat folder Drive: ${hasil.error?.message || buat.status}`)
  }
  return hasil.id
}

/** Pastikan jalur folder ada, lalu kembalikan id folder terdalam.
 *
 * Aturan struktur (mengikuti isi Drive yang sudah ada):
 *   - Modul DOKUMEN (DIPA, SK, KEUANGAN, PERSEDIAAN, UTILITAS) berlaku per tahun
 *     anggaran, sehingga cukup {MODUL}/{tahun}. Menambahkan subfolder bulan akan
 *     memecah satu set revisi ke banyak folder (mis. RINCIAN KERTAS KERJA
 *     SATKER (1..11) tersebar ke 4 bulan berbeda hanya karena tanggal unggah).
 *   - Modul FOTO (BMN) bertanggal harian dan bervolume besar, sehingga memakai
 *     {MODUL}/{tahun}/{bulan}.
 */
const MODUL_FOTO = new Set(['BMN'])

export async function siapkanFolder(modul: string, kapan = new Date()): Promise<string> {
  const token = await accessToken()
  let induk = PARENT_FOLDER_ID
  const bagian = [modul.toUpperCase(), String(kapan.getFullYear())]
  if (MODUL_FOTO.has(modul.toUpperCase())) {
    bagian.push(String(kapan.getMonth() + 1).padStart(2, '0'))
  }
  for (const nama of bagian) {
    induk = await cariFolder(token, namaAman(nama), induk)
  }
  return induk
}

export type HasilUnggah = {
  fileId: string
  url: string
  webViewLink: string
}

/**
 * Unggah satu berkas ke Drive pada folder {MODUL}/{tahun}/{bulan}.
 *
 * Memakai multipart upload (metadata + isi dalam satu permintaan) karena
 * ukuran berkas dibatasi 4 MB oleh platform serverless sehingga unggahan
 * bertahap (resumable) tidak diperlukan.
 */
export async function unggahKeDrive(
  nama: string,
  mime: string,
  isi: ArrayBuffer,
  modul: string,
): Promise<HasilUnggah> {
  const token = await accessToken()
  const induk = await siapkanFolder(modul)

  const batas = '-------sintegrasi' + Date.now().toString(36)
  const metadata = JSON.stringify({ name: namaAman(nama), parents: [induk] })

  const pembuka = Buffer.from(
    `--${batas}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${batas}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`,
    'utf8',
  )
  const penutup = Buffer.from(`\r\n--${batas}--`, 'utf8')
  const badan = Buffer.concat([pembuka, Buffer.from(isi), penutup])

  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${batas}`,
    },
    body: badan,
  })

  const json = (await res.json().catch(() => ({}))) as {
    id?: string
    webViewLink?: string
    error?: { message?: string }
  }

  if (!res.ok || !json.id) {
    throw new DriveError(`Google Drive menolak berkas ini: ${json.error?.message || res.status}`)
  }

  // Izin baca publik agar berkas dapat dibuka dari aplikasi oleh pengguna lain.
  // Bila gagal (mis. kebijakan domain), unggahan tetap dianggap berhasil — berkas
  // sudah tersimpan dan pemilik akun tetap dapat membukanya.
  try {
    await fetch(`${DRIVE_API}/files/${json.id}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })
  } catch {
    // diabaikan dengan sengaja
  }

  // URL yang terbukti dapat dibuka publik tanpa login:
  //   - drive.usercontent.google.com/download  -> unduh langsung (semua jenis berkas)
  //   - drive.google.com/thumbnail             -> pratinjau gambar
  // `drive.google.com/uc?export=view` sudah tidak cocok lagi (membalas 303).
  return {
    fileId: json.id,
    url: `https://drive.usercontent.google.com/download?id=${json.id}&export=download`,
    webViewLink: json.webViewLink || `https://drive.google.com/file/d/${json.id}/view`,
  }
}
