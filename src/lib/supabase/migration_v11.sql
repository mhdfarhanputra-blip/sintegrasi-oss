-- Migration v11: klasifikasi role PPSPM, PPK, dan Operator Keuangan

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'Admin',
    'Bendahara',
    'BMN',
    'Teknis',
    'Perencanaan',
    'PPSPM',
    'PPK',
    'Operator Keuangan',
    'Pengusul'
  ));

-- Keuangan: Admin, Bendahara, PPSPM, Operator Keuangan
DROP POLICY IF EXISTS "keuangan_select" ON public.keuangan;
CREATE POLICY "keuangan_select" ON public.keuangan
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara','PPSPM','Operator Keuangan']));

DROP POLICY IF EXISTS "keuangan_write" ON public.keuangan;
CREATE POLICY "keuangan_write" ON public.keuangan
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara','PPSPM','Operator Keuangan']))
  WITH CHECK (public.has_active_role(ARRAY['Admin','Bendahara','PPSPM','Operator Keuangan']));

-- Kategori keuangan mengikuti role modul keuangan.
DROP POLICY IF EXISTS "kategori_insert_active" ON public.kategori_keuangan;
CREATE POLICY "kategori_insert_active" ON public.kategori_keuangan
  FOR INSERT TO authenticated
  WITH CHECK (public.has_active_role(ARRAY['Admin','Bendahara','PPSPM','Operator Keuangan']));

DROP POLICY IF EXISTS "kategori_manage_admin" ON public.kategori_keuangan;
CREATE POLICY "kategori_manage_admin" ON public.kategori_keuangan
  FOR UPDATE TO authenticated
  USING (public.has_active_role(ARRAY['Admin']))
  WITH CHECK (public.has_active_role(ARRAY['Admin']));

-- Utilitas: PPK dapat melihat modul, tetapi tidak menjadi operator review.
DROP POLICY IF EXISTS "utilitas_select" ON public.utilitas;
CREATE POLICY "utilitas_select" ON public.utilitas
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['Admin','Teknis','Perencanaan','PPK'])
    OR (public.has_active_role(ARRAY['Pengusul']) AND input_by = auth.uid())
  );

-- DIPA/RKA-KL: tambahan PPSPM, PPK, Operator Keuangan.
DROP POLICY IF EXISTS "dipa_select" ON public.dokumen_dipa;
CREATE POLICY "dipa_select" ON public.dokumen_dipa
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Perencanaan','Teknis','Bendahara','BMN','PPSPM','PPK','Operator Keuangan']));

DROP POLICY IF EXISTS "dipa_write" ON public.dokumen_dipa;
CREATE POLICY "dipa_write" ON public.dokumen_dipa
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin']))
  WITH CHECK (public.has_active_role(ARRAY['Admin']));

-- SK: seluruh role internal kecuali Pengusul.
DROP POLICY IF EXISTS "sk_select" ON public.dokumen_sk;
CREATE POLICY "sk_select" ON public.dokumen_sk
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara','BMN','Teknis','Perencanaan','PPSPM','PPK','Operator Keuangan']));

DROP POLICY IF EXISTS "sk_write" ON public.dokumen_sk;
CREATE POLICY "sk_write" ON public.dokumen_sk
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin']))
  WITH CHECK (public.has_active_role(ARRAY['Admin']));
