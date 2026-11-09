-- ============================================
-- MIGRATION V9: Modul Surat Keputusan (SK)
-- ============================================

CREATE TABLE IF NOT EXISTS public.dokumen_sk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_sk TEXT,
  judul TEXT NOT NULL,
  kategori TEXT DEFAULT 'Umum',
  unit_pemilik TEXT,
  tahun_berlaku INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
  tanggal_terbit DATE,
  versi INTEGER DEFAULT 1,
  link_sk TEXT NOT NULL,
  keterangan TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dokumen_sk_tahun ON public.dokumen_sk(tahun_berlaku);
CREATE INDEX IF NOT EXISTS idx_dokumen_sk_kategori ON public.dokumen_sk(kategori);

ALTER TABLE public.dokumen_sk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sk_select" ON public.dokumen_sk;
CREATE POLICY "sk_select" ON public.dokumen_sk
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara','BMN','Teknis','Perencanaan','Pengusul']));

DROP POLICY IF EXISTS "sk_write" ON public.dokumen_sk;
CREATE POLICY "sk_write" ON public.dokumen_sk
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin']))
  WITH CHECK (public.has_active_role(ARRAY['Admin']));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dokumen_sk_updated_at ON public.dokumen_sk;
CREATE TRIGGER trg_dokumen_sk_updated_at
BEFORE UPDATE ON public.dokumen_sk
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
