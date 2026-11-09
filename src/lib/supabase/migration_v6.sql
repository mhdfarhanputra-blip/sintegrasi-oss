-- ============================================
-- Migration v6: Audit Log + Tahun Anggaran + BMN Workflow
-- ============================================

-- 1. AUDIT LOG --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT,
  diff_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_read_admin" ON public.audit_log;
CREATE POLICY "audit_log_read_admin" ON public.audit_log
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin' AND status = 'Aktif')
  );
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;

-- Trigger function untuk audit log otomatis
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor UUID;
  v_email TEXT;
  v_summary TEXT;
BEGIN
  v_actor := auth.uid();
  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;

  IF TG_OP = 'DELETE' THEN
    v_summary := TG_TABLE_NAME || ' dihapus';
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, summary)
    VALUES (v_actor, v_email, 'DELETE', TG_TABLE_NAME, OLD.id::text, v_summary);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_summary := TG_TABLE_NAME || ' diperbarui';
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, summary)
    VALUES (v_actor, v_email, 'UPDATE', TG_TABLE_NAME, NEW.id::text, v_summary);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_summary := TG_TABLE_NAME || ' ditambahkan';
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, summary)
    VALUES (v_actor, v_email, 'INSERT', TG_TABLE_NAME, NEW.id::text, v_summary);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Pasang trigger di tabel utama
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['keuangan','persediaan','bmn','utilitas','dokumen_dipa','profiles'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$I ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$I AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log()', t);
  END LOOP;
END $$;

-- 2. TAHUN ANGGARAN ---------------------------------------------------
ALTER TABLE public.keuangan ADD COLUMN IF NOT EXISTS tahun_anggaran INTEGER DEFAULT EXTRACT(YEAR FROM NOW());
ALTER TABLE public.persediaan ADD COLUMN IF NOT EXISTS tahun_anggaran INTEGER DEFAULT EXTRACT(YEAR FROM NOW());
ALTER TABLE public.utilitas ADD COLUMN IF NOT EXISTS tahun_anggaran INTEGER DEFAULT EXTRACT(YEAR FROM NOW());
ALTER TABLE public.dokumen_dipa ADD COLUMN IF NOT EXISTS tahun_anggaran INTEGER DEFAULT EXTRACT(YEAR FROM NOW());
ALTER TABLE public.dokumen_dipa ADD COLUMN IF NOT EXISTS tanggal_revisi DATE;

-- 3. BMN: Tahun Pengadaan + Workflow Tahunan ------------------------------
ALTER TABLE public.bmn ADD COLUMN IF NOT EXISTS tahun_pengadaan INTEGER;
ALTER TABLE public.bmn ADD COLUMN IF NOT EXISTS tahun_pencatatan INTEGER DEFAULT EXTRACT(YEAR FROM NOW());
ALTER TABLE public.bmn ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE public.bmn ADD COLUMN IF NOT EXISTS last_checked_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.bmn ADD COLUMN IF NOT EXISTS imported_from UUID REFERENCES public.bmn(id);

-- Index untuk filter tahun
CREATE INDEX IF NOT EXISTS keuangan_tahun_idx ON public.keuangan (tahun_anggaran);
CREATE INDEX IF NOT EXISTS persediaan_tahun_idx ON public.persediaan (tahun_anggaran);
CREATE INDEX IF NOT EXISTS bmn_tahun_idx ON public.bmn (tahun_pencatatan);


-- 4. PERSEDIAAN: Dokumentasi barang ----------------------------------
ALTER TABLE public.persediaan ADD COLUMN IF NOT EXISTS link_dokumentasi TEXT;
