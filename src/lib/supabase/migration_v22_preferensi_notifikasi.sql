-- Migration v22: Preferensi notifikasi per pengguna.
--
-- Latar belakang:
--   Setiap pengguna perlu dapat mengatur sendiri apakah ingin menerima
--   notifikasi melalui email dan/atau notifikasi di dalam aplikasi (in-app).
--   Sebelumnya tabel public.profiles belum memiliki kolom untuk menyimpan
--   preferensi tersebut, sehingga notifikasi tidak dapat dipersonalisasi.
--
-- Solusi:
--   Menambahkan dua kolom boolean pada public.profiles:
--     - notif_email_enabled : preferensi apakah pengguna menerima notifikasi
--                             melalui email. Default TRUE (aktif).
--     - notif_inapp_enabled : preferensi apakah pengguna menerima notifikasi
--                             di dalam aplikasi (in-app). Default TRUE (aktif).
--
-- Sifat: idempoten — aman dijalankan berulang karena memakai
--        ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_email_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_inapp_enabled BOOLEAN DEFAULT TRUE;

-- Komentar kolom (dokumentasi pada katalog database).
COMMENT ON COLUMN public.profiles.notif_email_enabled IS
  'Preferensi pengguna: TRUE bila bersedia menerima notifikasi via email.';
COMMENT ON COLUMN public.profiles.notif_inapp_enabled IS
  'Preferensi pengguna: TRUE bila bersedia menerima notifikasi in-app (dalam aplikasi).';

NOTIFY pgrst, 'reload schema';
