// Tipe data baris tabel utama per modul.
// Saat ini cukup BmnRow (modul Barang Milik Negara).

export interface BmnRow {
  id: string
  kode_aset: string
  nama_aset: string
  spesifikasi: string | null
  kondisi: string
  nilai_aset: number
  lokasi: string | null
  pengguna: string | null
  status_penggunaan: string
  link_foto: string | null
  tahun_pengadaan: number | null
  tahun_pencatatan: number | null
  updated_at: string
}
