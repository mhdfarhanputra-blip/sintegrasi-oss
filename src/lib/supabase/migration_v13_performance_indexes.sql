-- Migration v13: safe performance indexes for frequent application queries.
-- All indexes are idempotent and do not change data, RLS, or table contracts.

CREATE INDEX IF NOT EXISTS idx_profiles_status_created_at
  ON public.profiles(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_role_status
  ON public.profiles(role, status);

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON public.notifications(user_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_keuangan_tanggal_desc
  ON public.keuangan(tanggal DESC);

CREATE INDEX IF NOT EXISTS idx_keuangan_created_at_desc
  ON public.keuangan(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_keuangan_tahun_tanggal
  ON public.keuangan(tahun_anggaran, tanggal DESC);

CREATE INDEX IF NOT EXISTS idx_persediaan_tanggal_desc
  ON public.persediaan(tanggal DESC);

CREATE INDEX IF NOT EXISTS idx_persediaan_tahun_tanggal
  ON public.persediaan(tahun_anggaran, tanggal DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'persediaan'
      AND column_name = 'stok_minimum'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_persediaan_stok_minimum_active ON public.persediaan(stok_minimum, stok_saldo) WHERE stok_minimum IS NOT NULL AND stok_minimum > 0';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bmn_updated_at_desc
  ON public.bmn(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bmn_tahun_pencatatan_kode
  ON public.bmn(tahun_pencatatan, kode_aset);

CREATE INDEX IF NOT EXISTS idx_bmn_kondisi
  ON public.bmn(kondisi);

CREATE INDEX IF NOT EXISTS idx_utilitas_created_at_desc
  ON public.utilitas(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_utilitas_status_created_at
  ON public.utilitas(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_utilitas_input_status
  ON public.utilitas(input_by, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_utilitas_tahun_status
  ON public.utilitas(tahun_anggaran, status);

CREATE INDEX IF NOT EXISTS idx_transmital_utilitas_waktu
  ON public.transmital(utilitas_id, waktu_masuk ASC);

CREATE INDEX IF NOT EXISTS idx_dokumen_dipa_revisi_desc
  ON public.dokumen_dipa(revisi_ke DESC);

CREATE INDEX IF NOT EXISTS idx_dokumen_dipa_tahun_revisi
  ON public.dokumen_dipa(tahun_anggaran, revisi_ke DESC);

DO $$
BEGIN
  IF to_regclass('public.dokumen_sk') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dokumen_sk_sort ON public.dokumen_sk(tahun_berlaku DESC, kategori ASC, created_at DESC)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_desc
  ON public.audit_log(created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.master_barang') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_master_barang_active_name ON public.master_barang(aktif, nama)';
  END IF;

  IF to_regclass('public.kategori_keuangan') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_kategori_keuangan_active_order ON public.kategori_keuangan(aktif, urutan)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
