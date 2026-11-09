-- ============================================
-- Migration v3: Approval Workflow + Utilitas Paralel
-- Jalankan di Supabase SQL Editor. Idempotent (aman dijalankan ulang).
-- ============================================

-- 1. PROFILES — tambah status approval
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Aktif','Nonaktif')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id);

-- Pengguna yang sudah ada anggap Aktif (agar tidak terkunci)
UPDATE public.profiles SET status = 'Aktif' WHERE status IS NULL OR status = 'Pending';

-- Pastikan constraint role ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('Admin','Bendahara','BMN','Teknis','Perencanaan','Pengusul'));
  END IF;
END $$;

-- 2. UTILITAS — tambah kolom review paralel
ALTER TABLE public.utilitas
  ADD COLUMN IF NOT EXISTS revisi_ke INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_satker TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (review_satker IN ('PENDING','OK','CATATAN')),
  ADD COLUMN IF NOT EXISTS review_satker_catatan TEXT,
  ADD COLUMN IF NOT EXISTS review_satker_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS review_satker_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_perencanaan TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (review_perencanaan IN ('PENDING','OK','CATATAN')),
  ADD COLUMN IF NOT EXISTS review_perencanaan_catatan TEXT,
  ADD COLUMN IF NOT EXISTS review_perencanaan_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS review_perencanaan_at TIMESTAMPTZ;

-- Normalisasi status lama -> skema baru
UPDATE public.utilitas SET status = 'DIAJUKAN' WHERE status = 'OPEN';
UPDATE public.utilitas SET status = 'PEMERIKSAAN' WHERE status = 'IN PROGRESS';
UPDATE public.utilitas SET status = 'DITERIMA' WHERE status = 'DONE';
UPDATE public.utilitas SET status = 'DITOLAK' WHERE status = 'REJECTED';

-- Update constraint status utilitas
ALTER TABLE public.utilitas DROP CONSTRAINT IF EXISTS utilitas_status_check;
ALTER TABLE public.utilitas
  ADD CONSTRAINT utilitas_status_check
  CHECK (status IN ('DIAJUKAN','PEMERIKSAAN','REVISI','DITOLAK','DITERIMA'));

-- 3. FUNCTIONS & TRIGGERS

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Admin' AND status = 'Aktif'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.compute_utilitas_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'DITOLAK' THEN
    RETURN NEW;
  END IF;
  IF NEW.review_satker = 'CATATAN' OR NEW.review_perencanaan = 'CATATAN' THEN
    NEW.status := 'REVISI';
  ELSIF NEW.review_satker = 'OK' AND NEW.review_perencanaan = 'OK' THEN
    NEW.status := 'DITERIMA';
  ELSIF NEW.status IN ('PEMERIKSAAN','DIAJUKAN') THEN
    NEW.status := 'PEMERIKSAAN';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_utilitas_status ON public.utilitas;
CREATE TRIGGER trg_compute_utilitas_status
BEFORE INSERT OR UPDATE OF review_satker, review_perencanaan ON public.utilitas
FOR EACH ROW EXECUTE FUNCTION public.compute_utilitas_status();

CREATE OR REPLACE FUNCTION public.log_utilitas_transmital()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_catatan TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.transmital (utilitas_id, tahapan, pic, waktu_masuk)
    VALUES (NEW.id, NEW.status, NEW.input_by, NOW());
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.transmital
      SET waktu_selesai = NOW(),
          durasi_hari = GREATEST(0, EXTRACT(DAY FROM NOW() - waktu_masuk)::int)
      WHERE utilitas_id = NEW.id AND waktu_selesai IS NULL;

    v_catatan := NULL;
    IF NEW.status = 'REVISI' THEN
      v_catatan := concat_ws(' | ',
        CASE WHEN NEW.review_satker = 'CATATAN'
             THEN 'Satker: ' || COALESCE(NEW.review_satker_catatan,'-') END,
        CASE WHEN NEW.review_perencanaan = 'CATATAN'
             THEN 'Perencanaan: ' || COALESCE(NEW.review_perencanaan_catatan,'-') END
      );
    END IF;

    INSERT INTO public.transmital (utilitas_id, tahapan, pic, waktu_masuk, catatan)
    VALUES (NEW.id, NEW.status, NEW.current_pic, NOW(), v_catatan);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_utilitas_transmital ON public.utilitas;
CREATE TRIGGER trg_log_utilitas_transmital
AFTER INSERT OR UPDATE OF status ON public.utilitas
FOR EACH ROW EXECUTE FUNCTION public.log_utilitas_transmital();

-- 4. RLS POLICIES
-- Hapus policy lama lalu buat ulang berbasis role

DROP POLICY IF EXISTS "Authenticated read" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR id = auth.uid())
  WITH CHECK (public.is_admin() OR id = auth.uid());
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated read" ON public.utilitas;
DROP POLICY IF EXISTS "Authenticated insert" ON public.utilitas;
DROP POLICY IF EXISTS "Authenticated update" ON public.utilitas;
DROP POLICY IF EXISTS "Authenticated delete" ON public.utilitas;
DROP POLICY IF EXISTS "utilitas_select" ON public.utilitas;
DROP POLICY IF EXISTS "utilitas_insert" ON public.utilitas;
DROP POLICY IF EXISTS "utilitas_update" ON public.utilitas;
DROP POLICY IF EXISTS "utilitas_delete" ON public.utilitas;

CREATE POLICY "utilitas_select" ON public.utilitas
  FOR SELECT TO authenticated
  USING (public.current_role() <> 'Pengusul' OR input_by = auth.uid());
CREATE POLICY "utilitas_insert" ON public.utilitas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));
CREATE POLICY "utilitas_update" ON public.utilitas
  FOR UPDATE TO authenticated
  USING (
    (public.current_role() = 'Pengusul' AND input_by = auth.uid())
    OR public.current_role() IN ('Admin','Teknis','Perencanaan')
  );
CREATE POLICY "utilitas_delete" ON public.utilitas
  FOR DELETE TO authenticated USING (public.current_role() = 'Admin');

DROP POLICY IF EXISTS "Authenticated read" ON public.transmital;
DROP POLICY IF EXISTS "Authenticated insert" ON public.transmital;
DROP POLICY IF EXISTS "transmital_select" ON public.transmital;
DROP POLICY IF EXISTS "transmital_write" ON public.transmital;

CREATE POLICY "transmital_select" ON public.transmital
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.utilitas u
      WHERE u.id = utilitas_id
        AND (public.current_role() <> 'Pengusul' OR u.input_by = auth.uid())
    )
  );
CREATE POLICY "transmital_write" ON public.transmital
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

DROP POLICY IF EXISTS "Authenticated read" ON public.dokumen_dipa;
DROP POLICY IF EXISTS "Authenticated insert" ON public.dokumen_dipa;
DROP POLICY IF EXISTS "dipa_select" ON public.dokumen_dipa;
DROP POLICY IF EXISTS "dipa_write" ON public.dokumen_dipa;

CREATE POLICY "dipa_select" ON public.dokumen_dipa
  FOR SELECT TO authenticated USING (public.current_role() <> 'Pengusul');
CREATE POLICY "dipa_write" ON public.dokumen_dipa
  FOR ALL TO authenticated
  USING (public.current_role() = 'Admin')
  WITH CHECK (public.current_role() = 'Admin');
