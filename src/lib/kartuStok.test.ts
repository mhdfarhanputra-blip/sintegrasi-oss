import { describe, it, expect } from 'vitest'
import {
  urutkanMutasi,
  saldoTerkiniPerBarang,
  hitungSaldoBerjalan,
  daftarStokKritis,
  type MutasiStok,
} from './kartuStok'

/** Pembuat mutasi uji dengan nilai bawaan yang wajar. */
function m(
  p: Partial<MutasiStok & { stok_minimum: number | null }> & { id: string; tanggal: string },
): MutasiStok & { stok_minimum: number | null } {
  return {
    nama_barang: 'Kertas A4',
    jenis: 'Masuk',
    jumlah: 10,
    stok_saldo: 10,
    stok_minimum: null,
    created_at: `${p.tanggal}T08:00:00.000Z`,
    ...p,
  }
}

describe('urutkanMutasi', () => {
  it('mengurutkan berdasarkan tanggal transaksi, bukan waktu input', () => {
    // Baris tanggal 5 Jan diinput TERAKHIR (created_at paling baru).
    const backdated = m({ id: 'b', tanggal: '2026-01-05', created_at: '2026-10-01T09:00:00Z' })
    const normal = m({ id: 'a', tanggal: '2026-01-20', created_at: '2026-01-20T09:00:00Z' })

    const hasil = urutkanMutasi([backdated, normal])
    expect(hasil.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('memakai waktu input bila tanggal sama', () => {
    const pagi = m({ id: 'pagi', tanggal: '2026-02-01', created_at: '2026-02-01T01:00:00Z' })
    const siang = m({ id: 'siang', tanggal: '2026-02-01', created_at: '2026-02-01T07:00:00Z' })
    expect(urutkanMutasi([siang, pagi]).map((r) => r.id)).toEqual(['pagi', 'siang'])
  })

  it('tidak mengubah array masukan', () => {
    const asli = [m({ id: 'b', tanggal: '2026-01-05' }), m({ id: 'a', tanggal: '2026-01-20' })]
    const salinan = [...asli]
    urutkanMutasi(asli)
    expect(asli).toEqual(salinan)
  })

  it('tidak melempar untuk tanggal yang tidak terbaca', () => {
    const rusak = m({ id: 'x', tanggal: 'bukan-tanggal' })
    const sah = m({ id: 'y', tanggal: '2026-03-01' })
    expect(() => urutkanMutasi([rusak, sah])).not.toThrow()
  })
})

describe('saldoTerkiniPerBarang', () => {
  // Regresi inti: transaksi bertanggal mundur tidak boleh menimpa saldo
  // transaksi yang tanggalnya lebih baru.
  it('mengabaikan baris backdated yang diinput belakangan', () => {
    const rows = [
      m({ id: '1', tanggal: '2026-01-10', jenis: 'Masuk', jumlah: 100, stok_saldo: 100 }),
      m({ id: '2', tanggal: '2026-01-20', jenis: 'Keluar', jumlah: 30, stok_saldo: 70 }),
      // Diinput hari ini, tetapi bertanggal 5 Januari (paling lama).
      m({ id: '3', tanggal: '2026-01-05', jenis: 'Masuk', jumlah: 5, stok_saldo: 5, created_at: '2026-10-23T10:00:00Z' }),
    ]
    const terkini = saldoTerkiniPerBarang(rows).get('kertas a4')
    expect(terkini?.id).toBe('2')
    expect(terkini?.stok_saldo).toBe(70)
  })

  it('memisahkan barang berdasarkan nama (tidak peka huruf besar/kecil)', () => {
    const rows = [
      m({ id: '1', tanggal: '2026-01-01', nama_barang: 'Kertas A4', stok_saldo: 10 }),
      m({ id: '2', tanggal: '2026-01-02', nama_barang: '  kertas a4 ', stok_saldo: 8 }),
      m({ id: '3', tanggal: '2026-01-01', nama_barang: 'Tinta', stok_saldo: 3 }),
    ]
    const terkini = saldoTerkiniPerBarang(rows)
    expect(terkini.size).toBe(2)
    expect(terkini.get('kertas a4')?.stok_saldo).toBe(8)
    expect(terkini.get('tinta')?.stok_saldo).toBe(3)
  })

  it('mengabaikan nama barang kosong', () => {
    const rows = [m({ id: '1', tanggal: '2026-01-01', nama_barang: '   ' })]
    expect(saldoTerkiniPerBarang(rows).size).toBe(0)
  })
})

describe('hitungSaldoBerjalan', () => {
  it('menjumlahkan masuk dan mengurangkan keluar sesuai urutan tanggal', () => {
    const rows = [
      m({ id: '1', tanggal: '2026-01-01', jenis: 'Masuk', jumlah: 100 }),
      m({ id: '2', tanggal: '2026-01-05', jenis: 'Keluar', jumlah: 40 }),
      m({ id: '3', tanggal: '2026-01-09', jenis: 'Masuk', jumlah: 10 }),
    ]
    expect(hitungSaldoBerjalan(rows)).toBe(70)
  })

  it('mengembalikan 0 untuk daftar kosong', () => {
    expect(hitungSaldoBerjalan([])).toBe(0)
  })
})

describe('daftarStokKritis', () => {
  it('menyertakan barang yang saldonya <= minimum', () => {
    const rows = [
      m({ id: '1', tanggal: '2026-01-01', nama_barang: 'Kertas', stok_saldo: 5, stok_minimum: 5 }),
      m({ id: '2', tanggal: '2026-01-01', nama_barang: 'Tinta', stok_saldo: 50, stok_minimum: 10 }),
    ]
    expect(daftarStokKritis(rows).map((r) => r.nama_barang)).toEqual(['Kertas'])
  })

  it('mengabaikan barang yang tidak dipantau (minimum 0 atau kosong)', () => {
    const rows = [
      m({ id: '1', tanggal: '2026-01-01', nama_barang: 'Kertas', stok_saldo: 0, stok_minimum: 0 }),
      m({ id: '2', tanggal: '2026-01-01', nama_barang: 'Tinta', stok_saldo: 0, stok_minimum: null }),
    ]
    expect(daftarStokKritis(rows)).toEqual([])
  })

  it('memakai saldo dari mutasi bertanggal terakhir, bukan input terakhir', () => {
    const rows = [
      m({ id: '1', tanggal: '2026-01-10', nama_barang: 'Kertas', stok_saldo: 100, stok_minimum: 20 }),
      m({ id: '2', tanggal: '2026-01-20', nama_barang: 'Kertas', jenis: 'Keluar', jumlah: 95, stok_saldo: 5, stok_minimum: 20 }),
      // Backdated, diinput belakangan: saldonya 90 (menimpa bila salah urut).
      m({ id: '3', tanggal: '2026-01-02', nama_barang: 'Kertas', stok_saldo: 90, stok_minimum: 20, created_at: '2026-10-23T10:00:00Z' }),
    ]
    const kritis = daftarStokKritis(rows)
    expect(kritis).toHaveLength(1)
    expect(kritis[0].stok_saldo).toBe(5)
  })
})
