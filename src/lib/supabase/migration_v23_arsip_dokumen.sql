-- Migration v23: Arsip dokumen terpusat (upload langsung ke Cloudinary + arsip Drive).
--
-- Latar belakang:
--   Endpoint /api/upload mengirim berkas ke Cloudinary lalu MENGEMBALIKAN URL ke
--   peramban tanpa menyimpannya ke basis data. Akibatnya:
--     1. Berkas besar (>4,5 MB) ditolak Vercel (FUNCTION_PAYLOAD_TOO_LARGE)
--        sebelum kode aplikasi berjalan, dan respons berupa teks biasa
--        "Request Entity Too Large" sehingga peramban gagal JSON.parse()
--        ("Unexpected token 'R'").
--     2. Berkas kecil yang berhasil diunggah tetap tidak tercatat di mana pun,
--        sehingga tidak dapat diarsipkan ke Google Drive dan tidak dapat ditelusuri.
--
-- Solusi:
--   Tabel public.arsip_dokumen menjadi sumber kebenaran tunggal untuk setiap
--   berkas yang diunggah melalui CMS:
--     - peramban meminta tanda tangan (/api/upload/sign) lalu mengunggah
--       LANGSUNG ke Cloudinary (tidak melewati fungsi Vercel → tanpa batas 4,5 MB)
--     - setelah selesai, peramban mencatat metadata ke tabel ini
--       (/api/upload/complete) sehingga tercatat, dapat diaudit, dan dapat
--       diarsipkan ke Google Drive oleh pekerja arsip di VPS.
--
-- Sifat: idempoten — aman dijalankan berulang.

CREATE TABLE IF NOT EXISTS public.arsip_dokumen (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modul          TEXT NOT NULL,
  nama_asli      TEXT NOT NULL,
  ukuran         BIGINT NOT NULL DEFAULT 0,
  mime           TEXT,
  ekstensi       TEXT,
  url_cloudinary TEXT NOT NULL,
  public_id      TEXT,
  folder         TEXT,
  diunggah_oleh  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email_pengunggah TEXT,
  drive_file_id  TEXT,
  drive_url      TEXT,
  status_arsip   TEXT NOT NULL DEFAULT 'menunggu',
  arsip_error    TEXT,
  arsip_at       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Validasi status agar pekerja arsip dapat mengandalkan nilainya.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'arsip_dokumen_status_arsip_check'
  ) THEN
    ALTER TABLE public.arsip_dokumen
      ADD CONSTRAINT arsip_dokumen_status_arsip_check
      CHECK (status_arsip IN ('menunggu', 'diproses', 'terarsip', 'gagal'));
  END IF;
END $$;

-- Satu berkas Cloudinary hanya boleh tercatat sekali (idempoten saat retry).
CREATE UNIQUE INDEX IF NOT EXISTS arsip_dokumen_public_id_key
  ON public.arsip_dokumen (public_id)
  WHERE public_id IS NOT NULL;

-- Indeks untuk pekerja arsip (mengambil antrean) dan untuk tampilan CMS.
CREATE INDEX IF NOT EXISTS arsip_dokumen_status_idx
  ON public.arsip_dokumen (status_arsip, created_at);

CREATE INDEX IF NOT EXISTS arsip_dokumen_modul_idx
  ON public.arsip_dokumen (modul, created_at DESC);

-- Keamanan: RLS aktif, tanpa kebijakan longgar. Server memakai service role
-- (bypass RLS) sehingga tidak ada jalur baca/tulis langsung dari peramban.
ALTER TABLE public.arsip_dokumen ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.arsip_dokumen IS
  'Arsip terpusat berkas CMS: metadata Cloudinary + status pengarsipan ke Google Drive.';
COMMENT ON COLUMN public.arsip_dokumen.status_arsip IS
  'menunggu → belum diarsipkan; diproses → sedang dikerjakan pekerja; terarsip → sudah ada di Drive; gagal → perlu tindakan.';
COMMENT ON COLUMN public.arsip_dokumen.drive_file_id IS
  'ID berkas Google Drive hasil pengarsipan (diisi pekerja arsip di VPS).';

NOTIFY pgrst, 'reload schema';
