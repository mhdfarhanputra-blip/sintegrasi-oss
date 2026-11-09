-- migration_v24_verifikasi_bertingkat.sql
-- Alur input bertahap dengan verifikasi Admin.
--
-- MASALAH YANG DISELESAIKAN
--   Operator Satker saat ini dapat menyimpan data yang langsung dianggap sah
--   dan langsung muncul di laporan. Tidak ada tahap pemeriksaan, sehingga
--   kesalahan input (nilai aset, nominal transaksi, jumlah stok) bisa terbawa
--   ke laporan resmi tanpa terdeteksi.
--
-- ALUR BARU
--   draft      : operator masih mengisi; BELUM muncul di laporan
--   menunggu   : operator sudah mengirim; menunggu Admin
--   disetujui  : Admin menyetujui; MUNCUL di laporan & ekspor
--   ditolak    : Admin menolak (+catatan); TIDAK muncul, operator perbaiki
--
-- CAKUPAN (sengaja dibatasi pada tiga modul data resmi):
--   bmn, keuangan, persediaan
--   DIPA & SK tidak disertakan karena sudah memiliki pola revisi/versi sendiri;
--   Jadwal tidak disertakan karena agenda bukan data yang perlu dipertanggung-
--   jawabkan secara angka.
--
-- PENTING: nilai bawaan 'disetujui' agar SELURUH DATA LAMA (320 aset BMN,
-- 5 persediaan, keuangan) tetap dianggap sah dan tidak hilang dari laporan
-- setelah migrasi dijalankan.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bmn', 'keuangan', 'persediaan']
  LOOP
    -- Kolom status verifikasi
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS status_verifikasi text NOT NULL DEFAULT 'disetujui'
    $f$, t);

    -- Batasi nilai yang sah (hanya bila constraint belum ada)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_status_verifikasi_check'
    ) THEN
      EXECUTE format($f$
        ALTER TABLE public.%I
          ADD CONSTRAINT %I CHECK (
            status_verifikasi IN ('draft', 'menunggu', 'disetujui', 'ditolak')
          )
      $f$, t, t || '_status_verifikasi_check');
    END IF;

    -- Kolom pendukung pemeriksaan
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS verifikasi_catatan text,
        ADD COLUMN IF NOT EXISTS verifikasi_oleh uuid,
        ADD COLUMN IF NOT EXISTS verifikasi_at timestamptz,
        ADD COLUMN IF NOT EXISTS dikirim_at timestamptz,
        ADD COLUMN IF NOT EXISTS dikirim_oleh uuid
    $f$, t);

    -- Indeks antrean Admin: hanya baris berstatus 'menunggu'
    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS %I
        ON public.%I (dikirim_at DESC)
        WHERE status_verifikasi = 'menunggu'
    $f$, t || '_verifikasi_antrean_idx', t);
  END LOOP;
END $$;

-- Pastikan seluruh data lama dianggap sah (idempoten).
UPDATE public.bmn        SET status_verifikasi = 'disetujui' WHERE status_verifikasi IS NULL;
UPDATE public.keuangan   SET status_verifikasi = 'disetujui' WHERE status_verifikasi IS NULL;
UPDATE public.persediaan SET status_verifikasi = 'disetujui' WHERE status_verifikasi IS NULL;

-- Muat ulang skema agar PostgREST mengenali kolom baru.
NOTIFY pgrst, 'reload schema';
