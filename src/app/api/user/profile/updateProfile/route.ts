import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/user/profile/updateProfile`
  const cookie = req.headers.get('cookie') || ''
  const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
  const accessToken = await getAccessTokenFromCookies()
  try {
    const body = await req.text()
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'content-type': 'application/json'
      },
      body,
    })
    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}

export const runtime = 'nodejs'