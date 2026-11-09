-- Migration v16: repair jadwal_kegiatan installations created with an older schema.
-- Idempotent and safe to run after migration_v14_jadwal_kegiatan.sql.

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
  jenis TEXT NOT NULL DEFAULT 'Kegiatan',
  mulai TIMESTAMPTZ,
  selesai TIMESTAMPTZ,
  lokasi TEXT,
  penyelenggara TEXT,
  peserta TEXT,
  deskripsi TEXT,
  link_form TEXT,
  google_calendar_event_id TEXT,
  google_calendar_link TEXT,
  google_sheet_synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Terjadwal',
  dibuat_oleh UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jadwal_kegiatan
  ADD COLUMN IF NOT EXISTS judul TEXT,
  ADD COLUMN IF NOT EXISTS jenis TEXT DEFAULT 'Kegiatan',
  ADD COLUMN IF NOT EXISTS mulai TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS selesai TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lokasi TEXT,
  ADD COLUMN IF NOT EXISTS penyelenggara TEXT,
  ADD COLUMN IF NOT EXISTS peserta TEXT,
  ADD COLUMN IF NOT EXISTS deskripsi TEXT,
  ADD COLUMN IF NOT EXISTS link_form TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_link TEXT,
  ADD COLUMN IF NOT EXISTS google_sheet_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Terjadwal',
  ADD COLUMN IF NOT EXISTS dibuat_oleh UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jadwal_kegiatan' AND column_name = 'tanggal_mulai'
  ) THEN
    EXECUTE 'UPDATE public.jadwal_kegiatan SET mulai = COALESCE(mulai, tanggal_mulai::timestamptz)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jadwal_kegiatan' AND column_name = 'tanggal_selesai'
  ) THEN
    EXECUTE 'UPDATE public.jadwal_kegiatan SET selesai = COALESCE(selesai, tanggal_selesai::timestamptz)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jadwal_kegiatan' AND column_name = 'tanggal'
  ) THEN
    EXECUTE 'UPDATE public.jadwal_kegiatan SET mulai = COALESCE(mulai, tanggal::timestamptz)';
  END IF;
END $$;

UPDATE public.jadwal_kegiatan
SET
  judul = COALESCE(NULLIF(judul, ''), 'Agenda tanpa judul'),
  mulai = COALESCE(mulai, created_at, NOW()),
  selesai = CASE
    WHEN selesai IS NULL THEN COALESCE(mulai, created_at, NOW()) + INTERVAL '1 hour'
    ELSE selesai
  END,
  jenis = COALESCE(NULLIF(jenis, ''), 'Kegiatan'),
  status = COALESCE(NULLIF(status, ''), 'Terjadwal'),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE judul IS NULL
   OR mulai IS NULL
   OR selesai IS NULL
   OR jenis IS NULL
   OR status IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

UPDATE public.jadwal_kegiatan
SET selesai = mulai + INTERVAL '1 hour'
WHERE selesai <= mulai;

ALTER TABLE public.jadwal_kegiatan
  ALTER COLUMN judul SET NOT NULL,
  ALTER COLUMN jenis SET DEFAULT 'Kegiatan',
  ALTER COLUMN jenis SET NOT NULL,
  ALTER COLUMN mulai SET NOT NULL,
  ALTER COLUMN selesai SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'Terjadwal',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.jadwal_kegiatan
  DROP CONSTRAINT IF EXISTS jadwal_kegiatan_jenis_check,
  DROP CONSTRAINT IF EXISTS jadwal_kegiatan_status_check,
  DROP CONSTRAINT IF EXISTS jadwal_kegiatan_waktu_check;

ALTER TABLE public.jadwal_kegiatan
  ADD CONSTRAINT jadwal_kegiatan_jenis_check
    CHECK (jenis IN ('Rapat', 'Kegiatan', 'Undangan', 'Batas Waktu')),
  ADD CONSTRAINT jadwal_kegiatan_status_check
    CHECK (status IN ('Terjadwal', 'Selesai', 'Batal')),
  ADD CONSTRAINT jadwal_kegiatan_waktu_check
    CHECK (selesai > mulai);

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
  USING (public.has_active_role(ARRAY[
    'Admin', 'Bendahara', 'BMN', 'Teknis', 'Perencanaan',
    'PPSPM', 'PPK', 'Operator Keuangan'
  ]));

DROP POLICY IF EXISTS "jadwal_write" ON public.jadwal_kegiatan;
CREATE POLICY "jadwal_write" ON public.jadwal_kegiatan
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY[
    'Admin', 'Bendahara', 'BMN', 'Teknis', 'Perencanaan',
    'PPSPM', 'PPK', 'Operator Keuangan'
  ]))
  WITH CHECK (public.has_active_role(ARRAY[
    'Admin', 'Bendahara', 'BMN', 'Teknis', 'Perencanaan',
    'PPSPM', 'PPK', 'Operator Keuangan'
  ]));

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
