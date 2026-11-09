-- Migration v20: Otomasi SLA (Service Level Agreement) untuk modul Utilitas.
--
-- Tujuan:
--   Saat sebuah permohonan utilitas masuk ke tahap 'PEMERIKSAAN', sistem
--   otomatis menetapkan batas waktu pemeriksaan (sla_deadline) selama 2 hari
--   sejak status berubah. Kolom sla_warned_at di-reset (NULL) agar peringatan
--   SLA dapat dikirim ulang oleh proses cron bila batas waktu terlampaui.
--
--   Saat status keluar dari 'PEMERIKSAAN' (mis. DITERIMA/DITOLAK/REVISI),
--   nilai sla_deadline sengaja dibiarkan apa adanya sebagai jejak riwayat.
--
-- Sifat: idempoten — aman dijalankan berulang (CREATE OR REPLACE FUNCTION
--        dan DROP TRIGGER IF EXISTS sebelum CREATE TRIGGER).

-- Fungsi trigger: menetapkan sla_deadline ketika status menjadi 'PEMERIKSAAN'.
CREATE OR REPLACE FUNCTION public.fn_set_sla_deadline()
RETURNS TRIGGER AS $$
BEGIN
  -- Saat baris baru langsung berstatus PEMERIKSAAN, isi deadline bila kosong.
  IF (TG_OP = 'INSERT') THEN
    IF (NEW.status = 'PEMERIKSAAN' AND NEW.sla_deadline IS NULL) THEN
      NEW.sla_deadline := NOW() + INTERVAL '2 days';
      NEW.sla_warned_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Saat UPDATE: status berubah MENJADI 'PEMERIKSAAN' (dari status lain),
  -- atau masih PEMERIKSAAN namun deadline belum pernah diisi.
  IF (NEW.status = 'PEMERIKSAAN'
      AND (NEW.sla_deadline IS NULL OR OLD.status IS DISTINCT FROM 'PEMERIKSAAN')) THEN
    NEW.sla_deadline := NOW() + INTERVAL '2 days';
    NEW.sla_warned_at := NULL;
  END IF;

  -- Saat status keluar dari PEMERIKSAAN (DITERIMA/DITOLAK/REVISI),
  -- sla_deadline sengaja dibiarkan apa adanya sebagai jejak riwayat.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pasang trigger BEFORE INSERT dan BEFORE UPDATE OF status pada tabel utilitas.
DROP TRIGGER IF EXISTS trg_set_sla_deadline ON public.utilitas;
CREATE TRIGGER trg_set_sla_deadline
  BEFORE INSERT OR UPDATE OF status ON public.utilitas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_sla_deadline();

NOTIFY pgrst, 'reload schema';
