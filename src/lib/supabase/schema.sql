-- ============================================
-- Schema: Sintegrasi (revisi v3)
-- Database: Supabase (PostgreSQL)
--
-- Perubahan v3 (berdasarkan audit):
--   1. profiles.status (Pending/Aktif/Nonaktif) + flow approval
--   2. utilitas workflow paralel dua operator (Satker + Perencanaan)
--   3. Trigger otomatis: hitung status gabungan + log transmital
--   4. RLS berbasis role & status (bukan semua authenticated)
-- ============================================

-- ------------------------------------------------------------
-- 1. PROFILES (extends auth.users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nama TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Pengusul'
    CHECK (role IN ('Admin','Bendahara','BMN','Teknis','Perencanaan','PPSPM','PPK','Operator Keuangan','Pengusul')),
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Aktif','Nonaktif')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id)
);

-- ------------------------------------------------------------
-- 2. MODUL DATA DASAR
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.keuangan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL,
  jenis_transaksi TEXT NOT NULL CHECK (jenis_transaksi IN ('Debit','Kredit')),
  kategori TEXT,
  nominal BIGINT NOT NULL DEFAULT 0,
  keterangan TEXT,
  link_nota TEXT,
  input_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.persediaan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL,
  jenis TEXT NOT NULL CHECK (jenis IN ('Masuk','Keluar')),
  nama_barang TEXT NOT NULL,
  supplier_tujuan TEXT,
  jumlah INTEGER NOT NULL DEFAULT 0,
  satuan TEXT DEFAULT 'unit',
  stok_saldo INTEGER DEFAULT 0,
  input_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bmn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_aset TEXT NOT NULL,
  nama_aset TEXT NOT NULL,
  spesifikasi TEXT,
  kondisi TEXT DEFAULT 'Baik',
  nilai_aset BIGINT DEFAULT 0,
  lokasi TEXT,
  pengguna TEXT,
  status_penggunaan TEXT DEFAULT 'Digunakan',
  link_foto TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3. UTILITAS — workflow paralel dua operator
--
--   Status ringkas:
--     DIAJUKAN      → usulan baru dari Pengusul (belum diperiksa)
--     PEMERIKSAAN   → sedang direview paralel oleh Operator 1 & 2
--     REVISI        → ada catatan dari >=1 operator, kembali ke Pengusul
--     DITERIMA      → kedua operator menyatakan OK
--     DITOLAK       → final reject (hanya Admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.utilitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tgl_usul TIMESTAMPTZ DEFAULT NOW(),
  instansi TEXT,
  lokasi TEXT,
  jenis_pekerjaan TEXT NOT NULL,
  link_ded TEXT,
  status TEXT NOT NULL DEFAULT 'DIAJUKAN'
    CHECK (status IN ('DIAJUKAN','PEMERIKSAAN','REVISI','DITOLAK','DITERIMA')),
  revisi_ke INTEGER NOT NULL DEFAULT 0,

  -- Operator 1 (unsur satuan kerja, role Teknis/Admin) -> cek administratif
  review_satker TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (review_satker IN ('PENDING','OK','CATATAN')),
  review_satker_catatan TEXT,
  review_satker_by UUID REFERENCES public.profiles(id),
  review_satker_at TIMESTAMPTZ,

  -- Operator 2 (unsur Perencanaan) -> cek desain/teknis
  review_perencanaan TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (review_perencanaan IN ('PENDING','OK','CATATAN')),
  review_perencanaan_catatan TEXT,
  review_perencanaan_by UUID REFERENCES public.profiles(id),
  review_perencanaan_at TIMESTAMPTZ,

  input_by UUID REFERENCES public.profiles(id),
  current_pic UUID REFERENCES public.profiles(id),
  sla_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transmital (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utilitas_id UUID REFERENCES public.utilitas(id) ON DELETE CASCADE,
  tahapan TEXT NOT NULL,
  pic UUID REFERENCES public.profiles(id),
  waktu_masuk TIMESTAMPTZ DEFAULT NOW(),
  waktu_selesai TIMESTAMPTZ,
  durasi_hari INTEGER,
  catatan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dokumen_dipa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revisi_ke INTEGER DEFAULT 0,
  link_dipa TEXT,
  link_rkakl TEXT,
  keterangan_revisi TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.komentar_utilitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utilitas_id UUID REFERENCES public.utilitas(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 4. FUNCTIONS & TRIGGERS
-- ------------------------------------------------------------

-- Helper: cek Admin Aktif
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'Admin' AND status = 'Aktif'
  );
$$;

-- Helper: role saat ini
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Helper: cek role aktif dalam daftar role.
CREATE OR REPLACE FUNCTION public.has_active_role(allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'Aktif'
      AND role = ANY(allowed_roles)
  );
$$;

-- Hitung status gabungan utilitas dari dua review operator
CREATE OR REPLACE FUNCTION public.compute_utilitas_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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

-- Log otomatis ke transmital saat status berubah
CREATE OR REPLACE FUNCTION public.log_utilitas_transmital()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
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

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keuangan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persediaan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bmn ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utilitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transmital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dokumen_dipa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.komentar_utilitas ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR id = auth.uid())
  WITH CHECK (public.is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated USING (public.is_admin());

-- Keuangan
DROP POLICY IF EXISTS "keuangan_select" ON public.keuangan;
CREATE POLICY "keuangan_select" ON public.keuangan
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "keuangan_write" ON public.keuangan;
CREATE POLICY "keuangan_write" ON public.keuangan
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

-- Persediaan
DROP POLICY IF EXISTS "persediaan_select" ON public.persediaan;
CREATE POLICY "persediaan_select" ON public.persediaan
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "persediaan_write" ON public.persediaan;
CREATE POLICY "persediaan_write" ON public.persediaan
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

-- BMN
DROP POLICY IF EXISTS "bmn_select" ON public.bmn;
CREATE POLICY "bmn_select" ON public.bmn
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bmn_write" ON public.bmn;
CREATE POLICY "bmn_write" ON public.bmn
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

-- Utilitas
DROP POLICY IF EXISTS "utilitas_select" ON public.utilitas;
CREATE POLICY "utilitas_select" ON public.utilitas
  FOR SELECT TO authenticated
  USING (
    public.current_role() <> 'Pengusul'
    OR input_by = auth.uid()
  );

DROP POLICY IF EXISTS "utilitas_insert" ON public.utilitas;
CREATE POLICY "utilitas_insert" ON public.utilitas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

DROP POLICY IF EXISTS "utilitas_update" ON public.utilitas;
CREATE POLICY "utilitas_update" ON public.utilitas
  FOR UPDATE TO authenticated
  USING (
    (public.current_role() = 'Pengusul' AND input_by = auth.uid())
    OR public.current_role() IN ('Admin','Teknis','Perencanaan')
  );

DROP POLICY IF EXISTS "utilitas_delete" ON public.utilitas;
CREATE POLICY "utilitas_delete" ON public.utilitas
  FOR DELETE TO authenticated
  USING (public.current_role() = 'Admin');

-- Transmital
DROP POLICY IF EXISTS "transmital_select" ON public.transmital;
CREATE POLICY "transmital_select" ON public.transmital
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.utilitas u
      WHERE u.id = utilitas_id
        AND (public.current_role() <> 'Pengusul' OR u.input_by = auth.uid())
    )
  );
DROP POLICY IF EXISTS "transmital_write" ON public.transmital;
CREATE POLICY "transmital_write" ON public.transmital
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

-- DIPA
DROP POLICY IF EXISTS "dipa_select" ON public.dokumen_dipa;
CREATE POLICY "dipa_select" ON public.dokumen_dipa
  FOR SELECT TO authenticated
  USING (public.current_role() <> 'Pengusul');

DROP POLICY IF EXISTS "dipa_write" ON public.dokumen_dipa;
CREATE POLICY "dipa_write" ON public.dokumen_dipa
  FOR ALL TO authenticated
  USING (public.current_role() = 'Admin')
  WITH CHECK (public.current_role() = 'Admin');

-- Komentar utilitas
DROP POLICY IF EXISTS "komentar_select" ON public.komentar_utilitas;
CREATE POLICY "komentar_select" ON public.komentar_utilitas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.utilitas u
      WHERE u.id = utilitas_id
        AND (public.current_role() <> 'Pengusul' OR u.input_by = auth.uid())
    )
  );
DROP POLICY IF EXISTS "komentar_write" ON public.komentar_utilitas;
CREATE POLICY "komentar_write" ON public.komentar_utilitas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

-- ------------------------------------------------------------
-- 6. POLICY HARDENING (v7)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_active_role(ARRAY['Admin']));

DROP POLICY IF EXISTS "keuangan_select" ON public.keuangan;
CREATE POLICY "keuangan_select" ON public.keuangan
  FOR SELECT TO authenticated USING (public.has_active_role(ARRAY['Admin','Bendahara']));
DROP POLICY IF EXISTS "keuangan_write" ON public.keuangan;
CREATE POLICY "keuangan_write" ON public.keuangan
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara']))
  WITH CHECK (public.has_active_role(ARRAY['Admin','Bendahara']));

DROP POLICY IF EXISTS "persediaan_select" ON public.persediaan;
CREATE POLICY "persediaan_select" ON public.persediaan
  FOR SELECT TO authenticated USING (public.has_active_role(ARRAY['Admin','Bendahara','BMN']));
DROP POLICY IF EXISTS "persediaan_write" ON public.persediaan;
CREATE POLICY "persediaan_write" ON public.persediaan
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara','BMN']))
  WITH CHECK (public.has_active_role(ARRAY['Admin','Bendahara','BMN']));

DROP POLICY IF EXISTS "bmn_select" ON public.bmn;
CREATE POLICY "bmn_select" ON public.bmn
  FOR SELECT TO authenticated USING (public.has_active_role(ARRAY['Admin','BMN']));
DROP POLICY IF EXISTS "bmn_write" ON public.bmn;
CREATE POLICY "bmn_write" ON public.bmn
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin','BMN']))
  WITH CHECK (public.has_active_role(ARRAY['Admin','BMN']));

DROP POLICY IF EXISTS "dipa_select" ON public.dokumen_dipa;
CREATE POLICY "dipa_select" ON public.dokumen_dipa
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Perencanaan','Teknis','Bendahara','BMN']));
DROP POLICY IF EXISTS "dipa_write" ON public.dokumen_dipa;
CREATE POLICY "dipa_write" ON public.dokumen_dipa
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin']))
  WITH CHECK (public.has_active_role(ARRAY['Admin']));

DROP POLICY IF EXISTS "utilitas_select" ON public.utilitas;
CREATE POLICY "utilitas_select" ON public.utilitas
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['Admin','Teknis','Perencanaan'])
    OR (public.has_active_role(ARRAY['Pengusul']) AND input_by = auth.uid())
  );

DROP POLICY IF EXISTS "utilitas_insert" ON public.utilitas;
CREATE POLICY "utilitas_insert" ON public.utilitas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_role(ARRAY['Admin','Pengusul'])
    AND input_by = auth.uid()
  );

DROP POLICY IF EXISTS "utilitas_update" ON public.utilitas;
CREATE POLICY "utilitas_update" ON public.utilitas
  FOR UPDATE TO authenticated
  USING (
    public.has_active_role(ARRAY['Admin','Teknis','Perencanaan'])
    OR (
      public.has_active_role(ARRAY['Pengusul'])
      AND input_by = auth.uid()
      AND status IN ('DIAJUKAN','REVISI')
    )
  )
  WITH CHECK (
    public.has_active_role(ARRAY['Admin','Teknis','Perencanaan'])
    OR (
      public.has_active_role(ARRAY['Pengusul'])
      AND input_by = auth.uid()
      AND status IN ('DIAJUKAN','PEMERIKSAAN','REVISI')
    )
  );

DROP POLICY IF EXISTS "utilitas_delete" ON public.utilitas;
CREATE POLICY "utilitas_delete" ON public.utilitas
  FOR DELETE TO authenticated USING (public.has_active_role(ARRAY['Admin']));
