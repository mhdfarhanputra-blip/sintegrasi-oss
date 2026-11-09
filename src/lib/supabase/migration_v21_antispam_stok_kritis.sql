-- Migration v21: Anti-spam notifikasi stok kritis persediaan.
--
-- Latar belakang:
--   Trigger trg_notify_stok_kritis (lihat migration_v4.sql) berjalan pada
--   SETIAP UPDATE kolom stok_saldo/stok_minimum. Akibatnya, selama suatu
--   barang tetap berada di bawah/sama dengan stok minimum, setiap perubahan
--   saldo akan kembali memicu pembuatan notifikasi 'stok_kritis' untuk barang
--   yang sama. Hal ini menyebabkan spam notifikasi berulang.
--
-- Solusi:
--   Menambahkan guard "anti-spam" di dalam fungsi fn_notify_stok_kritis().
--   Sebelum menyisipkan notifikasi baru, fungsi memeriksa apakah sudah ada
--   notifikasi 'stok_kritis' untuk barang yang sama dalam JENDELA 24 JAM
--   terakhir. Jika ada, notifikasi tidak dibuat ulang (RETURN NEW).
--
--   Alasan jendela 24 jam: cukup lama untuk mencegah banjir notifikasi akibat
--   beberapa kali transaksi/penyesuaian stok dalam satu hari kerja, namun cukup
--   singkat untuk tetap mengingatkan kembali apabila kondisi kritis masih
--   berlanjut keesokan harinya.
--
--   Karena tabel public.notifications tidak memiliki kolom referensi ke barang,
--   identifikasi "barang yang sama" dilakukan dengan mencocokkan kolom title
--   yang memang memuat nama barang ('Stok ' || nama_barang || ' kritis').
--
-- Sifat: idempoten — aman dijalankan berulang (CREATE OR REPLACE FUNCTION
--        dan DROP TRIGGER IF EXISTS sebelum CREATE TRIGGER).

-- Fungsi trigger versi anti-spam. Semua logika lain (kondisi stok kritis,
-- target role Admin/BMN/Bendahara aktif, link '/persediaan', dan isi pesan)
-- dipertahankan sama persis seperti migration_v4.sql.
CREATE OR REPLACE FUNCTION public.fn_notify_stok_kritis()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Lewati bila data stok belum lengkap (tidak ada saldo atau minimum = 0).
  IF NEW.stok_saldo IS NULL OR COALESCE(NEW.stok_minimum, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Hanya proses bila barang benar-benar dalam kondisi kritis.
  IF NEW.stok_saldo <= NEW.stok_minimum THEN
    -- Guard anti-spam: jika barang yang sama sudah dinotifikasi dalam 24 jam
    -- terakhir, hentikan agar tidak terjadi spam notifikasi berulang.
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'stok_kritis'
        AND title = 'Stok ' || NEW.nama_barang || ' kritis'
        AND created_at > NOW() - INTERVAL '24 hours'
    ) THEN
      RETURN NEW;  -- sudah dinotifikasi baru-baru ini, hindari spam
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT id, 'stok_kritis',
           'Stok ' || NEW.nama_barang || ' kritis',
           'Sisa ' || NEW.stok_saldo || ' ' || COALESCE(NEW.satuan,'unit') ||
             ' (minimum ' || NEW.stok_minimum || ').',
           '/persediaan'
    FROM public.profiles
    WHERE role IN ('Admin','BMN','Bendahara') AND status = 'Aktif';
  END IF;
  RETURN NEW;
END;
$$;

-- Definisi trigger tidak berubah dari v4, namun tetap disertakan untuk
-- idempotensi (drop bila ada, lalu buat ulang dengan definisi identik).
DROP TRIGGER IF EXISTS trg_notify_stok_kritis ON public.persediaan;
CREATE TRIGGER trg_notify_stok_kritis
AFTER INSERT OR UPDATE OF stok_saldo, stok_minimum ON public.persediaan
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_stok_kritis();

NOTIFY pgrst, 'reload schema';
