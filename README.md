# sintegrasi-oss

Modul terbuka dari platform operasional satuan kerja: **parser DIPA**, **normalisasi i-EMON**,
**laporan Excel/PDF**, dan **penjaga "bebas AI"**. Semua berjalan lokal, tanpa panggilan layanan AI,
tanpa kredensial di dalam kode.

## Modul

| Path | Isi |
|---|---|
| `src/lib/dipaParser.ts` | Ekstraksi item DIPA (pagu, realisasi, akun) dari teks/CSV hasil salin |
| `src/lib/realisasiNormalize.ts` | Normalisasi uraian ganda, pemisahan level program/kegiatan/akun |
| `src/lib/iemonNormalize.ts` | Normalisasi ekspor i-EMON → struktur stabil |
| `src/lib/excelLaporan.ts` | Laporan .xlsx (judul, kepala kolom, total) |
| `src/lib/pdfLaporan.server.ts` | Laporan PDF (pdfkit), nama organisasi dari `REPORT_ORG_NAME` |
| `src/lib/supabase/schema.sql` | Skema Postgres/Supabase + migrasi |
| `data/realisasi-data.json` | Contoh data (160 baris, sudah dianonimkan) |

## Pakai

```bash
npm install
npx vitest run          # 390 tes
npx tsc --noEmit        # type check
```

## Konfigurasi

Semua rahasia dari environment, tidak ada nilai tertanam:

```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
CRON_SECRET, INGEST_SECRET, REPORT_ORG_NAME, APP_BASE_URL, SMTP_FROM
```

## Lisensi

MIT.
