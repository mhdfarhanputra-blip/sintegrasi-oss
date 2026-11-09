/**
 * dipaParser.ts — Ekstraksi mata anggaran DIPA/RKA-KL TANPA AI.
 *
 * MASALAH YANG DISELESAIKAN
 *   `POST /api/dipa/parse` sebelumnya mengirim teks dokumen (sampai 30.000
 *   karakter, berisi rincian anggaran satker) ke DeepSeek lalu meminta JSON
 *   kembali. Itu bermasalah karena:
 *     1. Data anggaran keluar ke pihak ketiga — dokumen DIPA memuat pagu,
 *        kode akun, dan uraian belanja yang bersifat internal.
 *     2. Hasil tidak deterministik: teks yang sama dapat menghasilkan ekstraksi
 *        berbeda, sehingga tidak dapat diuji maupun diaudit.
 *     3. Ada biaya per token dan kegagalan bila kuota habis/jaringan putus.
 *     4. Format "kode akun + uraian + angka pagu" sebenarnya sangat teratur
 *        dan cukup ditangani aturan pasti.
 *
 * PENDEKATAN
 *   Parser baris-per-baris:
 *     1. Kenali kode akun belanja: 6 digit diawali '5' (mis. 521211) atau
 *        kode MAK panjang bergaya DIPA (mis. 5.2.02.01.01.0001).
 *     2. Ambil angka rupiah TERAKHIR pada baris sebagai pagu. Angka dipisah
 *        titik (ribuan) atau koma (desimal) ditangani.
 *     3. Uraian = teks di antara kode dan angka pagu, dibersihkan.
 *     4. Baris yang tidak memuat kode akun diabaikan (judul kolom, catatan).
 */

/** Satu mata anggaran hasil ekstraksi. */
export interface ItemDipa {
  kode_mak: string
  uraian: string | null
  pagu: number
}

/**
 * Pola kode akun belanja.
 *
 * Dua bentuk yang lazim pada dokumen DIPA/RKA-KL Indonesia:
 *   - 6 digit diawali 5   : 521211, 524111, 522131
 *   - MAK bertitik        : 5.2.02.01.01.0001 (boleh 4–6 segmen)
 * Tambahan segmen opsional (mis. .001A) ditangkap agar kode tidak terpotong.
 */
const POLA_KODE_6 = /^\s*(\d{6})\b/
const POLA_KODE_MAK = /^\s*(\d(?:\.\d{1,4}){3,6}\.?[A-Za-z0-9]*)\b/

/**
 * Angka rupiah pada satu baris.
 *
 * PENTING: spasi TIDAK termasuk bagian angka. Versi pertama pola ini
 * mengizinkan spasi (`\d[\d.,\s]*\d`) sehingga baris seperti
 * "12 5.000 60.000" (kolom volume, harga, jumlah) terbaca sebagai satu angka
 * raksasa 12500060000 — pagu salah total. Kolom dipisah spasi, jadi spasi
 * harus menjadi batas antar-angka.
 *
 * Contoh yang dikenali sebagai angka terpisah: 1.500.000 | 1,500,000 | 1500000
 */
const POLA_ANGKA = /\d+(?:[.,]\d+)*/g

/**
 * Membersihkan dan mengubah teks angka rupiah menjadi bilangan.
 *
 * Aturan: buang spasi; bila hanya ada titik/koma sebagai pemisah ribuan
 * (kelompok 3 digit) maka dianggap ribuan; bila ada bagian desimal 1–2 digit
 * di akhir maka itu pecahan dan dibuang (pagu rupiah selalu bulat).
 *
 * @returns nilai bilangan bulat, atau null bila bukan angka yang wajar.
 */
export function uraiAngkaRupiah(teks: string): number | null {
  const bersih = teks.replace(/\s/g, '')
  if (!bersih) return null

  // Pisahkan bagian desimal: '1.234.567,00' atau '1,234,567.00'
  const cocokDesimal = bersih.match(/^(.*?)[.,](\d{1,2})$/)
  let utama = bersih
  if (cocokDesimal) {
    // Hanya perlakukan sebagai desimal bila sisa depannya masih mengandung
    // pemisah ribuan atau panjangnya > 3 (mis. '1234,50'); '1.500' bukan desimal.
    const depan = cocokDesimal[1]
    const adaPemisahRibuan = /[.,]/.test(depan)
    if (adaPemisahRibuan || depan.length > 3) utama = depan
  }

  const digit = utama.replace(/[.,]/g, '')
  if (!/^\d+$/.test(digit)) return null

  const nilai = Number(digit)
  if (!Number.isSafeInteger(nilai)) return null
  return nilai
}

/**
 * Ekstrak seluruh mata anggaran dari teks dokumen DIPA.
 *
 * @param teks isi dokumen (hasil salin-tempel dari PDF/Excel DIPA)
 * @returns daftar item unik (kode_mak + pagu), urut sesuai kemunculan
 */
export function ekstrakItemDipa(teks: string): ItemDipa[] {
  if (typeof teks !== 'string' || !teks.trim()) return []

  const hasil: ItemDipa[] = []
  const sudahAda = new Set<string>()

  for (const barisAsli of teks.split(/\r?\n/)) {
    const baris = barisAsli.replace(/\u00a0/g, ' ').trim()
    if (!baris) continue

    // 1. Kode akun di awal baris.
    const cocokKode = baris.match(POLA_KODE_6) ?? baris.match(POLA_KODE_MAK)
    if (!cocokKode) continue
    const kode = cocokKode[1].trim()
    // PENTING: kode 6 digit hanya sah bila diawali '5' (belanja). Tanpa ini,
    // nomor urut atau tahun pada baris judul akan salah dikira kode akun.
    if (/^\d{6}$/.test(kode) && !kode.startsWith('5')) continue

    // 2. Angka pagu = angka TERAKHIR pada baris (kolom pagu ada di kanan).
    const sisaBaris = baris.slice(cocokKode[0].length)
    const semuaAngka = sisaBaris.match(POLA_ANGKA) ?? []
    // Buang angka yang menempel pada kode akun (mis. '521211' ikut tertangkap).
    const kandidat = semuaAngka.filter((a) => a.replace(/[.,\s]/g, '').length >= 1)
    let pagu: number | null = null
    for (let i = kandidat.length - 1; i >= 0; i -= 1) {
      const nilai = uraiAngkaRupiah(kandidat[i])
      // Pagu DIPA realistis minimal ribuan; angka 1–2 digit biasanya nomor urut
      // atau kode, bukan nominal anggaran.
      if (nilai !== null && nilai >= 1000) {
        pagu = nilai
        break
      }
    }
    if (pagu === null) continue

    // 3. Uraian = teks di antara kode dan angka pagu yang dipakai.
    const posisiAngkaTerakhir = sisaBaris.lastIndexOf(kandidat[kandidat.length - 1])
    const uraianKasar = posisiAngkaTerakhir > 0 ? sisaBaris.slice(0, posisiAngkaTerakhir) : sisaBaris
    const uraian = uraianKasar
      .replace(/[|;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[-–:.\s]+|[-–:.\s]+$/g, '')
      .trim()

    // 4. Satu kode hanya dicatat sekali (baris duplikat akibat pemenggalan PDF).
    const kunci = `${kode}|${pagu}`
    if (sudahAda.has(kunci)) continue
    sudahAda.add(kunci)

    hasil.push({
      kode_mak: kode,
      uraian: uraian || null,
      // Jaga-jaga terhadap nilai negatif/aneh.
      pagu: Math.max(0, Math.round(pagu)),
    })
  }

  return hasil
}
