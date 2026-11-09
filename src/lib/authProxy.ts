import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccessModule, moduleForPath } from '@/lib/access'

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/auth/callback']
const PUBLIC_PREFIXES = ['/track/']

export async function authProxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return supabaseResponse
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (!user && !PUBLIC_ROUTES.includes(pathname) && pathname !== '/pending') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && !PUBLIC_ROUTES.includes(pathname) && pathname !== '/pending') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.status !== 'Aktif') {
      return NextResponse.redirect(new URL('/pending', request.url))
    }

    if (profile?.role === 'Pengusul' && pathname === '/') {
      return NextResponse.redirect(new URL('/utilitas', request.url))
    }

    const routeModule = moduleForPath(pathname)
    if (routeModule && !canAccessModule(profile?.role, routeModule)) {
      return NextResponse.redirect(new URL(profile?.role === 'Pengusul' ? '/utilitas' : '/', request.url))
    }
  }

  return supabaseResponse
}
