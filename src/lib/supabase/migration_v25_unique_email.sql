-- Migration v25: keunikan email pada tabel profiles.
--
-- Latar belakang (temuan audit Database F-01):
--   `profiles.email` tidak memiliki batasan UNIQUE. Akibatnya satu alamat email
--   dapat terdaftar pada lebih dari satu baris profil. Karena otorisasi modul
--   ditentukan dari baris profil, akun ganda berpotensi menimbulkan kebingungan
--   hak akses (satu email memiliki dua peran berbeda).
--
-- Pra-cek yang SUDAH dijalankan sebelum migrasi ini dibuat:
--   total 11 profil, 0 email duplikat, 0 email kosong.
--
-- Sifat: idempoten. Bila ternyata ada duplikat di kemudian hari, pembuatan
-- indeks akan GAGAL — itu disengaja: lebih baik gagal terang-terangan daripada
-- diam-diam memiliki akun ganda.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx
  ON public.profiles (lower(btrim(email)));

COMMENT ON INDEX public.profiles_email_unique_idx IS
  'Satu alamat email hanya boleh memiliki satu profil (dibandingkan tanpa peka huruf besar/kecil dan spasi tepi).';

NOTIFY pgrst, 'reload schema';
