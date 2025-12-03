import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/user/profile/getProfile`
  const cookie = req.headers.get('cookie') || ''
  const auth = req.headers.get('authorization') || ''
  const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
  const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
  const accessToken = await getAccessTokenFromCookies()
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(cookie && { Cookie: cookie }),
        ...(auth && { Authorization: auth }),
        ...(accessToken && !auth ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      cache: 'no-store',
    })
    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    if (res.status === 404 || res.status === 429) {
      const user = await getCurrentUserFromCookies()
      const fullName = user?.full_name || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email?.split('@')[0] || 'User'
      const profileFallback = {
        id: user?._id || user?.id || 'client-user',
        full_name: fullName,
        email: user?.email || '',
        company: user?.company ?? null,
        plan: user?.plan || 'free',
        plan_expiry: user?.plan_expiry ?? null,
        credits_find: user?.credits_find ?? 0,
        credits_verify: user?.credits_verify ?? 0
      }
      return NextResponse.json(profileFallback, { status: 200 })
    }
    return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}

export const runtime = 'nodejs'
