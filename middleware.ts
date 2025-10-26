import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from './lib/auth'

export default async function middleware(request: NextRequest) {
  const session = await auth()
  
  const isLoginPage = request.nextUrl.pathname === '/login'
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')
  
  // Allow API routes (they handle their own auth)
  if (isApiRoute) {
    return NextResponse.next()
  }
  
  // Redirect to login if not authenticated
  if (!session && !isLoginPage) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }
  
  // Redirect to queue if already logged in and trying to access login
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/queue', request.url))
  }
  
  // Check if password reset is required
  if (session?.user?.mustResetPassword && request.nextUrl.pathname !== '/reset-password') {
    return NextResponse.redirect(new URL('/reset-password', request.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|r2-footer.svg).*)',
  ],
}

