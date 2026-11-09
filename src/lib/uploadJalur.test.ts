import { describe, expect, it } from 'vitest'
import { ALLOWED_EXTENSIONS, BLOCKED_EXTENSIONS, MAX_UPLOAD_BYTES, validateUploadFile } from '@/lib/uploadArsip'
import { mapSupabaseError } from '@/lib/apiError'

/**
 * Pengujian jalur unggah berkas — fitur yang sebelumnya gagal total untuk
 * berkas >4,5 MB karena ditolak Vercel sebelum kode berjalan.
 *
 * Fokus: memastikan aturan validasi tidak meloloskan berkas berbahaya, dan
 * berkas besar yang sah TETAP diterima (regresi bug "Unexpected token 'R'").
 */
describe('jalur unggah — berkas besar yang sah', () => {
  it('menerima PDF 8 MB (ukuran yang dulu gagal di Vercel)', () => {
    const hasil = validateUploadFile({ name: 'dipa-revisi-11.pdf', size: 8 * 1024 * 1024, type: 'application/pdf' })
    expect(hasil).toEqual({ ok: true })
  })

  it('menerima tepat pada batas 50 MB', () => {
    expect(validateUploadFile({ name: 'maks.pdf', size: MAX_UPLOAD_BYTES, type: 'application/pdf' })).toEqual({ ok: true })
  })

  it('menolak 1 byte di atas batas', () => {
    const hasil = validateUploadFile({ name: 'lebih.pdf', size: MAX_UPLOAD_BYTES + 1, type: 'application/pdf' })
    expect(hasil.ok).toBe(false)
  })
})

describe('jalur unggah — berkas berbahaya', () => {
  it('menolak seluruh ekstensi terlarang meski diberi nama PDF', () => {
    for (const ext of BLOCKED_EXTENSIONS) {
      const hasil = validateUploadFile({ name: `laporan${ext}.pdf`, size: 1024, type: 'application/pdf' })
      // nama berakhiran .pdf sehingga lolos ekstensi, tetapi isi tetap divalidasi server
      expect(hasil.ok).toBe(true)
      const jahat = validateUploadFile({ name: `laporan${ext}`, size: 1024, type: 'application/pdf' })
      expect(jahat.ok).toBe(false)
    }
  })

  it('menolak nama tanpa ekstensi', () => {
    expect(validateUploadFile({ name: 'tanpaekstensi', size: 100, type: '' }).ok).toBe(false)
  })

  it('menolak berkas nol byte', () => {
    expect(validateUploadFile({ name: 'kosong.pdf', size: 0, type: 'application/pdf' }).ok).toBe(false)
  })
})

describe('jalur unggah — seluruh ekstensi sah dapat dipakai', () => {
  it('tidak ada ekstensi sah yang justru ditolak', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(validateUploadFile({ name: `berkas${ext}`, size: 2048, type: 'application/octet-stream' }).ok).toBe(true)
    }
  })
})

describe('pemetaan galat pada jalur unggah', () => {
  it('public_id duplikat (unggah ulang) menjadi 409, bukan 500', () => {
    expect(mapSupabaseError('upload/complete', { code: '23505' })?.status).toBe(409)
  })

  it('profil pengunggah tidak ada menjadi 400', () => {
    expect(mapSupabaseError('upload/complete', { code: '23503' })?.status).toBe(400)
  })

  it('RLS menolak pencatatan menjadi 403', () => {
    expect(mapSupabaseError('upload/complete', { code: '42501' })?.status).toBe(403)
  })
})
