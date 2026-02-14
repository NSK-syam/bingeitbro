import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Keep auth/session on a single origin so users stay signed in consistently.
  const host = request.headers.get('host')?.toLowerCase() ?? '';
  if (host === 'www.bingeitbro.com') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.host = 'bingeitbro.com';
    redirectUrl.protocol = 'https';
    return NextResponse.redirect(redirectUrl, 308);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    // Match app paths except static files and API routes.
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
