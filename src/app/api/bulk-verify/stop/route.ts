import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
    const url = `${backend}/api/bulk-verify/stop`
    const cookie = request.headers.get('cookie') || ''
    const auth = request.headers.get('authorization') || ''
    const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
    const accessToken = await getAccessTokenFromCookies()

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(auth ? { Authorization: auth } : {}),
        ...(accessToken && !auth ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    })

    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}