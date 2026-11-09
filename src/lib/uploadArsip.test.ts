import { describe, expect, it } from 'vitest'
import {
  ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  fileExtension,
  formatBytes,
  validateUploadFile,
} from '@/lib/uploadArsip'

describe('fileExtension', () => {
  it('mengambil ekstensi huruf kecil', () => {
    expect(fileExtension('Laporan.PDF')).toBe('.pdf')
    expect(fileExtension('a.b.c.DocX')).toBe('.docx')
  })

  it('mengembalikan string kosong bila tanpa ekstensi', () => {
    expect(fileExtension('tanpaekstensi')).toBe('')
  })
})

describe('validateUploadFile', () => {
  const make = (name: string, size: number, type = 'application/pdf') => ({ name, size, type })

  it('menerima berkas 50 MB (batas penuh) — dulu ditolak Vercel di 4,5 MB', () => {
    expect(validateUploadFile(make('rkk.pdf', MAX_UPLOAD_BYTES))).toEqual({ ok: true })
  })

  it('menolak berkas melebihi 50 MB dengan pesan ukuran', () => {
    const hasil = validateUploadFile(make('besar.pdf', MAX_UPLOAD_BYTES + 1))
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.error).toMatch(/melebihi batas/i)
  })

  it('menolak berkas kosong', () => {
    const hasil = validateUploadFile(make('kosong.pdf', 0))
    expect(hasil.ok).toBe(false)
    if (!hasil.ok) expect(hasil.error).toMatch(/kosong/i)
  })

  it('menolak ekstensi berbahaya walau mengaku PDF', () => {
    for (const ext of BLOCKED_EXTENSIONS) {
      const hasil = validateUploadFile(make(`jahat${ext}`, 1024))
      expect(hasil.ok).toBe(false)
    }
  })

  it('menolak ekstensi tak dikenal', () => {
    const hasil = validateUploadFile(make('data.exe.bak.unknownext', 1024))
    expect(hasil.ok).toBe(false)
  })

  it('menerima semua ekstensi yang diizinkan', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(validateUploadFile(make(`dokumen${ext}`, 2048)).ok).toBe(true)
    }
  })

  it('menolak berkas tanpa ekstensi', () => {
    expect(validateUploadFile(make('dokumen', 2048)).ok).toBe(false)
  })
})

describe('formatBytes', () => {
  it('memformat satuan dengan wajar', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
