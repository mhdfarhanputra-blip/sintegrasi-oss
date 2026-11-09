-- Migration v12: repair/ensure Surat Keputusan (SK) table in production.
-- Safe to run after v9/v10/v11 because all operations are idempotent.

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'Pengusul');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.current_role() = 'Admin';
$$;

CREATE OR REPLACE FUNCTION public.has_active_role(allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'Aktif'
      AND role = ANY(allowed_roles)
  );
$$;

DO $$
BEGIN
  IF to_regclass('public.dokumen_sk') IS NULL AND to_regclass('public.dokumen_sop') IS NOT NULL THEN
    ALTER TABLE public.dokumen_sop RENAME TO dokumen_sk;
  END IF;
END $$;

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dokumen_sk' AND column_name = 'nomor_sop'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dokumen_sk' AND column_name = 'nomor_sk'
  ) THEN
    ALTER TABLE public.dokumen_sk RENAME COLUMN nomor_sop TO nomor_sk;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dokumen_sk' AND column_name = 'link_sop'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dokumen_sk' AND column_name = 'link_sk'
  ) THEN
    ALTER TABLE public.dokumen_sk RENAME COLUMN link_sop TO link_sk;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dokumen_sk_tahun ON public.dokumen_sk(tahun_berlaku);
CREATE INDEX IF NOT EXISTS idx_dokumen_sk_kategori ON public.dokumen_sk(kategori);

ALTER TABLE public.dokumen_sk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sop_select" ON public.dokumen_sk;
DROP POLICY IF EXISTS "sop_write" ON public.dokumen_sk;
DROP POLICY IF EXISTS "sk_select" ON public.dokumen_sk;
CREATE POLICY "sk_select" ON public.dokumen_sk
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara','BMN','Teknis','Perencanaan','PPSPM','PPK','Operator Keuangan']));

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

DROP TRIGGER IF EXISTS trg_dokumen_sop_updated_at ON public.dokumen_sk;
DROP TRIGGER IF EXISTS trg_dokumen_sk_updated_at ON public.dokumen_sk;
CREATE TRIGGER trg_dokumen_sk_updated_at
BEFORE UPDATE ON public.dokumen_sk
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
