-- Migration v8: Relax kategori_keuangan write policy
-- Allow any active authenticated user to insert new categories (not just admin)
-- This enables the Combobox auto-create feature in Keuangan module.

-- Drop the admin-only write policy
DROP POLICY IF EXISTS "kategori_write_admin" ON public.kategori_keuangan;

-- Create a new policy: any active user can insert
CREATE POLICY "kategori_insert_active" ON public.kategori_keuangan
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif')
  );

-- Admin can still update/delete
CREATE POLICY "kategori_manage_admin" ON public.kategori_keuangan
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Ensure the table and seed data exist (idempotent)
CREATE TABLE IF NOT EXISTS public.kategori_keuangan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL UNIQUE,
  jenis_default TEXT CHECK (jenis_default IN ('Debit','Kredit','Keduanya')) DEFAULT 'Keduanya',
  urutan INTEGER DEFAULT 0,
  aktif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.kategori_keuangan ENABLE ROW LEVEL SECURITY;

-- Re-ensure select policy exists
DROP POLICY IF EXISTS "kategori_select" ON public.kategori_keuangan;
CREATE POLICY "kategori_select" ON public.kategori_keuangan
  FOR SELECT TO authenticated USING (true);

-- Seed default categories (skip if already exist)
INSERT INTO public.kategori_keuangan (nama, jenis_default, urutan) VALUES
  ('BBM & Transportasi','Kredit',10),
  ('ATK & Bahan Habis','Kredit',20),
  ('Konsumsi Rapat','Kredit',30),
  ('Perjalanan Dinas','Kredit',40),
  ('Penerimaan Anggaran','Debit',50),
  ('Pengembalian Belanja','Debit',60),
  ('Lain-lain','Keduanya',100)
ON CONFLICT (nama) DO NOTHING;
