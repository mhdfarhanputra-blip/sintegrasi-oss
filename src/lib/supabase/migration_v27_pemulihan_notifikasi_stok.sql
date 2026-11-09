-- Migration v27: Pemulihan skema notifikasi + stok minimum di produksi.
--
-- LATAR BELAKANG (temuan audit 2026-10-23 terhadap database produksi)
-- ------------------------------------------------------------------
-- Pemeriksaan langsung ke PostgREST produksi menunjukkan tiga objek yang
-- dipakai kode tetapi TIDAK ADA di database:
--
--   1. public.notifications            → 404 PGRST205
--   2. public.profiles.notif_inapp_enabled / .notif_email_enabled → 42703
--   3. public.persediaan.stok_minimum  → 42703
--
-- Dampak nyata yang terverifikasi:
--   - Setiap pemanggilan notifyUser()/notifyUsersByRole() gagal. Karena
--     lib/notify.ts menelan galat (best-effort), kegagalan ini TIDAK terlihat:
--     lonceng notifikasi tidak pernah berbunyi, notifikasi pendaftar baru ke
--     Admin tidak pernah sampai, dan cron ringkasan harian melaporkan sukses
--     palsu.
--   - Trigger fn_notify_utilitas_status() dan fn_notify_stok_kritis() yang
--     disisipkan ke notifications juga tidak ada, sehingga even INSERT manual
--     tidak akan pernah terjadi.
--   - POST /api/persediaan menyertakan stok_minimum pada setiap insert/update
--     (PGRST204 "column not found" → 500). Halaman Persediaan dan KPI "stok
--     kritis" di dashboard membaca kolom yang sama.
--   - API preferensi (/api/profile/preferensi) membaca kolom yang tidak ada.
--
-- CATATAN: migration_v22_preferensi_notifikasi.sql ada di repo tetapi belum
-- pernah dijalankan di produksi. Berkas ini mengulang bagian yang diperlukan
-- (ADD COLUMN IF NOT EXISTS) agar satu kali eksekusi cukup.
--
-- Sifat: IDEMPOTEN — seluruh pernyataan memakai IF NOT EXISTS / OR REPLACE /
--        DROP ... IF EXISTS sebelum CREATE, sehingga aman dijalankan berulang.

-- =====================================================================
-- 1. Tabel notifications (definisi sama dengan migration_v4, + migrasi v26)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  -- v26: kunci anti-duplikat untuk notifikasi berulang (cron).
  dedupe_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Baris lama mungkin dibuat sebelum v26; pastikan kolomnya ada.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON public.notifications (user_id, type, dedupe_key, created_at DESC)
  WHERE dedupe_key IS NOT NULL;

-- =====================================================================
-- 2. RLS notifications
--    Notifikasi ditulis hanya oleh service-role (lib/notify.ts, trigger
--    SECURITY DEFINER). Pengguna hanya boleh membaca dan menandai
--    miliknya sendiri; tidak ada policy INSERT untuk authenticated.
-- =====================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_read_self" ON public.notifications;
CREATE POLICY "notif_read_self" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_update_self" ON public.notifications;
CREATE POLICY "notif_update_self" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- v15/v17 sengaja menghapus policy insert yang terlalu permisif. Ditegaskan
-- lagi di sini agar instalasi baru tidak mewarisi policy lama.
DROP POLICY IF EXISTS "notif_insert_service" ON public.notifications;

-- =====================================================================
-- 3. Preferensi notifikasi pada profiles (isi migration_v22)
-- =====================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_email_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_inapp_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.notif_email_enabled IS
  'Preferensi pengguna: TRUE bila bersedia menerima notifikasi via email.';
COMMENT ON COLUMN public.profiles.notif_inapp_enabled IS
  'Preferensi pengguna: TRUE bila bersedia menerima notifikasi in-app (dalam aplikasi).';

-- =====================================================================
-- 4. persediaan.stok_minimum
--    Ambang batas stok untuk KPI "stok kritis". Default 0 (= tidak dipantau),
--    sehingga barang lama tidak tiba-tiba dilaporkan kritis.
-- =====================================================================
ALTER TABLE public.persediaan
  ADD COLUMN IF NOT EXISTS stok_minimum INTEGER DEFAULT 0;

COMMENT ON COLUMN public.persediaan.stok_minimum IS
  'Ambang batas stok: barang dianggap kritis bila stok_saldo <= stok_minimum dan stok_minimum > 0.';

-- =====================================================================
-- 5. Fungsi & trigger notifikasi otomatis
--    Disalin dari migration_v4 dengan guard anti-spam dari migration_v21.
--    Tanpa ini, tabel notifications tetap kosong walau sudah dibuat.
-- =====================================================================

-- 5a. Notifikasi perubahan status utilitas.
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
      v_title := 'Permohonan perlu revisi';
      v_msg := v_pekerjaan || ' dikembalikan untuk revisi.';
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (NEW.input_by, 'revisi_diminta', v_title, v_msg, v_link);

    ELSIF NEW.status IN ('DITERIMA','DITOLAK') AND NEW.input_by IS NOT NULL THEN
      v_title := 'Permohonan ' || lower(NEW.status);
      v_msg := v_pekerjaan || ' telah ' || lower(NEW.status) || '.';
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (NEW.input_by, 'hasil_review', v_title, v_msg, v_link);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_utilitas_status ON public.utilitas;
CREATE TRIGGER trg_notify_utilitas_status
AFTER INSERT OR UPDATE ON public.utilitas
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_utilitas_status();

-- 5b. Notifikasi stok kritis (dengan guard anti-spam 24 jam dari v21).
CREATE OR REPLACE FUNCTION public.fn_notify_stok_kritis()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Lewati bila data stok belum lengkap (tidak ada saldo atau minimum = 0).
  IF NEW.stok_saldo IS NULL OR COALESCE(NEW.stok_minimum, 0) = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.stok_saldo <= NEW.stok_minimum THEN
    -- Guard anti-spam: barang yang sama tidak dinotifikasi lagi dalam 24 jam.
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'stok_kritis'
        AND title = 'Stok ' || NEW.nama_barang || ' kritis'
        AND created_at > NOW() - INTERVAL '24 hours'
    ) THEN
      RETURN NEW;
    END IF;

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

-- =====================================================================
-- 6. Muat ulang cache skema PostgREST agar kolom baru langsung dikenali
-- =====================================================================
NOTIFY pgrst, 'reload schema';
