import { createServerSupabase } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cache } from 'react'

export interface CurrentUser {
  id: string
  email: string
  nama: string
  role: string
  status: string
}

const DEFAULT_ROLE = 'Pengusul'
const DEFAULT_STATUS = 'Pending'
const DEFAULT_NAMA = 'Pengguna'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * Buat baris profil baru lewat service-role (bypass RLS) agar user
 * yang baru verifikasi email langsung punya entri Pending, konsisten di middleware,
 * halaman pending, dan dashboard.
 */
async function ensureProfile(id: string, email: string, nama: string) {
  const db = adminClient()
  const { data: existing } = await db
    .from('profiles')
    .select('id, email, nama, role, status')
    .eq('id', id)
    .maybeSingle()
  if (existing) return existing

  // Upsert agar aman terhadap race saat middleware dan page memanggil
  // bersamaan pada login pertama. ignoreDuplicates=false supaya row
  // existing tetap dikembalikan tanpa menimpa role/status yang mungkin
  // sudah diubah admin.
  const fallbackNama = nama || (email ? email.split('@')[0] : DEFAULT_NAMA)
  const { data: upserted } = await db
    .from('profiles')
    .upsert(
      {
        id,
        email,
        nama: fallbackNama,
        role: DEFAULT_ROLE,
        status: DEFAULT_STATUS,
      },
      { onConflict: 'id', ignoreDuplicates: false },
    )
    .select('id, email, nama, role, status')
    .single()
  return upserted
}

/**
 * Ambil user aktif dari sesi Supabase. Auto-create profil bila belum ada.
 * Mengembalikan null jika belum login.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const nama =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split('@')[0] ??
    DEFAULT_NAMA

  const profile = await ensureProfile(user.id, user.email ?? '', nama)
  if (!profile) return null

  return {
    id: profile.id,
    email: profile.email,
    nama: profile.nama,
    role: profile.role,
    status: profile.status,
  }
})
