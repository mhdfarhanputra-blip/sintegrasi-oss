import { describe, expect, it } from 'vitest'
import { folderTersusun, namaBerkasTersusun, subFolderAset } from '@/lib/namaAset'

/**
 * Penamaan berkas & folder.
 *
 * Prinsip yang dijaga:
 *   - NAMA ASLI DIPERTAHANKAN (nomor dokumen / judul SK tidak boleh hilang)
 *   - Awalan modul + cap waktu + pembeda acak agar urut dan tidak bentrok
 *   - Karakter pembentuk jalur dibersihkan (anti path traversal)
 */
describe('namaBerkasTersusun — nama asli dipertahankan', () => {
  it('mempertahankan judul dokumen yang informatif', () => {
    const nama = namaBerkasTersusun('DIPA', null, 'RINCIAN KERTAS KERJA SATKER (1).pdf')
    expect(nama).toContain('RINCIAN KERTAS KERJA SATKER (1)')
    expect(nama.startsWith('DIPA-')).toBe(true)
    expect(nama.endsWith('.pdf')).toBe(true)
  })

  it('mempertahankan nomor dokumen pada nama berkas', () => {
    const nama = namaBerkasTersusun('SK', null, 'SK Penetapan Penempatan Pegawai TA 2026.pdf')
    expect(nama).toContain('SK Penetapan Penempatan Pegawai TA 2026')
  })

  it('TIDAK lagi memakai penanda TANPA-KODE yang tidak informatif', () => {
    const nama = namaBerkasTersusun('DIPA', null, 'dokumen.pdf')
    expect(nama).not.toContain('TANPA-KODE')
    expect(nama).not.toContain('DOK-DIPA')
  })

  it('memakai kode aset bila nama asli terlalu pendek', () => {
    const nama = namaBerkasTersusun('BMN', '3.02.01.02.003', 'a.jpg')
    expect(nama).toContain('3.02.01.02.003')
  })

  it('membersihkan karakter pembentuk jalur (anti traversal)', () => {
    const nama = namaBerkasTersusun('BMN', null, '../../etc/passwd.pdf')
    expect(nama).not.toContain('/')
    expect(nama).not.toContain('..')
  })

  it('mempertahankan ekstensi asli dalam huruf kecil', () => {
    expect(namaBerkasTersusun('BMN', 'X', 'FOTO.JPEG').endsWith('.jpeg')).toBe(true)
    expect(namaBerkasTersusun('BMN', 'X', 'FOTO.PNG').endsWith('.png')).toBe(true)
  })

  it('menghasilkan nama berbeda untuk unggahan berulang pada detik yang sama', () => {
    const a = namaBerkasTersusun('BMN', '3.02.01', 'foto.jpg')
    const b = namaBerkasTersusun('BMN', '3.02.01', 'foto.jpg')
    expect(a).not.toBe(b)
  })

  it('nama memuat cap waktu sehingga mudah diurutkan', () => {
    const nama = namaBerkasTersusun('BMN', '3.02.01.02.003', 'IMG_001.jpg')
    expect(nama).toMatch(/^BMN-\d{8}-\d{6}-[a-z0-9]{6}-/)
  })
})

describe('folderTersusun', () => {
  it('menyusun folder per modul/tahun/bulan', () => {
    const d = new Date('2026-10-21T10:00:00Z')
    expect(folderTersusun('BMN', d)).toBe('Sintegrasi/BMN/2026/10')
  })

  it('memberi bulan dua digit', () => {
    const d = new Date('2026-01-05T10:00:00Z')
    expect(folderTersusun('sk', d)).toContain('/2026/01')
  })
})

describe('subFolderAset', () => {
  it('mengembalikan kode aset yang bersih', () => {
    expect(subFolderAset('3.02.01.02.003')).toBe('3.02.01.02.003')
  })

  it('mengembalikan null untuk kode kosong', () => {
    expect(subFolderAset('')).toBeNull()
    expect(subFolderAset(null)).toBeNull()
    expect(subFolderAset(undefined)).toBeNull()
  })

  it('membuang karakter pembentuk jalur', () => {
    expect(subFolderAset('../..')).toBeNull()
  })
})
