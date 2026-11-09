-- Security hardening: notification and audit creation are server-only.
-- Guard optional tables so this migration is safe on partial installations.

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "notif_insert_service" ON public.notifications';
  END IF;

  IF to_regclass('public.audit_log') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log';
  END IF;
END $$;
