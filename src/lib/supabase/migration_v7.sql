-- ============================================
-- Migration v7: Master Data untuk Konsistensi Input
-- ============================================

-- 1. MASTER BARANG (untuk Persediaan) ---------------------------------
CREATE TABLE IF NOT EXISTS public.master_barang (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT UNIQUE NOT NULL,
  satuan TEXT NOT NULL DEFAULT 'unit',
  kategori TEXT,
  aktif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS master_barang_nama_idx ON public.master_barang (lower(nama));

ALTER TABLE public.master_barang ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "master_barang_select" ON public.master_barang;
CREATE POLICY "master_barang_select" ON public.master_barang
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "master_barang_write" ON public.master_barang;
CREATE POLICY "master_barang_write" ON public.master_barang
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

INSERT INTO public.master_barang (nama, satuan, kategori) VALUES
  ('Kertas A4 80gsm', 'rim', 'ATK'),
  ('Tinta Printer Hitam', 'botol', 'ATK'),
  ('Tinta Printer Warna', 'botol', 'ATK'),
  ('Pulpen', 'pcs', 'ATK'),
  ('Pensil', 'pcs', 'ATK'),
  ('Map Plastik', 'pcs', 'ATK'),
  ('Stapler', 'pcs', 'ATK'),
  ('Isi Stapler', 'box', 'ATK'),
  ('Gunting', 'pcs', 'ATK'),
  ('Lakban', 'pcs', 'ATK'),
  ('Kabel UTP', 'meter', 'Jaringan'),
  ('Kabel HDMI', 'pcs', 'Jaringan'),
  ('Mouse', 'pcs', 'Komputer'),
  ('Keyboard', 'pcs', 'Komputer'),
  ('Hardisk Eksternal', 'pcs', 'Komputer'),
  ('Flashdisk', 'pcs', 'Komputer'),
  ('Air Mineral Galon', 'galon', 'Konsumsi'),
  ('Kopi Sachet', 'box', 'Konsumsi'),
  ('Gula Pasir', 'kg', 'Konsumsi'),
  ('BBM Pertalite', 'liter', 'BBM')
ON CONFLICT (nama) DO NOTHING;

-- 2. MASTER KATEGORI BMN ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_kategori_bmn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT UNIQUE NOT NULL,
  kode_prefix TEXT,
  aktif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.master_kategori_bmn ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "master_kategori_bmn_select" ON public.master_kategori_bmn;
CREATE POLICY "master_kategori_bmn_select" ON public.master_kategori_bmn
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "master_kategori_bmn_write" ON public.master_kategori_bmn;
CREATE POLICY "master_kategori_bmn_write" ON public.master_kategori_bmn
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Aktif'));

INSERT INTO public.master_kategori_bmn (nama, kode_prefix) VALUES
  ('Tanah', '1.01'),
  ('Peralatan dan Mesin', '3.05'),
  ('Gedung dan Bangunan', '4.01'),
  ('Jalan, Jaringan dan Irigasi', '5.01'),
  ('Aset Tetap Lainnya', '6.01'),
  ('Komputer', '3.10'),
  ('Kendaraan Roda 2', '3.05.01'),
  ('Kendaraan Roda 4', '3.05.02'),
  ('Furniture Kantor', '3.06')
ON CONFLICT (nama) DO NOTHING;

-- 3. PERSEDIAAN.LINK_DOKUMENTASI (jika belum ada) ---------------------
ALTER TABLE public.persediaan ADD COLUMN IF NOT EXISTS link_dokumentasi TEXT;
