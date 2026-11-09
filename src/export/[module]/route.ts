import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { EXPORT_TABLES, canAccessModule, normalizeModuleKey } from '@/lib/access'
import { checkRateLimit } from '@/lib/rateLimit'
import { internalApiError } from '@/lib/apiError'
import { STATUS_TAMPIL_LAPORAN } from '@/lib/verifikasi'

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  let str = String(value).replace(/"/g, '""')
  if (/^[=+\-@]/.test(str)) str = `'${str}`
  return `"${str}"`
}

export async function GET(request: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module } = await params
  const moduleKey = normalizeModuleKey(module)
  if (!moduleKey || !(moduleKey in EXPORT_TABLES)) {
    return NextResponse.json({ error: 'Modul tidak valid' }, { status: 400 })
  }
  const table = EXPORT_TABLES[moduleKey as keyof typeof EXPORT_TABLES]

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(c) {
          c.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 401 })
  }
  if (!checkRateLimit(`export:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Terlalu banyak ekspor, coba lagi sebentar' }, { status: 429 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.status !== 'Aktif') {
    return NextResponse.json({ error: 'Akun Anda belum aktif' }, { status: 403 })
  }
  if (!canAccessModule(profile?.role, moduleKey) || profile?.role === 'Pengusul') {
    return NextResponse.json({ error: 'Role Anda tidak memiliki akses ekspor modul ini' }, { status: 403 })
  }

  // Hanya data yang SUDAH DISETUJUI yang boleh diekspor.
  //
  // BUG yang diperbaiki: ekspor mengambil seluruh baris tanpa penyaringan,
  // sehingga data 'draft' (masih diisi) dan 'ditolak' (sudah dinyatakan salah
  // Admin) ikut terunduh dan dapat diolah lebih lanjut di luar aplikasi —
  // risiko pelaporan ganda/angka keliru yang lebih besar daripada sekadar
  // tampilan, karena berkasnya terpisah dari sistem.
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('status_verifikasi', STATUS_TAMPIL_LAPORAN)
  if (error) {
    return internalApiError(`Export ${moduleKey} GET`, error)
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Tidak ada data' }, { status: 404 })
  }

  const headers = Object.keys(data[0])
  const csvRows = [headers.join(',')]
  data.forEach((row) => {
    csvRows.push(headers.map((h) => escapeCsvValue(row[h])).join(','))
  })
  const csv = '\ufeff' + csvRows.join('\r\n')
  const filename = `${moduleKey}_${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
