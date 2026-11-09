-- ============================================
-- Migration v5: Data Intelligence
--   - dipa_items (struktur MAK per revisi)
--   - keuangan.mak_code (mapping transaksi -> MAK)
--   - view v_realisasi_per_mak
-- ============================================

-- 1. DIPA ITEMS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dipa_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dokumen_dipa_id UUID REFERENCES public.dokumen_dipa(id) ON DELETE CASCADE,
  revisi_ke INTEGER NOT NULL DEFAULT 0,
  kode_mak TEXT NOT NULL,
  uraian TEXT,
  pagu BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dipa_items_mak_idx ON public.dipa_items (kode_mak);
CREATE INDEX IF NOT EXISTS dipa_items_revisi_idx ON public.dipa_items (revisi_ke DESC);

ALTER TABLE public.dipa_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dipa_items_select" ON public.dipa_items;
CREATE POLICY "dipa_items_select" ON public.dipa_items
  FOR SELECT TO authenticated USING (public.current_role() <> 'Pengusul');
DROP POLICY IF EXISTS "dipa_items_write_admin" ON public.dipa_items;
CREATE POLICY "dipa_items_write_admin" ON public.dipa_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2. KEUANGAN.MAK_CODE -------------------------------------------------
ALTER TABLE public.keuangan ADD COLUMN IF NOT EXISTS kode_mak TEXT;
CREATE INDEX IF NOT EXISTS keuangan_mak_idx ON public.keuangan (kode_mak);

-- 3. VIEW REALISASI PER MAK -------------------------------------------
-- Realisasi = jumlah nominal transaksi Kredit per kode MAK
CREATE OR REPLACE VIEW public.v_realisasi_per_mak AS
SELECT
  kode_mak,
  COALESCE(SUM(CASE WHEN jenis_transaksi = 'Kredit' THEN nominal ELSE 0 END), 0) AS realisasi,
  COUNT(*) FILTER (WHERE jenis_transaksi = 'Kredit') AS jumlah_transaksi,
  MAX(tanggal) FILTER (WHERE jenis_transaksi = 'Kredit') AS transaksi_terakhir
FROM public.keuangan
WHERE kode_mak IS NOT NULL AND kode_mak <> ''
GROUP BY kode_mak;

GRANT SELECT ON public.v_realisasi_per_mak TO authenticated;

-- 4. FUNCTION: snapshot pagu-vs-realisasi untuk revisi terbaru --------
CREATE OR REPLACE FUNCTION public.get_pagu_vs_realisasi()
RETURNS TABLE (
  kode_mak TEXT,
  uraian TEXT,
  pagu BIGINT,
  realisasi BIGINT,
  persentase NUMERIC,
  jumlah_transaksi BIGINT,
  transaksi_terakhir DATE
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH latest_revisi AS (
    SELECT MAX(revisi_ke) AS r FROM public.dipa_items
  ),
  pagu_latest AS (
    SELECT kode_mak, MAX(uraian) AS uraian, SUM(pagu) AS pagu
    FROM public.dipa_items
    WHERE revisi_ke = (SELECT r FROM latest_revisi)
    GROUP BY kode_mak
  )
  SELECT
    p.kode_mak,
    p.uraian,
    p.pagu,
    COALESCE(r.realisasi, 0) AS realisasi,
    CASE WHEN p.pagu > 0
         THEN ROUND((COALESCE(r.realisasi,0)::numeric / p.pagu::numeric) * 100, 2)
         ELSE 0 END AS persentase,
    COALESCE(r.jumlah_transaksi, 0) AS jumlah_transaksi,
    r.transaksi_terakhir
  FROM pagu_latest p
  LEFT JOIN public.v_realisasi_per_mak r USING (kode_mak)
  ORDER BY p.pagu DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_pagu_vs_realisasi() TO authenticated;

-- 5. FUNCTION: diff antar revisi DIPA ---------------------------------
CREATE OR REPLACE FUNCTION public.get_dipa_diff(p_rev_a INTEGER, p_rev_b INTEGER)
RETURNS TABLE (
  kode_mak TEXT,
  uraian TEXT,
  pagu_a BIGINT,
  pagu_b BIGINT,
  selisih BIGINT,
  persen_perubahan NUMERIC
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH a AS (
    SELECT kode_mak, MAX(uraian) uraian, SUM(pagu) pagu
    FROM public.dipa_items WHERE revisi_ke = p_rev_a GROUP BY kode_mak
  ),
  b AS (
    SELECT kode_mak, MAX(uraian) uraian, SUM(pagu) pagu
    FROM public.dipa_items WHERE revisi_ke = p_rev_b GROUP BY kode_mak
  )
  SELECT
    COALESCE(a.kode_mak, b.kode_mak) AS kode_mak,
    COALESCE(b.uraian, a.uraian) AS uraian,
    COALESCE(a.pagu, 0) AS pagu_a,
    COALESCE(b.pagu, 0) AS pagu_b,
    COALESCE(b.pagu, 0) - COALESCE(a.pagu, 0) AS selisih,
    CASE WHEN COALESCE(a.pagu, 0) = 0 THEN NULL
         ELSE ROUND(((COALESCE(b.pagu, 0) - COALESCE(a.pagu, 0))::numeric / a.pagu::numeric) * 100, 2) END AS persen_perubahan
  FROM a FULL OUTER JOIN b USING (kode_mak)
  ORDER BY ABS(COALESCE(b.pagu, 0) - COALESCE(a.pagu, 0)) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_dipa_diff(INTEGER, INTEGER) TO authenticated;
