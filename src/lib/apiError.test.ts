import { describe, expect, it } from 'vitest'
import { mapSupabaseError, safeJson } from '@/lib/apiError'

/**
 * Pengujian pemetaan galat Supabase.
 *
 * Tujuan: klien menerima status HTTP yang benar (404/409/400/403), bukan 500
 * untuk kondisi yang sebenarnya normal.
 */
describe('mapSupabaseError', () => {
  it('memetakan PGRST116 (tidak ada baris) ke 404', async () => {
    const res = mapSupabaseError('uji', { code: 'PGRST116', message: 'JSON object requested, 0 rows' })
    expect(res?.status).toBe(404)
  })

  it('memetakan pelanggaran unique ke 409', () => {
    expect(mapSupabaseError('uji', { code: '23505' })?.status).toBe(409)
  })

  it('memetakan foreign key ke 400', () => {
    expect(mapSupabaseError('uji', { code: '23503' })?.status).toBe(400)
  })

  it('memetakan not-null dan check ke 400', () => {
    expect(mapSupabaseError('uji', { code: '23502' })?.status).toBe(400)
    expect(mapSupabaseError('uji', { code: '23514' })?.status).toBe(400)
  })

  it('memetakan penolakan RLS ke 403', () => {
    expect(mapSupabaseError('uji', { code: '42501' })?.status).toBe(403)
  })

  it('kode tak dikenal menjadi 500 dengan requestId (bisa ditelusuri)', async () => {
    const res = mapSupabaseError('uji', { code: 'XX999' })
    expect(res?.status).toBe(500)
    const body = (await res?.json()) as { requestId?: string }
    expect(body.requestId).toBeTruthy()
  })

  it('mengembalikan null untuk galat yang tidak dikenali sebagai Supabase', () => {
    expect(mapSupabaseError('uji', new Error('jaringan putus'))).toBeNull()
    expect(mapSupabaseError('uji', null)).toBeNull()
  })

  it('tidak membocorkan pesan internal database ke klien', async () => {
    const res = mapSupabaseError('uji', { code: 'XX999', message: 'password=rahasia tabel=profiles' })
    const body = JSON.stringify(await res?.json())
    expect(body).not.toContain('rahasia')
    expect(body).not.toContain('profiles')
  })
})

describe('safeJson', () => {
  it('mengembalikan objek untuk body JSON sah', async () => {
    const req = new Request('https://contoh.test', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(await safeJson(req)).toEqual({ a: 1 })
  })

  it('mengembalikan null untuk body rusak (tidak melempar)', async () => {
    const req = new Request('https://contoh.test', {
      method: 'POST',
      body: '{bukan json',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(await safeJson(req)).toBeNull()
  })

  it('mengembalikan null untuk body kosong', async () => {
    const req = new Request('https://contoh.test', { method: 'POST', body: '' })
    expect(await safeJson(req)).toBeNull()
  })
})
