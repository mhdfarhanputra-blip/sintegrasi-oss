/**
 * cronRegistry.ts — Satu sumber kebenaran untuk SELURUH pekerjaan terjadwal.
 *
 * MASALAH YANG DISELESAIKAN
 *   Sebelumnya jadwal tersebar di tiga tempat yang tidak saling tahu:
 *     1. `vercel.json` — cron milik aplikasi (UTC, tanpa riwayat eksekusi)
 *     2. cron host VPS (Hermes) — scraper, laporan Telegram, backup, uptime
 *     3. skrip ad-hoc di `~/.hermes/scripts`
 *   Akibatnya tidak ada satu pun tempat untuk menjawab "apakah semua cron
 *   sehat?". Kegagalan hanya terlihat bila kebetulan membuka log yang tepat —
 *   dan memang ada cron yang mati berbulan-bulan tanpa ada yang tahu.
 *
 *   Berkas ini mendaftarkan setiap pekerjaan beserta jadwal, pemilik, dan
 *   cara memeriksanya, sehingga dasbor /cron dapat menampilkan status nyata.
 *
 * KONVENSI WAKTU
 *   `jadwal` ditulis dalam UTC mengikuti Vercel Cron dan crontab host.
 *   `labelWib` adalah hasil konversinya ke WIB, ditulis eksplisit agar tidak
 *   ada lagi kebingungan "0 9 * * *" = 09:00 atau 16:00 WIB.
 */

/** Di mana pekerjaan ini benar-benar dijalankan. */
export type LokasiCron = 'vercel' | 'vps'

/** Seberapa penting bila pekerjaan ini gagal. */
export type PrioritasCron = 'kritis' | 'penting' | 'normal'

export type EntriCron = {
  /** Kunci stabil, dipakai sebagai id di UI dan riwayat eksekusi. */
  id: string
  nama: string
  /** Penjelasan singkat untuk operator. */
  keterangan: string
  lokasi: LokasiCron
  /** Ekspresi cron 5 kolom dalam UTC. */
  jadwal: string
  /** Terjemahan jadwal ke WIB (sudah dihitung, bukan dihitung di UI). */
  labelWib: string
  /** Endpoint API yang dijalankan, bila ada. */
  endpoint?: string
  /** Nama skrip/berkas di host, bila relevan. */
  skrip?: string
  prioritas: PrioritasCron
  /** Modul aplikasi yang terdampak bila pekerjaan ini gagal. */
  modulTerdampak: string[]
  /**
   * Selisih jam terhadap WIB.
   *
   * Cron VPS ditulis dalam zona sistem host (Asia/Shanghai, UTC+8), sehingga
   * berjalan 1 jam lebih awal daripada jam WIB yang tertulis di dokumentasi
   * lama. Nilai ini ditampilkan di dasbor agar tidak ada lagi salah kira.
   */
  geserWibJam?: number
}

/**
 * Daftar lengkap pekerjaan terjadwal.
 *
 * Ditulis tangan (bukan dibaca dari crontab) supaya dapat diuji dan direview
 * lewat git. Bila menambah cron baru, tambahkan juga di sini — ada test yang
 * memeriksa setiap endpoint cron di `src/app/api/cron/**` terdaftar.
 */
export const CRON_REGISTRY: EntriCron[] = [
  // ---------------------------------------------------------------- Vercel
  {
    id: 'sla-utilitas',
    nama: 'SLA Utilitas',
    keterangan:
      'Menandai permohonan utilitas yang melewati batas 2 hari pemeriksaan dan mengirim peringatan (in-app + satu email gabungan).',
    lokasi: 'vercel',
    jadwal: '0 0,4 * * *',
    labelWib: '07:00 & 11:00 WIB setiap hari',
    endpoint: '/api/cron/sla-utilitas',
    prioritas: 'kritis',
    modulTerdampak: ['utilitas'],
  },
  {
    id: 'ringkasan-harian',
    nama: 'Ringkasan Harian',
    keterangan:
      'Menghitung ringkasan transaksi hari ini (WIB), stok kritis, dan keterlambatan SLA, lalu mengirimkannya ke Admin/Bendahara.',
    lokasi: 'vercel',
    jadwal: '30 0 * * *',
    labelWib: '07:30 WIB setiap hari',
    endpoint: '/api/cron/ringkasan-harian',
    prioritas: 'penting',
    modulTerdampak: ['keuangan', 'persediaan', 'utilitas'],
  },

  // ------------------------------------------------------------- Host VPS
  {
    id: 'backup-harian',
    nama: 'Backup Database',
    keterangan:
      'Dump seluruh tabel Supabase lalu unggah ke Google Drive. Wajib untuk pemulihan bencana.',
    lokasi: 'vps',
    jadwal: '0 2 * * *',
    labelWib: '01:00 WIB setiap hari',
    skrip: 'backup_harian.py',
    prioritas: 'kritis',
    geserWibJam: -1,
    modulTerdampak: ['semua'],
  },
  {
    id: 'uptime',
    nama: 'Pemantau Uptime',
    keterangan:
      'Memeriksa halaman publik, kesehatan database & storage, dan kesegaran data iEMON. Senyap bila sehat.',
    lokasi: 'vps',
    jadwal: '*/30 * * * *',
    labelWib: 'setiap 30 menit',
    endpoint: '/api/health?deep=1',
    skrip: 'sintegrasi_uptime.py',
    prioritas: 'kritis',
    geserWibJam: -1,
    modulTerdampak: ['semua'],
  },
  {
    // Diperiksa oleh pantau_cron.py: mencari cron yang gagal beruntun.
    // Tanpa entri ini, pelaporannya ditolak 400 dan kegagalan tidak terlihat.
    id: 'pantau-cron',
    nama: 'Pemantau Kesehatan Cron',
    keterangan:
      'Memeriksa riwayat semua cron dan mengirim peringatan bila ada yang gagal 2 kali berturut-turut. Senyap bila semua sehat.',
    lokasi: 'vps',
    jadwal: '0 */2 * * *',
    labelWib: 'setiap 2 jam',
    skrip: 'lapor__pantau_cron.py',
    prioritas: 'kritis',
    geserWibJam: -1,
    modulTerdampak: ['sistem'],
  },
  {
    // Sebelumnya iemon_anomaly.py tidak pernah dijadwalkan dan topiknya (#6)
    // sudah dihapus, sehingga peringatan gap fisik-keuangan tidak pernah sampai.
    id: 'deteksi-anomali',
    nama: 'Deteksi Anomali Progres',
    keterangan:
      'Membandingkan progres fisik dan keuangan tiap paket iEMON. Melapor bila selisihnya melebihi 10% atau pergerakan harian di luar kewajaran.',
    lokasi: 'vps',
    jadwal: '0 10 * * 1-5',
    labelWib: 'Senin-Jumat 09:00 WIB',
    skrip: 'lapor__deteksi_anomali.py',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: ['iemon'],
  },
  {
    id: 'sipp-publish',
    nama: 'Terbitkan Data SIPP',
    keterangan:
      'Mengubah hasil scraping SIPP (Excel) menjadi JSON lalu mengunggahnya ke Storage agar modul SIPP terisi.',
    lokasi: 'vps',
    jadwal: '20 9 * * 1-5',
    labelWib: 'Senin-Jumat 08:20 WIB',
    skrip: 'sipp_publish.py',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: ['sipp'],
  },
  {
    id: 'sipp-scrape',
    nama: 'Scraping SIPP',
    keterangan:
      'Mengambil paket kontraktual dari sipp.pu.go.id. Harus dari VPS karena SIPP memblokir IP lain.',
    lokasi: 'vps',
    jadwal: '0 9 * * 1-5',
    labelWib: 'Senin-Jumat 08:00 WIB',
    skrip: 'sipp_cron_run.sh',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: ['sipp'],
  },
  {
    id: 'iemon-pagi',
    nama: 'Scraping iEMON (pagi)',
    keterangan: 'Menarik data kinerja iEMON lalu mendorongnya ke aplikasi lewat /api/iemon/ingest.',
    lokasi: 'vps',
    jadwal: '30 8 * * 1-5',
    labelWib: 'Senin-Jumat 07:30 WIB',
    skrip: 'iemon_cron_auto.sh',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: ['iemon'],
  },
  {
    id: 'iemon-sore',
    nama: 'Scraping iEMON (sore)',
    keterangan: 'Putaran kedua untuk menangkap pembaruan data siang hari.',
    lokasi: 'vps',
    jadwal: '30 16 * * 1-5',
    labelWib: 'Senin-Jumat 15:30 WIB',
    skrip: 'iemon_cron_auto.sh',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: ['iemon'],
  },
  {
    id: 'push-harian',
    nama: 'Push Harian SINTEGRASI',
    keterangan: 'Mendorong data harian (iEMON/SIPP) ke aplikasi dan mengabarkan ringkasannya.',
    lokasi: 'vps',
    jadwal: '15 9 * * 1-5',
    labelWib: 'Senin-Jumat 08:15 WIB',
    skrip: 'sintegrasi_push_daily.sh',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: ['iemon', 'sipp'],
  },
  {
    id: 'morning-brief',
    nama: 'Briefing Pagi',
    keterangan: 'Ringkasan lintas-sistem ke Telegram setiap pagi (bukan bagian aplikasi).',
    lokasi: 'vps',
    jadwal: '0 7 * * *',
    labelWib: '06:00 WIB setiap hari',
    skrip: 'morning_brief.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    id: 'laporan-mingguan',
    nama: 'Laporan Mingguan iEMON',
    keterangan: 'Rekap kinerja mingguan dikirim ke Telegram setiap Jumat.',
    lokasi: 'vps',
    jadwal: '0 17 * * 5',
    labelWib: 'Jumat 16:00 WIB',
    skrip: 'iemon_mingguan_jumat.sh',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: ['iemon'],
  },
  {
    id: 'infografis-bulanan',
    nama: 'Infografis Bulanan',
    keterangan: 'Membuat infografis kinerja akhir bulan.',
    lokasi: 'vps',
    jadwal: '0 8 1 * *',
    labelWib: 'Tanggal 1 pukul 07:00 WIB',
    skrip: 'iemon_infografis_bulanan.sh',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: ['iemon'],
  },
  {
    id: 'watchdog-satker',
    nama: 'Watchdog Satker',
    keterangan: 'Memantau ketersediaan layanan situs internal. Di luar cakupan aplikasi ini.',
    lokasi: 'vps',
    jadwal: '30 9 * * 1-5',
    labelWib: 'Senin-Jumat 08:30 WIB',
    skrip: 'watchdog_satker.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    id: 'health-vps',
    nama: 'Kesehatan Sistem VPS',
    keterangan: 'Memeriksa layanan, cron, token bot, dan sumber daya VPS setiap 4 jam.',
    lokasi: 'vps',
    jadwal: '0 */4 * * *',
    labelWib: 'setiap 4 jam (mulai 23:00 WIB)',
    skrip: 'health_watchdog_cron.sh',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    id: 'error-report',
    nama: 'Laporan Error Mingguan',
    keterangan: 'Merekap kegagalan skrip 7 hari terakhir untuk tiap job terjadwal.',
    lokasi: 'vps',
    jadwal: '0 8 * * 1',
    labelWib: 'Senin 07:00 WIB',
    skrip: 'error_report_weekly.sh',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    id: 'bersih-sampah',
    nama: 'Pembersihan Berkala',
    keterangan: 'Menghapus berkas sementara dan log lama agar disk VPS tidak penuh.',
    lokasi: 'vps',
    jadwal: '30 2 * * 1',
    labelWib: 'Senin 01:30 WIB',
    skrip: 'bersihkan_sampah.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    id: 'proxy-harvester',
    nama: 'Harvester Proxy',
    keterangan: 'Mengumpulkan proxy untuk pipeline scraping. Infrastruktur, bukan aplikasi.',
    lokasi: 'vps',
    jadwal: '40 7 * * *',
    labelWib: '06:40 WIB setiap hari',
    skrip: 'id_proxy_harvester.sh',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  // === Saham & trading (topik terpisah dari modul pemerintahan) ===
  {
    id: 'saham-buka',
    nama: 'Laporan Saham Pembukaan',
    keterangan:
      'Ringkasan pasar saham dan grafik harga saat bursa dibuka. Dikirim ke topik Saham.',
    lokasi: 'vps',
    jadwal: '5 9 * * 1-5',
    labelWib: 'Senin-Jumat 08:05 WIB',
    skrip: 'lapor__saham_buka.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    id: 'saham-tutup',
    nama: 'Laporan Saham Penutupan',
    keterangan: 'Ringkasan pasar saham dan grafik harga saat bursa ditutup.',
    lokasi: 'vps',
    jadwal: '15 16 * * 1-5',
    labelWib: 'Senin-Jumat 15:15 WIB',
    skrip: 'lapor__saham_tutup.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    id: 'sinyal-trading',
    nama: 'Sinyal TradingView',
    keterangan:
      'Meneruskan sinyal TradingView yang belum terkirim. Senyap bila tidak ada sinyal baru, agar tidak spam.',
    lokasi: 'vps',
    jadwal: '*/5 9-16 * * 1-5',
    labelWib: 'setiap 5 menit pada jam bursa',
    skrip: 'lapor__sinyal_trading.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    id: 'laporan-portofolio',
    nama: 'Ringkasan Portofolio',
    keterangan:
      'Menghitung nilai pasar, modal, dan laba/rugi tiap posisi saham, plus peringatan posisi rugi lebih dari 10%.',
    lokasi: 'vps',
    jadwal: '30 16 * * 1-5',
    labelWib: 'Senin-Jumat 15:30 WIB',
    skrip: 'laporan_portofolio.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Pagar risiko: mengukur stop-loss, ukuran posisi, dan konsentrasi sektor.
    // Dijalankan setiap pagi SEBELUM jam bursa agar keputusan diambil dengan
    // angka yang sudah dihitung, bukan saat panik.
    id: 'pagar-risiko',
    nama: 'Pagar Risiko Portofolio',
    keterangan:
      'Mengukur risiko tiap posisi: stop-loss berbasis volatilitas, ukuran posisi berlebih, dan konsentrasi sektor. Menandai posisi yang melanggar aturan.',
    lokasi: 'vps',
    jadwal: '45 8 * * 1-5',
    labelWib: 'Senin-Jumat 07:45 WIB',
    skrip: 'pagar_risiko.py',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Pengganti backtest lama yang menghasilkan Sharpe 77 dan MaxDD 0% dari
    // data sintetis. Versi ini hanya memakai data nyata, menyertakan biaya
    // transaksi, dan menolak menyimpulkan bila transaksi < 30.
    id: 'backtest-bulanan',
    nama: 'Evaluasi Strategi Bulanan',
    keterangan:
      'Membandingkan beberapa strategi terhadap Buy & Hold memakai data nyata dan biaya transaksi. Menyatakan "belum cukup bukti" bila sampel terlalu kecil.',
    lokasi: 'vps',
    jadwal: '0 8 1 * *',
    labelWib: 'tanggal 1 setiap bulan 07:00 WIB',
    skrip: 'lapor__backtest_jujur.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Menjaga data tetap bersih: deteksi lonjakan palsu & saham kedaluwarsa.
    id: 'kualitas-data-saham',
    nama: 'Perbaikan Kualitas Data Saham',
    keterangan:
      'Menormalkan skala harga yang berubah dan menandai saham yang datanya berhenti, agar indikator tidak dihitung dari angka menyesatkan.',
    lokasi: 'vps',
    jadwal: '30 7 * * 1-5',
    labelWib: 'Senin-Jumat 06:30 WIB',
    skrip: 'lapor__perbaiki_data_saham.py',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Laporan pasar menyeluruh: breadth, sektor, teknikal, berita.
    // Berbeda dari 'saham-buka' yang hanya mengirim grafik harga.
    id: 'laporan-pasar',
    nama: 'Laporan Pasar Menyeluruh',
    keterangan:
      'Menyatukan kondisi pasar (naik/turun), kinerja sektor, saham terkuat & terlemah secara teknikal, berita 48 jam terakhir, dan peringatan drawdown ekstrem.',
    lokasi: 'vps',
    jadwal: '0 17 * * 1-5',
    labelWib: 'Senin-Jumat 16:00 WIB',
    skrip: 'laporan_pasar.py',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Berita pasar dikumpulkan dari RSS resmi (CNBC, Kontan, Antara).
    id: 'berita-pasar',
    nama: 'Berita Pasar Terkini',
    keterangan:
      'Mengumpulkan berita dari CNBC Indonesia, Kontan, dan Antara, lalu menandai berita yang menyebut emiten pantauan.',
    lokasi: 'vps',
    jadwal: '30 12 * * 1-5',
    labelWib: 'Senin-Jumat 11:30 WIB',
    skrip: 'lapor__berita_pasar.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Penyegaran OHLCV: tanpa ini analisis teknikal memakai data basi.
    id: 'segarkan-ohlcv',
    nama: 'Penyegaran Data OHLCV',
    keterangan:
      'Mengambil ulang data open/high/low/close/volume dari sumber pasar agar analisis teknikal memakai angka terbaru.',
    lokasi: 'vps',
    jadwal: '15 17 * * 1-5',
    labelWib: 'Senin-Jumat 16:15 WIB',
    skrip: 'lapor__segarkan_ohlcv.py',
    prioritas: 'penting',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Uji lanjut: out-of-sample, walk-forward, banding acak, sensitivitas stop.
    // Menjawab "apakah sinyal teknikal ini benar berguna?" secara terukur.
    id: 'backtest-lanjut',
    nama: 'Uji Kekuatan Analisis Teknikal',
    keterangan:
      'Menguji 10 strategi dengan data 4 tahun: out-of-sample untuk deteksi overfitting, walk-forward untuk kestabilan, banding acak untuk uji statistik, dan sensitivitas stop-loss.',
    lokasi: 'vps',
    jadwal: '0 9 1 * *',
    labelWib: 'tanggal 1 setiap bulan 08:00 WIB',
    skrip: 'lapor__backtest_lanjut.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Riset sistematis 375 kombinasi parameter, disaring winrate >= 70%
    // DITAMBAH profit factor, jumlah transaksi, dan uji ketahanan per tahun.
    // Winrate tinggi saja tidak cukup: menang sering tetapi kalah besar
    // tetap merugikan, jadi hasil riset tidak pernah berdiri sendiri.
    id: 'riset-parameter',
    nama: 'Riset Kombinasi Parameter',
    keterangan:
      'Menyapu 375 kombinasi indikator & parameter, menyaring winrate ≥70%, lalu menguji ketahanannya per tahun dan per saham agar tidak terjebak overfitting.',
    lokasi: 'vps',
    jadwal: '0 10 1 * *',
    labelWib: 'tanggal 1 setiap bulan 09:00 WIB',
    skrip: 'lapor__riset_parameter.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Pemilihan saham berbasis 15 tahun: mengutamakan KETAHANAN melewati
    // krisis 2013/2015/2020/2022, bukan kenaikan tercepat.
    id: 'pilih-saham',
    nama: 'Pemilihan Saham 15 Tahun',
    keterangan:
      'Menilai 44 saham dari CAGR, konsistensi tahun positif, drawdown terdalam, lama pemulihan, Sharpe, dan likuiditas. Mengutamakan saham yang bertahan, bukan yang naik tercepat.',
    lokasi: 'vps',
    jadwal: '0 11 1 * *',
    labelWib: 'tanggal 1 setiap bulan 10:00 WIB',
    skrip: 'lapor__pilih_saham.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Penjaga keberlangsungan data: memastikan data tetap akurat & mutakhir.
    // Menyegarkan otomatis bila tertinggal, membersihkan anomali harga,
    // menandai saham tersuspensi, dan melapor HANYA bila ada masalah.
    id: 'jaga-data-pasar',
    nama: 'Penjaga Keberlangsungan Data',
    keterangan:
      'Memeriksa kesegaran, keutuhan, kewajaran harga, dan kelengkapan laporan keuangan setiap hari bursa. Menyegarkan data otomatis bila tertinggal. Senyap bila semua sehat.',
    lokasi: 'vps',
    jadwal: '30 17 * * 1-5',
    labelWib: 'Senin-Jumat 16:30 WIB',
    skrip: 'jaga__data_pasar.py',
    prioritas: 'kritis',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Analisis rasio dari laporan keuangan nyata (PER, PBV, ROE, DER, dsb).
    id: 'analisis-rasio',
    nama: 'Analisis Rasio Keuangan',
    keterangan:
      'Menghitung PER, PBV, ROE, DER, margin, pertumbuhan laba, dan kualitas laba dari laporan keuangan tahunan asli. Bank dinilai dengan ukuran berbeda karena dana nasabah tercatat sebagai kewajiban.',
    lokasi: 'vps',
    jadwal: '0 18 * * 1-5',
    labelWib: 'Senin-Jumat 17:00 WIB',
    skrip: 'lapor__analisis_rasio.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Menyegarkan harga & berita, menghitung ulang proxy bandarmologi,
    // lalu mengunggah seluruh data ke Google Drive (hanya yang berubah).
    // Menggantikan pekerjaan manual: ekspor + unggah harus satu paket agar
    // arsip di Drive selalu mencerminkan keadaan terbaru.
    id: 'data-gdrive',
    nama: 'Arsip Data ke Google Drive',
    keterangan:
      'Menyegarkan harga OHLCV dan berita emiten, menghitung ulang proxy bandarmologi harian, lalu mengunggah seluruh data ke Google Drive dengan struktur rapi (harga per tahun, fundamental, bandarmologi, berita arsip & terkini, hasil uji, salinan database). Hanya file yang berubah yang diunggah.',
    lokasi: 'vps',
    jadwal: '0 18 * * 1-5',
    labelWib: 'Senin-Jumat 17:00 WIB',
    skrip: 'jaga__data_gdrive.py',
    prioritas: 'kritis',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Memantau ruang disk. Senyap bila di bawah 85%; hanya berbunyi saat
    // ruang mulai menipis, agar peringatan penting tidak tenggelam.
    id: 'pantau-disk',
    nama: 'Pantau Ruang Disk',
    keterangan:
      'Memeriksa pemakaian disk setiap 6 jam. Senyap bila di bawah 85 persen. Saat menipis, menampilkan folder terbesar, perintah pembersihan yang aman, dan daftar berkas yang tidak boleh dihapus (kredensial, backup, database).',
    lokasi: 'vps',
    jadwal: '0 */6 * * *',
    labelWib: 'Setiap 6 jam',
    skrip: 'pantau_disk.py',
    prioritas: 'kritis',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Menilai sistem terhadap dirinya sendiri: kesehatan data, cron,
    // performa sinyal, dan sistem. Laporan boleh berisi kabar buruk.
    id: 'laporan-mingguan-sistem',
    nama: 'Laporan Mingguan Sistem',
    keterangan:
      'Setiap Senin pagi: memeriksa kesegaran data (termasuk apakah ohlcv_bersih tertinggal dari ohlcv), kesehatan cron, performa sinyal LAYAK dibanding rata-rata pasar, serta disk, RAM, dan layanan yang mati.',
    lokasi: 'vps',
    jadwal: '0 8 * * 1',
    labelWib: 'Senin 07:00 WIB',
    skrip: 'laporan_mingguan_sistem.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Laporan harian HANYA untuk saham fokus (10-12 saham dengan data
    // terlengkap). Laporan menyebar ke 100 saham membuat analisis dangkal.
    id: 'fokus-harian',
    nama: 'Fokus Harian Saham',
    keterangan:
      'Laporan harian untuk saham fokus saja: harga, RSI, posisi dalam rentang setahun, PER, dan aliran bandar. Hanya menandai saham yang beberapa ukuran mendukung sekaligus, dan membatalkan tanda itu bila bandar sedang melepas.',
    lokasi: 'vps',
    jadwal: '35 8 * * 1-5',
    labelWib: 'Senin-Jumat 07:35 WIB',
    skrip: 'lapor__fokus_harian.py',
    prioritas: 'normal',
    geserWibJam: -1,
    modulTerdampak: [],
  },
  {
    // Memantau 5 syarat masuk bank HIMBARA. Memeriksa tiap hari tetapi
    // HANYA berbunyi bila ada perubahan penting (bank mencapai 4/5 atau
    // 5/5, atau IHSG menembus SMA50). Diam saat belum ada kabar.
    id: 'pantau-syarat-bank',
    nama: 'Pantau Syarat Masuk Bank HIMBARA',
    keterangan:
      'Setiap hari bursa: menyegarkan IHSG dan empat bank HIMBARA, lalu memeriksa lima syarat masuk (harga mantap, momentum, valuasi, IHSG mendukung, bukan jebakan). Hanya mengirim pesan bila ada perubahan penting; tidak bersuara selama syarat belum berubah.',
    lokasi: 'vps',
    jadwal: '50 8 * * 1-5',
    labelWib: 'Senin-Jumat 07:50 WIB',
    skrip: 'jaga__syarat_bank_pagi.py',
    prioritas: 'kritis',
    geserWibJam: -1,
    modulTerdampak: [],
  },
]

/** Cari entri berdasarkan id. */
export function cariCron(id: string): EntriCron | undefined {
  return CRON_REGISTRY.find((c) => c.id === id)
}

/** Pekerjaan milik aplikasi (dijalankan Vercel). */
export function cronVercel(): EntriCron[] {
  return CRON_REGISTRY.filter((c) => c.lokasi === 'vercel')
}

/**
 * Menerjemahkan ekspresi cron menjadi teks waktu yang mudah dibaca.
 *
 * PENTING — TIGA ZONA WAKTU BERBEDA:
 *   1. Cron Vercel      : ditulis dalam UTC
 *   2. Crontab host VPS : ditulis dalam zona waktu SISTEM = Asia/Shanghai (UTC+8)
 *   3. Pengguna         : WIB (UTC+7)
 *
 * Zona sistem VPS adalah Asia/Shanghai (UTC+8), BUKAN WIB. Akibatnya setiap
 * jadwal VPS berjalan 1 jam lebih awal daripada jam WIB yang tertulis di
 * dokumentasi/pesan commit. Ini bukan bug kode, melainkan keadaan yang sudah
 * berlangsung — karena itu label di registry menyebut WAKTU SEBENARNYA agar
 * tidak ada lagi salah kira, dan registry menandai `geserWib` untuk transparansi.
 *
 * Mendukung bentuk yang benar-benar dipakai: menit/jam berupa angka atau daftar
 * dipisah koma (`0,4`), plus bentuk bintang.
 *
 * @param ekspresi ekspresi cron 5 kolom
 * @param zonaSumber 'utc' untuk Vercel, 'sistem-vps' untuk crontab host
 * @returns Label seperti "07:00 & 11:00 WIB", atau null bila tak dapat diurai.
 */
export function jadwalKeWib(
  ekspresi: string,
  zonaSumber: 'utc' | 'sistem-vps' = 'utc',
): string | null {
  const bagian = ekspresi.trim().split(/\s+/)
  if (bagian.length < 2) return null
  const [menit, jam] = bagian

  const daftarMenit = menit.split(',').map((m) => Number(m))
  if (daftarMenit.some((m) => !Number.isInteger(m) || m < 0 || m > 59)) return null
  const daftarJam = jam.split(',').map((h) => Number(h))
  if (daftarJam.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) return null

  // Vercel: UTC -> WIB (+7). VPS: sistem sudah UTC+8 -> WIB (-1).
  const geser = zonaSumber === 'utc' ? 7 * 60 : -60
  const wib = daftarJam
    .flatMap((h) => daftarMenit.map((m) => (h * 60 + m + geser + 24 * 60) % (24 * 60)))
    .sort((a, b) => a - b)
    .map((total) => {
      const h = String(Math.floor(total / 60)).padStart(2, '0')
      const m = String(total % 60).padStart(2, '0')
      return m === '00' ? `${h}:00` : `${h}:${m}`
    })
  return `${wib.join(' & ')} WIB`
}
