-- Migration v14: Jadwal Rapat & Kegiatan with Google Forms/Sheets/Calendar references.
-- Idempotent and safe to run on production.

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'Pengusul');
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

CREATE TABLE IF NOT EXISTS public.jadwal_kegiatan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judul TEXT NOT NULL,
  jenis TEXT NOT NULL DEFAULT 'Kegiatan'
    CHECK (jenis IN ('Rapat','Kegiatan','Undangan','Batas Waktu')),
  mulai TIMESTAMPTZ NOT NULL,
  selesai TIMESTAMPTZ NOT NULL,
  lokasi TEXT,
  penyelenggara TEXT,
  peserta TEXT,
  deskripsi TEXT,
  link_form TEXT,
  google_calendar_event_id TEXT,
  google_calendar_link TEXT,
  google_sheet_synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Terjadwal'
    CHECK (status IN ('Terjadwal','Selesai','Batal')),
  dibuat_oleh UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (selesai > mulai)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_mulai
  ON public.jadwal_kegiatan(mulai ASC);

CREATE INDEX IF NOT EXISTS idx_jadwal_status_mulai
  ON public.jadwal_kegiatan(status, mulai ASC);

CREATE INDEX IF NOT EXISTS idx_jadwal_jenis_mulai
  ON public.jadwal_kegiatan(jenis, mulai ASC);

ALTER TABLE public.jadwal_kegiatan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jadwal_select" ON public.jadwal_kegiatan;
CREATE POLICY "jadwal_select" ON public.jadwal_kegiatan
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara','BMN','Teknis','Perencanaan','PPSPM','PPK','Operator Keuangan']));

DROP POLICY IF EXISTS "jadwal_write" ON public.jadwal_kegiatan;
CREATE POLICY "jadwal_write" ON public.jadwal_kegiatan
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['Admin','Bendahara','BMN','Teknis','Perencanaan','PPSPM','PPK','Operator Keuangan']))
  WITH CHECK (public.has_active_role(ARRAY['Admin','Bendahara','BMN','Teknis','Perencanaan','PPSPM','PPK','Operator Keuangan']));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jadwal_kegiatan_updated_at ON public.jadwal_kegiatan;
CREATE TRIGGER trg_jadwal_kegiatan_updated_at
BEFORE UPDATE ON public.jadwal_kegiatan
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
