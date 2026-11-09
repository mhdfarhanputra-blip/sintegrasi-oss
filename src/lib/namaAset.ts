/**
 * namaAset.ts — Aturan penamaan berkas unggahan agar tersusun rapi.
 *
 * Masalah nyata: foto aset sebelumnya tersimpan dengan nama asli dari perangkat
 * (mis. "IMG_20261021_143022.jpg", "WhatsApp Image 2026-10-21 at 14.30.22.jpeg").
 * Akibatnya:
 *   - tidak bisa dicari berdasarkan kode aset,
 *   - dua petugas bisa menghasilkan nama sama dan saling menimpa,
 *   - tidak jelas foto itu milik aset mana saat dilihat di penyimpanan.
 *
 * Solusi: berkas diubah namanya sebelum diunggah menjadi pola
 *   {MODUL}-{KODE_ASET}-{YYYYMMDD-HHmmss}-{acak6}.{ext}
 * sehingga urut, unik, dan bisa dilacak ke asetnya.
 */

/** Bersihkan bagian nama agar aman dipakai di jalur penyimpanan. */
function bersihkan(nilai: string): string {
  return nilai
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
}

function ekstensi(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : ''
}

function stempelWaktu(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function acak(n = 6): string {
  const abjad = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < n; i += 1) s += abjad[Math.floor(Math.random() * abjad.length)]
  return s
}

/**
 * Susun nama berkas baru.
 *
 * Prinsip: NAMA ASLI DIPERTAHANKAN karena mengandung informasi yang tidak bisa
 * ditebak (nomor dokumen, judul SK, jenis laporan). Yang ditambahkan hanya
 * awalan modul + cap waktu, sehingga berkas mudah dikenali di Drive dan tetap
 * unik meski diunggah berulang.
 *
 *   SEBELUM (nama menjadi tidak informatif):
 *     DOK-DIPA-TANPA-KODE-20261022-161622-gjcqbz.pdf
 *   SESUDAH (nama asli utuh):
 *     DIPA-20261022-161622-RINCIAN KERTAS KERJA SATKER.pdf
 *
 * Karakter yang dilarang pada nama berkas dibersihkan agar tidak merusak Drive
 * maupun penyimpanan lain.
 *
 * @param modul kunci modul, mis. 'DIPA'
 * @param kode  kode aset / nomor dokumen (boleh kosong; dipakai bila nama asli kosong)
 * @param namaAsli nama berkas dari perangkat
 */
export function namaBerkasTersusun(modul: string, kode: string | null | undefined, namaAsli: string): string {
  const ext = ekstensi(namaAsli) || '.bin'
  const m = bersihkan(modul.toUpperCase()) || 'UMUM'
  const stempel = stempelWaktu()

  // Ambil nama dasar tanpa ekstensi, bersihkan, pertahankan spasinya sebagai '-'? Tidak:
  // spasi dipertahankan karena lebih mudah dibaca manusia dan aman di Drive.
  const dasar = namaAsli
    .slice(0, namaAsli.length - ext.length)
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    // Cegah traversal: '..' berurutan bisa membentuk jalur relatif bila nama
    // dipakai membangun path. Ubah menjadi '-' agar nama tetap terbaca.
    .replace(/\.{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)

  // Bila nama dasar kosong / tidak informatif, pakai kode aset sebagai gantinya.
  const kodeBersih = bersihkan(String(kode ?? '').trim())
  const inti = dasar && dasar.length >= 3 ? dasar : kodeBersih || 'berkas'

  // Pembeda acak: dua unggahan berkas bernama sama pada detik yang sama tidak
  // boleh saling menimpa (Drive tidak menimpa, tetapi nama kembar membingungkan).
  return `${m}-${stempel}-${acak()}-${inti}${ext}`
}

/** Folder tujuan berjenjang: Sintegrasi/{MODUL}/{tahun}/{bulan}. */
export function folderTersusun(modul: string, d = new Date()): string {
  const m = (bersihkan(modul.toUpperCase()) || 'UMUM')
  return `Sintegrasi/${m}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Sub-folder per aset agar foto sejenis berkumpul:
 * Sintegrasi/BMN/{tahun}/{bulan}/{kode-aset}
 * Cloudinary membatasi kedalaman folder; bila kode aset terlalu panjang atau
 * kosong, sub-folder dilewati.
 */
export function subFolderAset(kode: string | null | undefined): string | null {
  const k = bersihkan(String(kode ?? '').trim())
  if (!k || k === 'TANPA-KODE') return null
  return k
}
