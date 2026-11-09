/**
 * basisPengetahuan.ts — Jawaban template untuk panel Asisten (tanpa AI).
 *
 * MASALAH YANG DISELESAIKAN
 *   Panel "Asisten AI" sebelumnya mengirim pertanyaan pengguna ke DeepSeek.
 *   Bila kunci API mati/kuota habis, panel hanya menampilkan "Layanan AI
 *   sedang tidak tersedia" — padahal mayoritas pertanyaan pengguna bersifat
 *   berulang dan jawabannya sudah pasti: "di mana menu X?", "bagaimana alur
 *   verifikasi?", "kenapa data saya tidak masuk laporan?".
 *
 *   Karena itu asisten kini memakai basis pengetahuan lokal:
 *     - tidak butuh internet, kunci API, maupun biaya;
 *     - jawaban SELALU sama untuk pertanyaan yang sama (dapat diuji);
 *     - isinya diambil dari perilaku aplikasi yang sebenarnya, bukan karangan.
 *
 * CARA KERJA
 *   1. Pertanyaan dinormalkan (huruf kecil, tanda baca dibuang).
 *   2. Setiap entri punya daftar kata kunci beserta bobot.
 *   3. Entri dengan skor tertinggi menang; skor 0 -> jawaban "tidak mengerti"
 *      yang menawarkan topik yang tersedia.
 */

/** Satu topik pengetahuan. */
export type TopikPengetahuan = {
  /** Kunci stabil untuk pengujian dan analitik. */
  id: string
  /** Judul singkat yang ditampilkan sebagai saran topik. */
  judul: string
  /** Kata kunci pemicu beserta bobotnya (kata kunci lebih khas = bobot besar). */
  kataKunci: Array<{ kata: string; bobot: number }>
  /** Jawaban siap tampil (teks biasa, boleh multi-baris). */
  jawaban: string
}

/**
 * Normalisasi teks pertanyaan.
 *
 * - huruf kecil, buang tanda baca
 * - rapikan spasi
 *
 * Sengaja TIDAK memakai stemming penuh: cukup agar "keuangannya", "KEUANGAN",
 * dan "keuangan?" dianggap sama.
 */
export function normalisasiTeks(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Mengubah kata ke bentuk dasar sederhana untuk meningkatkan kecocokan.
 *
 * Pendekatan dibuat KONSERVATIF dan sengaja hanya membuang imbuhan yang aman:
 *   - awalan me-/meng-/meny-/mem-/men-/ber-/di-
 *   - akhiran -nya
 *
 * Banyak imbuhan lain SENGAJA tidak dibuang karena justru merusak kata dasar
 * bahasa Indonesia. Contoh kegagalan yang sudah terjadi saat pengembangan:
 *     'keuangan'    --buang ke- + -an-->  'uang'     (salah)
 *     'persediaan'  --buang per- + -an--> 'sedia'    (salah)
 *     'kegiatannya' --buang -annya----->  'kegiat'   (salah)
 * Karena itu daftar awalan tidak memuat pe-/per-/ke-/se-/ter-, dan akhiran
 * hanya '-nya'.
 *
 * Untuk menutup sisa ketidakcocokan (mis. 'mengirim' vs 'kirim'), pencocokan
 * di skorTopik() juga memeriksa arah sebaliknya: apakah kata kunci DIAWALI
 * oleh kata pertanyaan, atau sebaliknya — lihat cocokKata().
 */
export function kataDasar(kata: string): string {
  let k = kata
  // Awalan terpanjang lebih dulu agar 'meng' tidak kalah oleh 'me'.
  for (const a of ['meng', 'meny', 'mem', 'men', 'me', 'ber', 'di']) {
    if (k.length >= a.length + 5 && k.startsWith(a)) {
      k = k.slice(a.length)
      break
    }
  }
  if (k.length >= 6 && k.endsWith('nya')) k = k.slice(0, -3)
  return k
}

/**
 * Apakah dua kata dianggap sama untuk keperluan pencocokan.
 *
 * Selain kesamaan persis, diterima pula bila salah satu merupakan AWALAN dari
 * yang lain dengan panjang minimal 5 huruf. Ini menutup kasus luluh bunyi yang
 * sulit ditangani aturan stemming sederhana (kirim/kirim, unggah/mengunggah)
 * tanpa membuat kata pendek seperti 'sk' atau 'bmn' cocok ke segala hal.
 */
export function cocokKata(kataPertanyaan: string, kataKunci: string): boolean {
  const a = kataDasar(kataPertanyaan)
  const b = kataDasar(kataKunci)
  if (a === b) return true
  const min = 5
  if (a.length >= min && b.length >= min) {
    return a.startsWith(b) || b.startsWith(a)
  }
  return false
}

/**
 * Skor kecocokan sebuah topik terhadap pertanyaan.
 *
 * Kata kunci dihitung cocok bila muncul sebagai kata utuh (bukan bagian kata
 * lain), sehingga "bmn" tidak cocok dengan "abmnx". Bentuk dasar juga diuji
 * agar "mengunggah" tetap mengenai kata kunci "unggah".
 */
export function skorTopik(pertanyaan: string, topik: TopikPengetahuan): number {
  const teks = normalisasiTeks(pertanyaan)
  if (!teks) return 0
  const kataPertanyaan = teks.split(' ').filter(Boolean)

  let skor = 0
  for (const { kata, bobot } of topik.kataKunci) {
    const kunci = normalisasiTeks(kata)
    const cocok = kunci.includes(' ')
      ? // Frasa dicocokkan pada teks utuh.
        teks.includes(kunci)
      : kataPertanyaan.some((k) => cocokKata(k, kunci))
    if (cocok) skor += bobot
  }
  return skor
}

export const TOPIK: TopikPengetahuan[] = [
  {
    id: 'pengenalan',
    judul: 'Apa itu SINTEGRASI?',
    kataKunci: [
      { kata: 'aplikasi', bobot: 2 },
      { kata: 'sintegrasi', bobot: 4 },
      { kata: 'apa itu', bobot: 3 },
      { kata: 'fungsi', bobot: 2 },
      { kata: 'kegunaan', bobot: 2 },
    ],
    jawaban:
      'SINTEGRASI (Sistem Informasi Terintegrasi) adalah aplikasi operasional satuan kerja.\n\n' +
      'Isinya: keuangan, persediaan, BMN, utilitas, jadwal rapat, DIPA & RKA-KL, surat keputusan, ' +
      'analisa anggaran, data I-EMON, dan paket SIPP — ditambah administrasi (pengguna, audit, verifikasi).\n\n' +
      'Tujuan utamanya: satu tempat untuk mencatat, memverifikasi, dan melaporkan kegiatan satker.',
  },
  {
    id: 'menu',
    judul: 'Daftar menu & fungsinya',
    kataKunci: [
      // Bobot "menu" sengaja lebih rendah daripada nama modul mana pun.
      // Pertanyaan seperti "menu keuangan" harus dijawab penjelasan KEUANGAN,
      // bukan daftar seluruh menu — yang dicari pengguna adalah modulnya.
      { kata: 'menu', bobot: 3 },
      { kata: 'daftar menu', bobot: 8 },
      { kata: 'menu apa saja', bobot: 8 },
      { kata: 'fitur', bobot: 3 },
      { kata: 'navigasi', bobot: 3 },
      { kata: 'sidebar', bobot: 5 },
    ],
    jawaban:
      'Menu dikelompokkan menjadi 4 bagian:\n\n' +
      '01 · UTAMA\n' +
      '  • Dashboard — ringkasan operasional (serapan, aset, status).\n\n' +
      '02 · OPERASIONAL\n' +
      '  • Keuangan — kas & transaksi.\n' +
      '  • Persediaan — stok & inventaris.\n' +
      '  • BMN — Barang Milik Negara.\n' +
      '  • Utilitas — perizinan jalan (pengajuan & pemeriksaan).\n' +
      '  • Jadwal Rapat — agenda & kegiatan.\n\n' +
      '03 · PERENCANAAN\n' +
      '  • DIPA & RKA-KL — dokumen anggaran.\n' +
      '  • Surat Keputusan — arsip SK.\n' +
      '  • Analisa Anggaran — kronologi revisi.\n' +
      '  • I-EMON — serapan & deviasi.\n' +
      '  • Paket SIPP — kontraktual & rekanan.\n\n' +
      '04 · ADMINISTRASI (khusus Admin)\n' +
      '  • Verifikasi — antrean persetujuan data.\n' +
      '  • Pengguna — akun & hak akses.\n' +
      '  • CMS & Upload — pengaturan situs & data.\n' +
      '  • Audit Log — jejak aktivitas.\n' +
      '  • Command Center — status semua cron.',
  },
  {
    id: 'dashboard',
    judul: 'Dashboard',
    kataKunci: [
      { kata: 'dashboard', bobot: 5 },
      { kata: 'beranda', bobot: 4 },
      { kata: 'halaman utama', bobot: 4 },
    ],
    jawaban:
      'Dashboard menampilkan ringkasan: pagu vs realisasi, arus kas bulanan, kondisi BMN, ' +
      'status utilitas, stok kritis, dan aktivitas terbaru.\n\n' +
      'Kartu ringkasan dapat diklik untuk menuju modul terkait. Angka di sini mengikuti data ' +
      'yang sudah dicatat pada masing-masing modul.',
  },
  {
    id: 'keuangan',
    judul: 'Modul Keuangan',
    kataKunci: [
      { kata: 'keuangan', bobot: 5 },
      { kata: 'transaksi', bobot: 3 },
      { kata: 'kas', bobot: 3 },
      { kata: 'debit', bobot: 2 },
      { kata: 'kredit', bobot: 2 },
      { kata: 'kuitansi', bobot: 3 },
      { kata: 'nota', bobot: 2 },
    ],
    jawaban:
      'Modul Keuangan mencatat transaksi Debit dan Kredit.\n\n' +
      'Yang perlu diisi: tanggal, jenis transaksi, kategori, nominal, keterangan, dan tautan nota.\n\n' +
      'Catatan penting:\n' +
      '  • Transaksi Kredit WAJIB menyertakan tautan kuitansi.\n' +
      '  • Nominal harus lebih dari 0.\n' +
      '  • Transaksi bernilai besar (≥ Rp 50 juta) otomatis memberi notifikasi ke Admin & Bendahara.\n\n' +
      'Transaksi baru berstatus Draf — harus dikirim untuk diverifikasi Admin sebelum masuk laporan.',
  },
  {
    id: 'persediaan',
    judul: 'Modul Persediaan',
    kataKunci: [
      { kata: 'persediaan', bobot: 5 },
      { kata: 'stok', bobot: 4 },
      { kata: 'barang', bobot: 2 },
      { kata: 'inventaris', bobot: 3 },
      { kata: 'masuk', bobot: 2 },
      { kata: 'keluar', bobot: 2 },
    ],
    jawaban:
      'Modul Persediaan mencatat mutasi stok: transaksi Masuk dan Keluar.\n\n' +
      'Setiap transaksi menyimpan saldo stok. Sistem menolak transaksi Keluar bila stok tidak mencukupi.\n\n' +
      'Stok kritis: isi kolom "stok minimum" pada barang. Bila saldo ≤ stok minimum, barang muncul ' +
      'di peringatan stok kritis pada Dashboard dan modul ini.\n\n' +
      'Catatan: saldo terkini diambil dari transaksi dengan TANGGAL terakhir, bukan dari input terakhir — ' +
      'jadi transaksi bertanggal mundur tidak merusak saldo.',
  },
  {
    id: 'bmn',
    judul: 'Modul BMN',
    kataKunci: [
      { kata: 'bmn', bobot: 5 },
      { kata: 'barang milik negara', bobot: 5 },
      { kata: 'aset', bobot: 4 },
      { kata: 'kode aset', bobot: 3 },
      { kata: 'kondisi', bobot: 2 },
      { kata: 'pemeriksaan', bobot: 2 },
      { kata: 'foto', bobot: 2 },
    ],
    jawaban:
      'Modul BMN mengelola Barang Milik Negara.\n\n' +
      'Fitur utama:\n' +
      '  • Import daftar aset dari PDF/Excel (template tersedia di dalam modul).\n' +
      '  • Pemeriksaan aset per semester: catat kondisi baru (Baik / Rusak Ringan / Rusak Berat) dan foto.\n' +
      '  • Riwayat pemeriksaan tersimpan, sehingga perubahan kondisi dapat ditelusuri.\n' +
      '  • Tampilan tabel maupun grid.\n\n' +
      'Nilai aset dijumlahkan otomatis untuk laporan.',
  },
  {
    id: 'utilitas',
    judul: 'Alur Utilitas',
    kataKunci: [
      { kata: 'utilitas', bobot: 5 },
      { kata: 'perizinan', bobot: 4 },
      { kata: 'pengajuan', bobot: 3 },
      { kata: 'sla', bobot: 4 },
      { kata: 'revisi', bobot: 3 },
      { kata: 'review', bobot: 3 },
    ],
    jawaban:
      'Alur Utilitas (perizinan jalan) memiliki 5 status:\n\n' +
      '  1. DIAJUKAN — pengusul mengirim permohonan; Teknis & Admin mendapat notifikasi.\n' +
      '  2. PEMERIKSAAN — pemeriksaan paralel oleh Satker dan Perencanaan. SLA 2 hari.\n' +
      '  3. REVISI — dikembalikan ke pengusul untuk diperbaiki.\n' +
      '  4. DITERIMA — permohonan disetujui.\n' +
      '  5. DITOLAK — permohonan tidak disetujui.\n\n' +
      'Bila melewati SLA, sistem otomatis mengirim peringatan (satu ringkasan per hari, tidak berulang).\n\n' +
      'Setiap permohonan punya tautan tracking publik yang bisa dibagikan ke pemohon tanpa perlu login.',
  },
  {
    id: 'verifikasi',
    judul: 'Verifikasi & status data',
    kataKunci: [
      { kata: 'verifikasi', bobot: 5 },
      { kata: 'draf', bobot: 4 },
      { kata: 'draft', bobot: 4 },
      { kata: 'menunggu', bobot: 3 },
      { kata: 'disetujui', bobot: 4 },
      { kata: 'ditolak', bobot: 4 },
      { kata: 'tidak masuk laporan', bobot: 5 },
      { kata: 'tidak muncul', bobot: 4 },
      { kata: 'laporan kosong', bobot: 5 },
    ],
    jawaban:
      'Data pada modul Keuangan, Persediaan, dan BMN melewati verifikasi Admin dengan 4 status:\n\n' +
      '  • DRAF — masih diisi operator, BELUM muncul di laporan.\n' +
      '  • MENUNGGU — sudah dikirim, menunggu diperiksa Admin. Data terkunci.\n' +
      '  • DISETUJUI — sudah diverifikasi, muncul di laporan dan ekspor.\n' +
      '  • DITOLAK — perlu diperbaiki; Admin wajib menulis alasan (minimal 10 karakter).\n\n' +
      'JIKA DATA ANDA TIDAK MUNCUL DI LAPORAN: hampir selalu karena statusnya masih Draf atau Ditolak. ' +
      'Buka modulnya, tekan "Kirim" untuk mengajukan verifikasi, lalu tunggu Admin menyetujui.',
  },
  {
    id: 'laporan',
    judul: 'Laporan & ekspor',
    kataKunci: [
      { kata: 'laporan', bobot: 4 },
      { kata: 'cetak', bobot: 3 },
      { kata: 'ekspor', bobot: 4 },
      { kata: 'export', bobot: 4 },
      { kata: 'excel', bobot: 3 },
      { kata: 'csv', bobot: 3 },
      { kata: 'pdf', bobot: 3 },
      { kata: 'unduh', bobot: 3 },
    ],
    jawaban:
      'Hampir setiap modul punya tombol ekspor: CSV, Excel (.xlsx), dan cetak laporan (HTML/PDF). ' +
      'Beberapa modul (I-EMON, SIPP) punya ekspor khusus sesuai bentuk datanya.\n\n' +
      'PENTING: laporan dan ekspor hanya memuat data berstatus DISETUJUI. ' +
      'Data Draf/Ditolak sengaja tidak ikut agar dokumen resmi tidak memuat angka yang belum sah.\n\n' +
      'Bila hasil ekspor kosong, periksa dulu status verifikasi data Anda.',
  },
  {
    id: 'dipa',
    judul: 'DIPA & RKA-KL',
    kataKunci: [
      { kata: 'dipa', bobot: 5 },
      { kata: 'rka', bobot: 4 },
      { kata: 'rkakl', bobot: 5 },
      { kata: 'pagu', bobot: 4 },
      { kata: 'revisi', bobot: 2 },
      { kata: 'anggaran', bobot: 2 },
    ],
    jawaban:
      'Modul DIPA & RKA-KL menyimpan dokumen anggaran beserta revisinya.\n\n' +
      'Yang dicatat: revisi ke-berapa, tanggal revisi, tahun anggaran, tautan dokumen DIPA dan RKA-KL, ' +
      'serta keterangan revisi. Minimal satu tautan dokumen wajib diisi.\n\n' +
      'Setiap unggahan dokumen baru otomatis memberi notifikasi ke Admin, Bendahara, dan Perencanaan.\n\n' +
      'Catatan: pengelolaan dokumen ini khusus Admin.',
  },
  {
    id: 'sk',
    judul: 'Surat Keputusan',
    kataKunci: [
      { kata: 'sk', bobot: 5 },
      { kata: 'surat keputusan', bobot: 5 },
      { kata: 'nomor sk', bobot: 4 },
      { kata: 'arsip sk', bobot: 4 },
    ],
    jawaban:
      'Modul Surat Keputusan menyimpan arsip SK.\n\n' +
      'Isian: nomor SK, judul, kategori, unit pemilik, tahun berlaku, tanggal terbit, versi, ' +
      'tautan dokumen, dan keterangan.\n\n' +
      'Judul dan tautan dokumen wajib diisi. Tautan harus berupa alamat http/https yang sah.\n\n' +
      'Pengelolaan SK khusus Admin.',
  },
  {
    id: 'iemon',
    judul: 'I-EMON',
    kataKunci: [
      { kata: 'iemon', bobot: 5 },
      { kata: 'i-emon', bobot: 5 },
      { kata: 'serapan', bobot: 4 },
      { kata: 'deviasi', bobot: 4 },
      { kata: 'progres', bobot: 3 },
      { kata: 'kurva s', bobot: 5 },
    ],
    jawaban:
      'I-EMON menampilkan serapan anggaran dan deviasi progres pekerjaan.\n\n' +
      'Data masuk otomatis beberapa kali sehari dari proses pengambilan data (scraping) di server, ' +
      'lalu diteruskan ke aplikasi. Karena itu ada keterangan kapan terakhir diperbarui.\n\n' +
      'Fitur: filter status, pengurutan tabel, grafik kurva-S realisasi, dan ekspor CSV.\n\n' +
      'Bila angka terasa tidak berubah, periksa waktu pembaruan terakhir di bagian atas halaman.',
  },
  {
    id: 'sipp',
    judul: 'Paket SIPP',
    kataKunci: [
      { kata: 'sipp', bobot: 5 },
      { kata: 'kontrak', bobot: 3 },
      { kata: 'kontraktual', bobot: 4 },
      { kata: 'rekanan', bobot: 4 },
      { kata: 'pho', bobot: 4 },
      { kata: 'paket', bobot: 3 },
    ],
    jawaban:
      'Modul Paket SIPP menampilkan paket kontraktual: nama paket, rekanan, nilai kontrak, ' +
      'progres fisik, dan status.\n\n' +
      'Status dihitung otomatis dari tanggal PHO:\n' +
      '  • Belum Terkontrak — SPMK belum terbit.\n' +
      '  • Berjalan — kontrak aktif.\n' +
      '  • Akan PHO — tinggal 30 hari atau kurang.\n' +
      '  • Selesai (PHO) — tanggal PHO sudah terlewati.\n\n' +
      'Data berasal dari hasil pengambilan data SIPP di server, jadi selalu ada catatan waktu pembaruan.',
  },
  {
    id: 'jadwal',
    judul: 'Jadwal Rapat',
    kataKunci: [
      { kata: 'jadwal', bobot: 5 },
      { kata: 'rapat', bobot: 5 },
      { kata: 'kegiatan', bobot: 4 },
      { kata: 'agenda', bobot: 4 },
      { kata: 'kalender', bobot: 4 },
    ],
    jawaban:
      'Modul Jadwal Rapat mengelola agenda dan kegiatan.\n\n' +
      'Fitur: tampilan kalender dan daftar, filter bulan, serta sinkronisasi ke Google Calendar ' +
      'dan Google Sheets bila dikonfigurasi.\n\n' +
      'Setiap kegiatan memiliki tautan kalender yang bisa dibuka langsung.',
  },
  {
    id: 'role',
    judul: 'Hak akses per role',
    kataKunci: [
      { kata: 'role', bobot: 5 },
      { kata: 'hak akses', bobot: 5 },
      { kata: 'akses', bobot: 3 },
      { kata: 'tidak bisa buka', bobot: 5 },
      { kata: 'tidak punya akses', bobot: 5 },
      { kata: 'jabatan', bobot: 3 },
    ],
    jawaban:
      'Terdapat 9 role dengan hak akses berbeda:\n\n' +
      '  • Admin — seluruh modul, pengguna, audit, verifikasi, Command Center.\n' +
      '  • Bendahara — keuangan, persediaan, BMN, DIPA, jadwal.\n' +
      '  • BMN — BMN, persediaan, DIPA, jadwal.\n' +
      '  • Teknis (Operator Satker) — utilitas, DIPA, jadwal.\n' +
      '  • Perencanaan (Operator Perencanaan) — utilitas, DIPA, jadwal.\n' +
      '  • PPSPM / PPK / Operator Keuangan — keuangan, DIPA, SK, jadwal, analisa anggaran.\n' +
      '  • Pengusul — hanya utilitas miliknya sendiri.\n\n' +
      'Menu yang tidak muncul berarti role Anda tidak memiliki akses ke modul tersebut. ' +
      'Hubungi Admin bila akses perlu ditambah.',
  },
  {
    id: 'akun',
    judul: 'Akun & login',
    kataKunci: [
      { kata: 'login', bobot: 5 },
      { kata: 'masuk', bobot: 3 },
      { kata: 'akun', bobot: 4 },
      { kata: 'password', bobot: 5 },
      { kata: 'sandi', bobot: 5 },
      { kata: 'lupa', bobot: 3 },
      { kata: 'daftar', bobot: 3 },
      { kata: 'registrasi', bobot: 4 },
      { kata: 'pending', bobot: 4 },
      { kata: 'belum aktif', bobot: 5 },
    ],
    jawaban:
      'Akun & login:\n\n' +
      '  • Pendaftaran baru berstatus PENDING dan harus disetujui Admin sebelum bisa masuk.\n' +
      '  • Lupa sandi: gunakan tautan "Lupa kata sandi" di halaman login untuk menerima email pengaturan ulang.\n' +
      '  • Demi keamanan, sesi berakhir otomatis setelah lama tidak aktif — Anda perlu masuk kembali.\n\n' +
      'Bila akun masih belum aktif, hubungi Admin untuk persetujuan.',
  },
  {
    id: 'notifikasi',
    judul: 'Notifikasi',
    kataKunci: [
      { kata: 'notifikasi', bobot: 5 },
      { kata: 'lonceng', bobot: 5 },
      { kata: 'pemberitahuan', bobot: 4 },
      { kata: 'email', bobot: 3 },
    ],
    jawaban:
      'Notifikasi muncul pada ikon lonceng di header.\n\n' +
      'Jenis yang dikirim otomatis antara lain: permohonan utilitas baru, permintaan review, ' +
      'hasil review, transaksi besar, dokumen DIPA/SK baru, stok kritis, dan SLA terlampaui.\n\n' +
      'Ringkasan harian dikirim sekali per hari — sistem mencegah pengiriman ganda pada hari yang sama.\n\n' +
      'Preferensi email dan notifikasi dalam aplikasi dapat diatur di halaman Profil.',
  },
  {
    id: 'admin',
    judul: 'Pengguna, audit, CMS',
    kataKunci: [
      { kata: 'pengguna', bobot: 4 },
      { kata: 'audit', bobot: 5 },
      { kata: 'log', bobot: 4 },
      { kata: 'cms', bobot: 5 },
      { kata: 'admin', bobot: 3 },
      { kata: 'kelola user', bobot: 5 },
    ],
    jawaban:
      'Menu Administrasi (khusus Admin):\n\n' +
      '  • Pengguna — kelola akun, role, dan persetujuan pendaftaran.\n' +
      '  • Verifikasi — antrean data dari Keuangan/Persediaan/BMN yang menunggu keputusan.\n' +
      '  • CMS & Upload — pengaturan situs (nama aplikasi, kontak) dan status integrasi.\n' +
      '  • Audit Log — jejak aktivitas pengguna beserta perubahan data.\n' +
      '  • Command Center — status seluruh pekerjaan terjadwal (cron) di aplikasi dan server.',
  },
  {
    id: 'cron',
    judul: 'Command Center (cron)',
    kataKunci: [
      { kata: 'cron', bobot: 5 },
      { kata: 'command center', bobot: 5 },
      { kata: 'terjadwal', bobot: 4 },
      { kata: 'otomatis', bobot: 2 },
      { kata: 'scheduler', bobot: 4 },
    ],
    jawaban:
      'Command Center menampilkan status seluruh pekerjaan terjadwal:\n\n' +
      '  • Cron aplikasi: pemeriksaan SLA utilitas dan ringkasan harian.\n' +
      '  • Cron server: backup database, pemantau uptime, pengambilan data I-EMON & SIPP, ' +
      'laporan mingguan, dan pembersihan berkas.\n\n' +
      'Setiap baris menampilkan jadwal (dalam WIB), kapan terakhir berjalan, durasi, dan hasilnya. ' +
      'Status "Terlambat" berarti pekerjaan tidak melapor sesuai jadwalnya.\n\n' +
      'Catatan: server memakai zona waktu UTC+8, sehingga jadwal berjalan 1 jam lebih awal ' +
      'daripada jam WIB — ini sudah ditandai pada tiap baris.',
  },
  {
    id: 'keamanan',
    judul: 'Keamanan data',
    kataKunci: [
      { kata: 'keamanan', bobot: 4 },
      { kata: 'aman', bobot: 3 },
      { kata: 'data pribadi', bobot: 4 },
      { kata: 'privasi', bobot: 4 },
      { kata: 'ai', bobot: 4 },
      { kata: 'kecerdasan buatan', bobot: 5 },
    ],
    jawaban:
      'Tentang keamanan data:\n\n' +
      'Semua pemrosesan data (unggah Excel, pembacaan dokumen, perhitungan) dilakukan DI DALAM ' +
      'server aplikasi ini. Tidak ada data anggaran yang dikirim ke layanan AI atau pihak ketiga.\n\n' +
      'Asisten yang sedang Anda pakai pun bekerja dari basis pengetahuan lokal — bukan AI daring.\n\n' +
      'Akses data dibatasi per role, dan setiap perubahan penting tercatat di Audit Log.',
  },
]

/** Kata kunci yang menunjukkan salam/obrolan ringan. */
const SALAM = ['halo', 'hai', 'hi', 'selamat', 'pagi', 'siang', 'sore', 'malam', 'assalamualaikum', 'permisi']

/** Kata kunci ucapan terima kasih. */
const TERIMA_KASIH = ['terima kasih', 'terimakasih', 'makasih', 'thanks', 'thank you', 'nuhun']

export type HasilJawaban = {
  /** Teks jawaban siap tampil. */
  jawaban: string
  /** id topik yang dipakai, atau null bila tidak ada yang cocok. */
  topikId: string | null
  /** Topik saran ketika pertanyaan tidak dikenali. */
  saran?: string[]
}

/**
 * Mencari jawaban terbaik untuk sebuah pertanyaan.
 *
 * @param pertanyaan teks bebas dari pengguna
 * @param ambang skor minimum agar dianggap cocok (default 3)
 */
export function jawab(pertanyaan: string, ambang = 3): HasilJawaban {
  const teks = normalisasiTeks(pertanyaan)

  if (!teks) {
    return {
      jawaban: 'Silakan tuliskan pertanyaan Anda. Contoh: "di mana menu keuangan?" atau "kenapa data saya tidak masuk laporan?".',
      topikId: null,
      saran: TOPIK.slice(0, 4).map((t) => t.judul),
    }
  }

  // Salam pembuka — hanya bila tidak ada kata kunci topik yang kuat.
  const adaSalam = SALAM.some((s) => teks.split(' ').includes(s) || teks.includes(s))
  const adaTerimaKasih = TERIMA_KASIH.some((s) => teks.includes(s))

  let terbaik: { topik: TopikPengetahuan; skor: number } | null = null
  for (const topik of TOPIK) {
    const skor = skorTopik(pertanyaan, topik)
    if (!terbaik || skor > terbaik.skor) terbaik = { topik, skor }
  }

  if (terbaik && terbaik.skor >= ambang) {
    return { jawaban: terbaik.topik.jawaban, topikId: terbaik.topik.id }
  }

  // Ucapan terima kasih diperiksa SEBELUM balasan salam, karena "terima kasih"
  // sering berdiri sendiri dan tidak memuat kata kunci topik apa pun.
  if (adaTerimaKasih) {
    return {
      jawaban:
        (adaSalam ? 'Halo, sama-sama. ' : 'Sama-sama. ') +
        'Bila ada yang perlu dijelaskan lagi tentang menu atau alur aplikasi, silakan tanya.',
      topikId: null,
      saran: ['Daftar menu & fungsinya', 'Verifikasi & status data', 'Laporan & ekspor'],
    }
  }

  if (adaSalam) {
    return {
      jawaban:
        'Halo! Saya asisten SINTEGRASI. Saya bisa menjelaskan menu, alur verifikasi, modul-modul aplikasi, ' +
        'serta hal teknis seperti laporan dan hak akses.\n\nSilakan pilih topik di bawah atau tulis pertanyaan Anda.',
      topikId: null,
      saran: ['Daftar menu & fungsinya', 'Verifikasi & status data', 'Laporan & ekspor', 'Hak akses per role'],
    }
  }

  // Tidak dikenali: bantu arahkan tanpa berpura-pura tahu.
  return {
    jawaban:
      'Maaf, saya belum menemukan jawaban untuk pertanyaan itu.\n\n' +
      'Saya paling membantu untuk hal-hal seputar aplikasi: daftar menu, alur verifikasi, laporan & ekspor, ' +
      'modul keuangan/persediaan/BMN/utilitas, hak akses, notifikasi, dan Command Center cron.\n\n' +
      'Bila pertanyaan Anda menyangkut kebijakan atau data tertentu, silakan hubungi Admin.',
    topikId: null,
    saran: TOPIK.slice(0, 4).map((t) => t.judul),
  }
}
