import { normalizeIemonDataset, type IemonDataset } from '@/lib/iemonParser'

/**
 * iemonNormalisasi.ts (dahulu iemonAi.ts) — Normalisasi dataset i-EMON tanpa AI.
 *
 * RIWAYAT
 *   Berkas ini sebelumnya bernama `iemonAi.ts` dan memanggil DeepSeek untuk
 *   "memperbagus" label/kategori tiap baris paket, kontraktual, dan RKA-KL.
 *   Data tersebut dikirim ke pihak ketiga dalam potongan 30 baris, dengan
 *   timeout 45 detik per potongan.
 *
 *   Namun bila `DEEPSEEK_API_KEY` kosong, fungsi itu SUDAH jatuh ke
 *   `normalizeIemonDataset()` — parser deterministik. Artinya jalur tanpa AI
 *   memang sudah menjadi perilaku normal, dan AI hanya menambah variasi pada
 *   hasil yang seharusnya sama.
 *
 * MENGAPA AI DIHAPUS
 *   1. Data anggaran (pagu, nama paket, nilai kontrak) tidak lagi keluar ke
 *      pihak ketiga.
 *   2. Hasil menjadi DETERMINISTIK: berkas sama -> hasil sama, dapat diuji dan
 *      diaudit. Sebelumnya label bisa berubah antar-unggahan.
 *   3. Tidak ada biaya per token, batas kuota, atau kegagalan jaringan.
 *   4. Unggahan jauh lebih cepat: sebelumnya harus menunggu belasan panggilan
 *      API untuk berkas berisi ratusan baris.
 *
 * Nama fungsi `enhanceIemonDatasetWithAi` sengaja DIPERTAHANKAN agar pemanggil
 * (src/app/api/iemon/upload/route.ts) tidak perlu diubah, tetapi kini murni
 * deterministik dan tidak menyentuh jaringan.
 */
export async function enhanceIemonDatasetWithAi(dataset: IemonDataset): Promise<IemonDataset> {
  return normalizeIemonDataset(dataset)
}
