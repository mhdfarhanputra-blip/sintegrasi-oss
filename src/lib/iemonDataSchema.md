# Struktur Data i-EMON (Pegangan Sistem)

Referensi struktur file Excel ekspor i-eMonitoring PU (iemon.pu.go.id) yang
diunggah ke modul i-EMON. Dipakai sebagai acuan parser `src/lib/iemonParser.ts`.

> Catatan penting: **baris 1 setiap file berisi judul "Integrated electronic
> Monitoring" yang berulang di semua kolom**. Header kolom sebenarnya ada di
> **baris 2**. Parser mendeteksi baris header otomatis (skor alias), dan
> pencarian kolom mengutamakan kecocokan **persis** agar `progres_fisik` tidak
> tertukar dengan `progres_fisik_jan`.

## 1. Paket.xlsx (82 kolom, header baris 2)

Identitas & hierarki: `kdunit`, `kdsatker`, `kdprogram`, `kdgiat`, `kdoutput`,
`kdsoutput`, `kdkmpnen`, `kdskmpnen`, `kode` (kode lengkap paket,
mis. `04.693859.GA.7696.CBR.001.401.AA`), `nmpaket`, `kdlokasi`, `kdkabkota`.

Atribut: `metode`, `kdpengadaan`, `vol`, `sat`, `tgl_mulai`, `tgl_selesai`.

Pagu (Rp): `pagu_51`, `pagu_52`, `pagu_53`, `pagu_rpm`, `pagu_sbsn`,
`pagu_phln`, `pagu_total`.

Realisasi (Rp): `real_51`, `real_52`, `real_53`, `real_rpm`, `real_sbsn`,
`real_phln`, `real_total`.

Progres kumulatif (%): `progres_keuangan`, `progres_fisik`.

Kurva-S bulanan kumulatif (%), 12 kolom masing-masing:
- Realisasi keuangan: `progres_keu_jan` … `progres_keu_des`
- Realisasi fisik: `progres_fisik_jan` … `progres_fisik_des`
- Rencana keuangan: `ren_keu_jan` … `ren_keu_des`
- Rencana fisik: `ren_fis_jan` … `ren_fis_des`

## 2. Kontraktual.xlsx (25 kolom, header baris 2)

`kdsatker`, `kode` (sama dengan kode paket → kunci join), `nmpaket`,
`metode`, `jenis_kontrak`, `vol`, `sat`, `tgl_mulai`, `tgl_selesai`,
`jadwal_pengumuman`, `jadwal_pemenang`, `jadwal_kontrak`, `status`
(mis. `Terkontrak`, `Belum Lelang`), `nilai_kontrak`, `nomor_kontrak`,
`rkn_nama` (rekanan/penyedia), `rkn_npwp`, `pagu_rpm`, `pagu_sbsn`,
`pagu_phln`, `pagu_total_dipa`, `pagu_pengadaan`, `realisasi`,
`progres_keuangan`, `progres_fisik`.

## 3. RKAKL.xlsx (76 kolom, header baris 2)

Hierarki: `kdsatker`, `kdunit`, `kdprogram`, `kdgiat`, `kdoutput`,
`kdsoutput`, `kdkmpnen`, `kdskmpnen`, `kdakun` (akun belanja 6 digit),
`noitem`, `header1`, `header2`, `nmitem` (uraian item).

Nilai: `volkeg`, `satkeg`, `hargasat`, `jumlah` (pagu item),
`paguphln`, `pagurmp`, `pagurkp`, blokir (`rphblokir`, `blokirphln`,
`blokirrmp`, `blokirrkp`).

Rencana penarikan bulanan (Rp): `JANUARI` … `DESEMBER` (12 kolom).

## Relasi & join
- Paket dan Kontraktual: join pada `kode` (kode lengkap paket).
- Paket/Kontraktual/RKAKL dan level analisa: hierarki
  `program -> kegiatan -> kro -> ro -> komponen -> subkomponen -> detil`
  dibangun dari segmen kode (`kdprogram.kdgiat.kdoutput.kdsoutput.kdkmpnen`).
- Kode komponen ketiga file saling cocok, sehingga agregasi per level valid.

## Contoh angka nyata (data 06 Agu 2026, contoh satuan kerja)
- Total pagu paket sekitar Rp 11,44 M; realisasi sekitar Rp 5,28 M (serapan ~46%).
- 6 kontrak, total nilai sekitar Rp 11,78 M.
- 147 item RKAKL, total pagu sekitar Rp 11,44 M.
- Rencana fisik kumulatif jauh di atas realisasi sehingga proyek tertinggal.
