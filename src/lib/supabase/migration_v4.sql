-- ============================================
-- Migration v4: Sprint 1 + 2
--   - audit_log (governance)
--   - notifications (in-app bell)
--   - kategori_keuangan (data quality)
--   - persediaan.stok_minimum (alert)
--   - utilitas.tracking_token + sla_warned_at (public URL + escalation)
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
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor UUID;
  v_email TEXT;
  v_summary TEXT;
  v_entity_id TEXT;
BEGIN
  v_actor := auth.uid();
  SELECT email INTO v_email FROM public.profiles WHERE id = v_actor;

  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id::text;
    v_summary := TG_TABLE_NAME || ' dihapus';
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, summary, diff_json)
    VALUES (v_actor, v_email, 'DELETE', TG_TABLE_NAME, v_entity_id, v_summary, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := NEW.id::text;
    v_summary := TG_TABLE_NAME || ' diperbarui';
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, summary, diff_json)
    VALUES (v_actor, v_email, 'UPDATE', TG_TABLE_NAME, v_entity_id, v_summary,
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_entity_id := NEW.id::text;
    v_summary := TG_TABLE_NAME || ' ditambahkan';
    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, summary, diff_json)
    VALUES (v_actor, v_email, 'INSERT', TG_TABLE_NAME, v_entity_id, v_summary, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['keuangan','persediaan','bmn','utilitas','dokumen_dipa','profiles'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$I ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$I AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log()', t);
  END LOOP;
END $$;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_read_admin" ON public.audit_log;
CREATE POLICY "audit_log_read_admin" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- 2. NOTIFICATIONS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_read_self" ON public.notifications;
CREATE POLICY "notif_read_self" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notif_update_self" ON public.notifications;
CREATE POLICY "notif_update_self" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notif_insert_service" ON public.notifications;

-- 3. KATEGORI KEUANGAN -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kategori_keuangan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL UNIQUE,
  jenis_default TEXT CHECK (jenis_default IN ('Debit','Kredit','Keduanya')) DEFAULT 'Keduanya',
  urutan INTEGER DEFAULT 0,
  aktif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.kategori_keuangan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kategori_select" ON public.kategori_keuangan;
CREATE POLICY "kategori_select" ON public.kategori_keuangan
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "kategori_write_admin" ON public.kategori_keuangan;
CREATE POLICY "kategori_write_admin" ON public.kategori_keuangan
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.kategori_keuangan (nama, jenis_default, urutan) VALUES
  ('BBM & Transportasi','Kredit',10),
  ('ATK & Bahan Habis','Kredit',20),
  ('Konsumsi Rapat','Kredit',30),
  ('Perjalanan Dinas','Kredit',40),
  ('Penerimaan Anggaran','Debit',50),
  ('Pengembalian Belanja','Debit',60),
  ('Lain-lain','Keduanya',100)
ON CONFLICT (nama) DO NOTHING;

-- 4. PERSEDIAAN ALERT STOK --------------------------------------------
ALTER TABLE public.persediaan ADD COLUMN IF NOT EXISTS stok_minimum INTEGER DEFAULT 0;

-- 5. UTILITAS: public tracking + SLA ----------------------------------
ALTER TABLE public.utilitas
  ADD COLUMN IF NOT EXISTS tracking_token TEXT UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 16),
  ADD COLUMN IF NOT EXISTS sla_warned_at TIMESTAMPTZ;

UPDATE public.utilitas
SET tracking_token = substr(md5(id::text || clock_timestamp()::text), 1, 16)
WHERE tracking_token IS NULL;

CREATE OR REPLACE FUNCTION public.get_utilitas_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  tgl_usul TIMESTAMPTZ,
  instansi TEXT,
  lokasi TEXT,
  jenis_pekerjaan TEXT,
  status TEXT,
  revisi_ke INTEGER,
  review_satker TEXT,
  review_satker_catatan TEXT,
  review_perencanaan TEXT,
  review_perencanaan_catatan TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, tgl_usul, instansi, lokasi, jenis_pekerjaan, status, revisi_ke,
         review_satker, review_satker_catatan,
         review_perencanaan, review_perencanaan_catatan, created_at
  FROM public.utilitas WHERE tracking_token = p_token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_utilitas_by_token(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_transmital_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  utilitas_id UUID,
  tahapan TEXT,
  waktu_masuk TIMESTAMPTZ,
  waktu_selesai TIMESTAMPTZ,
  durasi_hari INTEGER,
  catatan TEXT
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT t.id, t.utilitas_id, t.tahapan, t.waktu_masuk, t.waktu_selesai, t.durasi_hari, t.catatan
  FROM public.transmital t
  JOIN public.utilitas u ON u.id = t.utilitas_id
  WHERE u.tracking_token = p_token
  ORDER BY t.waktu_masuk ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_transmital_by_token(TEXT) TO anon, authenticated;

-- 6. NOTIFIKASI OTOMATIS UTILITAS -------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_utilitas_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_title TEXT;
  v_msg TEXT;
  v_link TEXT;
  v_pekerjaan TEXT;
BEGIN
  v_pekerjaan := COALESCE(NEW.jenis_pekerjaan, 'Permohonan utilitas');
  v_link := '/utilitas';

  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'DIAJUKAN' THEN
      v_title := 'Permohonan utilitas baru';
      v_msg := v_pekerjaan || ' menunggu untuk diperiksa.';
      INSERT INTO public.notifications (user_id, type, title, message, link)
      SELECT id, 'utilitas_baru', v_title, v_msg, v_link
      FROM public.profiles
      WHERE role IN ('Admin','Teknis') AND status = 'Aktif';

    ELSIF NEW.status = 'PEMERIKSAAN' THEN
      v_title := 'Permohonan siap direview';
      v_msg := v_pekerjaan || ' siap untuk pemeriksaan paralel.';
      INSERT INTO public.notifications (user_id, type, title, message, link)
      SELECT id, 'review_diminta', v_title, v_msg, v_link
      FROM public.profiles
      WHERE role IN ('Teknis','Perencanaan') AND status = 'Aktif';

    ELSIF NEW.status = 'REVISI' AND NEW.input_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (NEW.input_by, 'utilitas_revisi',
              'Permohonan perlu revisi',
              v_pekerjaan || ' butuh revisi sesuai catatan operator.',
              v_link);

    ELSIF NEW.status = 'DITERIMA' AND NEW.input_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (NEW.input_by, 'utilitas_diterima',
              'Permohonan disetujui',
              v_pekerjaan || ' telah disetujui.', v_link);

    ELSIF NEW.status = 'DITOLAK' AND NEW.input_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (NEW.input_by, 'utilitas_ditolak',
              'Permohonan ditolak',
              v_pekerjaan || ' tidak dapat diproses.', v_link);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_utilitas_status ON public.utilitas;
CREATE TRIGGER trg_notify_utilitas_status
AFTER INSERT OR UPDATE OF status ON public.utilitas
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_utilitas_status();

-- 7. NOTIFIKASI STOK KRITIS PERSEDIAAN --------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_stok_kritis()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.stok_saldo IS NULL OR COALESCE(NEW.stok_minimum, 0) = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.stok_saldo <= NEW.stok_minimum THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT id, 'stok_kritis',
           'Stok ' || NEW.nama_barang || ' kritis',
           'Sisa ' || NEW.stok_saldo || ' ' || COALESCE(NEW.satuan,'unit') ||
             ' (minimum ' || NEW.stok_minimum || ').',
           '/persediaan'
    FROM public.profiles
    WHERE role IN ('Admin','BMN','Bendahara') AND status = 'Aktif';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_stok_kritis ON public.persediaan;
CREATE TRIGGER trg_notify_stok_kritis
AFTER INSERT OR UPDATE OF stok_saldo, stok_minimum ON public.persediaan
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_stok_kritis();
