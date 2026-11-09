-- ============================================================
-- MIGRASI v25 — PEMERIKSAAN SEMESTER BMN
-- ============================================================
-- Menyimpan RIWAYAT pemeriksaan kondisi aset per semester.
--
-- MENGAPA TABEL TERPISAH (bukan menimpa kolom `kondisi` di bmn)
--   Kolom bmn.kondisi hanya menyimpan nilai TERAKHIR. Bila pemeriksaan
--   semester menimpanya, jejak perubahan kondisi hilang sehingga tidak dapat
--   diketahui kapan aset berubah dari "Baik" menjadi "Rusak Ringan".
--   Dengan tabel riwayat, perkembangan tiap aset dapat ditelusuri.
--
-- Setiap pemeriksaan juga memperbarui bmn.kondisi + last_checked_at agar
-- tampilan utama BMN selalu memakai kondisi terbaru.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bmn_pemeriksaan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bmn_id uuid NOT NULL REFERENCES public.bmn(id) ON DELETE CASCADE,

  -- Periode pemeriksaan
  semester smallint NOT NULL CHECK (semester IN (1, 2)),
  tahun integer NOT NULL CHECK (tahun BETWEEN 2000 AND 2100),

  -- Kondisi sebelum & sesudah (riwayat tetap utuh walau aset berubah)
  kondisi_lama text,
  kondisi_baru text NOT NULL CHECK (kondisi_baru IN ('Baik', 'Rusak Ringan', 'Rusak Berat')),

  catatan text,
  foto_url text,

  diperiksa_oleh uuid,
  diperiksa_email text,
  diperiksa_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Satu aset diperiksa sekali per semester/tahun; pemeriksaan ulang menimpa
-- baris yang sama (upsert) agar rekap tidak menghitung ganda.
CREATE UNIQUE INDEX IF NOT EXISTS bmn_pemeriksaan_unik_idx
  ON public.bmn_pemeriksaan (bmn_id, tahun, semester);

CREATE INDEX IF NOT EXISTS bmn_pemeriksaan_periode_idx
  ON public.bmn_pemeriksaan (tahun DESC, semester DESC, diperiksa_at DESC);

CREATE INDEX IF NOT EXISTS bmn_pemeriksaan_aset_idx
  ON public.bmn_pemeriksaan (bmn_id, diperiksa_at DESC);

-- RLS: aktifkan, tanpa policy publik. Aplikasi mengakses lewat service role
-- (server) sehingga tidak ada akses langsung dari peramban.
ALTER TABLE public.bmn_pemeriksaan ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
