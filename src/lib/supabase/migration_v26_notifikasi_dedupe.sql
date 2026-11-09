-- Migration v26: kunci anti-duplikat notifikasi + indeks pendukung.
--
-- Latar belakang:
--   Notifikasi berulang dari cron (ringkasan harian, SLA utilitas) disisipkan
--   tanpa pembeda, sehingga:
--     1. cron ringkasan harian menumpuk satu baris per hari per penerima
--        walaupun isinya identik, dan lonceng notifikasi penuh oleh pesan
--        serupa;
--     2. pemeriksaan "sudah pernah dinotifikasi?" harus menebak lewat kolom
--        title (seperti migration_v21) yang rapuh bila judul berubah.
--
-- Solusi:
--   Kolom `dedupe_key` menyimpan penanda logis notifikasi (mis.
--   'ringkasan-harian:2026-10-23'). lib/notify.ts lalu melewati penyisipan
--   bila kombinasi (user_id, type, dedupe_key) sudah ada dalam jendela waktu
--   yang ditentukan pemanggil.
--
-- Sifat: idempoten — aman dijalankan berulang.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

-- Indeks parsial: hanya baris yang memakai dedupe yang perlu diindeks,
-- sehingga ukuran indeks tetap kecil meski tabel notifikasi besar.
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON public.notifications (user_id, type, dedupe_key, created_at DESC)
  WHERE dedupe_key IS NOT NULL;

-- Mempercepat pembersihan notifikasi lama (housekeeping manual/cron).
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications (created_at DESC);
