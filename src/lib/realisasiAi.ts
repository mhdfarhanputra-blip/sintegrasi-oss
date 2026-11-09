import type { RealisasiRow } from '@/lib/realisasiParser'
import { normalizeRealisasiRows } from '@/lib/realisasiStore'

/**
 * realisasiNormalisasi.ts (dahulu realisasiAi.ts) — Normalisasi baris realisasi
 * tanpa AI.
 *
 * RIWAYAT
 *   Berkas ini sebelumnya bernama `realisasiAi.ts` dan memanggil DeepSeek untuk
 *   menebak `level` tiap baris Laporan FA Detail (16 Segmen) serta merapikan
 *   uraiannya. Bila `DEEPSEEK_API_KEY` kosong, fungsi itu sudah jatuh ke
 *   `normalizeRealisasiRows()` — jadi jalur tanpa AI memang perilaku normal.
 *
 * MENGAPA AI DIHAPUS
 *   1. Penentuan level adalah ATURAN PASTI, bukan hal yang perlu ditebak:
 *      kode program (GA), program.kegiatan (GA.7696), KRO (CBR), KRO.RO
 *      (CBR.001), komponen (401), subkomponen (401.AA), akun 6 digit (521211),
 *      dan rincian (000010. ...). Semua dapat dikenali dari pola kode.
 *   2. Data pagu dan realisasi tidak lagi dikirim ke pihak ketiga.
 *   3. Hasil deterministik dan dapat diuji.
 *   4. Berkas dengan ribuan baris tidak lagi menunggu puluhan panggilan API
 *      (sebelumnya 60 baris per panggilan, timeout 45 detik per panggilan).
 *
 * Nama fungsi dipertahankan agar pemanggil
 * (src/app/api/realisasi/upload/route.ts) tidak perlu diubah.
 */
export async function enhanceRealisasiRowsWithAi(rows: RealisasiRow[]): Promise<RealisasiRow[]> {
  return normalizeRealisasiRows(rows)
}
