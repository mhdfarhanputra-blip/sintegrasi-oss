-- Migration v24: indeks untuk pekerjaan cron SLA utilitas.
--
-- Latar belakang:
--   Cron `sla-utilitas` berjalan tiap menit dan mencari baris dengan pola:
--     WHERE status = <SLA_STATUS>
--       AND sla_deadline < now()
--       AND sla_warned_at IS NULL
--   Tanpa indeks, setiap eksekusi melakukan full table scan. Saat jumlah baris
--   bertambah, biaya kueri naik linear dan cron makin lambat.
--
-- Sifat: idempoten (IF NOT EXISTS), tidak mengubah data.

CREATE INDEX IF NOT EXISTS utilitas_sla_pending_idx
  ON public.utilitas (status, sla_deadline)
  WHERE sla_warned_at IS NULL;

COMMENT ON INDEX public.utilitas_sla_pending_idx IS
  'Mempercepat cron SLA: baris berstatus tertentu yang belum diperingatkan, diurutkan menurut tenggat.';

NOTIFY pgrst, 'reload schema';
