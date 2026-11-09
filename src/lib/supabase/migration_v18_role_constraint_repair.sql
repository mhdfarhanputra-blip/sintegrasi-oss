-- Migration v18: ensure all application roles are accepted by profiles.
-- Idempotent repair for installations that still carry an older role check.

DO $$
DECLARE
  invalid_roles TEXT;
BEGIN
  SELECT string_agg(DISTINCT role, ', ' ORDER BY role)
  INTO invalid_roles
  FROM public.profiles
  WHERE role IS NULL
     OR role NOT IN (
       'Admin',
       'Bendahara',
       'BMN',
       'Teknis',
       'Perencanaan',
       'PPSPM',
       'PPK',
       'Operator Keuangan',
       'Pengusul'
     );

  IF invalid_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Role profil tidak dikenal harus diperbaiki terlebih dahulu: %', invalid_roles;
  END IF;
END $$;

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

NOTIFY pgrst, 'reload schema';
