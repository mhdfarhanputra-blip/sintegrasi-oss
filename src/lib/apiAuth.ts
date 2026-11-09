import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser, type CurrentUser } from '@/lib/getCurrentUser'
import { canAccessModule, type ModuleKey } from '@/lib/access'

export type ApiAuthResult =
  | { me: CurrentUser; supabase: Awaited<ReturnType<typeof createServerSupabase>> }
  | { response: NextResponse }

export async function requireActiveUser(): Promise<ApiAuthResult> {
  const me = await getCurrentUser()
  if (!me) {
    return { response: NextResponse.json({ error: 'Belum masuk' }, { status: 401 }) }
  }
  if (me.status !== 'Aktif') {
    return { response: NextResponse.json({ error: 'Akun belum aktif' }, { status: 403 }) }
  }
  return { me, supabase: await createServerSupabase() }
}

export async function requireModuleAccess(module: ModuleKey): Promise<ApiAuthResult> {
  const auth = await requireActiveUser()
  if ('response' in auth) return auth
  if (!canAccessModule(auth.me.role, module)) {
    return { response: NextResponse.json({ error: 'Role Anda tidak memiliki akses modul ini' }, { status: 403 }) }
  }
  return auth
}
