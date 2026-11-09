-- Migration v28: Riwayat eksekusi cron (Command Center).
--
-- LATAR BELAKANG
--   Jadwal pekerjaan terjadwal tersebar di vercel.json dan crontab host VPS,
--   tanpa riwayat yang dapat ditanyakan. Akibatnya kegagalan hanya terlihat
--   bila seseorang kebetulan membuka log yang tepat, dan ada pekerjaan yang
--   berhenti berbulan-bulan tanpa disadari.
--
--   Tabel ini menyimpan setiap eksekusi beserta durasi, hasil, dan pesan galat,
--   sehingga halaman /cron dapat menampilkan "terakhir berjalan kapan, berhasil
--   atau tidak, berapa lama" untuk SEMUA cron — baik yang berjalan di Vercel
--   maupun yang melapor dari VPS.
--
-- Sifat: idempoten — aman dijalankan berulang.

CREATE TABLE IF NOT EXISTS public.cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kunci entri dari lib/cronRegistry.ts (mis. 'sla-utilitas').
  cron_id TEXT NOT NULL,
  -- Kapan eksekusi DIMULAI (bukan kapan baris dicatat).
  mulai_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  selesai_at TIMESTAMPTZ,
  -- 'berjalan' | 'sukses' | 'gagal' | 'dilewati'
  status TEXT NOT NULL DEFAULT 'berjalan',
  durasi_ms INTEGER,
  -- Ringkasan singkat hasil (mis. "12 permohonan diperiksa").
  pesan TEXT,
  -- Pesan galat bila status = 'gagal'.
  galat TEXT,
  -- Dari mana eksekusi dilaporkan: 'vercel' | 'vps'.
  sumber TEXT,
  -- Data tambahan bebas (jumlah baris diproses, id permintaan, dll).
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status hanya boleh bernilai yang dikenal aplikasi. Ditulis sebagai
-- pemeriksaan longgar agar tidak memutus pelaporan versi lama.
ALTER TABLE public.cron_runs
  DROP CONSTRAINT IF EXISTS cron_runs_status_check;
ALTER TABLE public.cron_runs
  ADD CONSTRAINT cron_runs_status_check
  CHECK (status IN ('berjalan', 'sukses', 'gagal', 'dilewati'));

-- Indeks untuk halaman dasbor: "eksekusi terakhir per cron".
CREATE INDEX IF NOT EXISTS idx_cron_runs_cron_mulai
  ON public.cron_runs (cron_id, mulai_at DESC);

-- Indeks untuk pembersihan riwayat lama.
CREATE INDEX IF NOT EXISTS idx_cron_runs_mulai
  ON public.cron_runs (mulai_at DESC);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

-- Hanya Admin boleh membaca riwayat. Penulisan dilakukan lewat service-role
-- (route cron dan endpoint pelaporan VPS), sehingga tidak ada policy INSERT
-- untuk peran authenticated.
DROP POLICY IF EXISTS "cron_runs_read_admin" ON public.cron_runs;
CREATE POLICY "cron_runs_read_admin" ON public.cron_runs
  FOR SELECT TO authenticated USING (public.is_admin());

-- =====================================================================
-- Fungsi bantu: ambil eksekusi terakhir untuk sekumpulan cron_id.
-- Dipakai dasbor agar cukup satu round-trip, bukan satu kueri per cron.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cron_terakhir()
RETURNS TABLE (
  cron_id TEXT,
  mulai_at TIMESTAMPTZ,
  status TEXT,
  durasi_ms INTEGER,
  pesan TEXT,
  galat TEXT
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT DISTINCT ON (r.cron_id)
    r.cron_id, r.mulai_at, r.status, r.durasi_ms, r.pesan, r.galat
  FROM public.cron_runs r
  ORDER BY r.cron_id, r.mulai_at DESC;
$$;

NOTIFY pgrst, 'reload schema';
