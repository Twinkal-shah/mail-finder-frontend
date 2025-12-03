import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/email/verifyEmail`
  const cookie = req.headers.get('cookie') || ''
  const auth = req.headers.get('authorization') || ''
  const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
  const accessToken = await getAccessTokenFromCookies()
  
  try {
    const inboundType = req.headers.get('content-type') || ''
    let outBody: string
    let outType: string
    if (inboundType.includes('application/json')) {
      const json = await req.json() as { email?: string }
      const params = new URLSearchParams()
      if (json.email) params.set('email', json.email)
      outBody = params.toString()
      outType = 'application/x-www-form-urlencoded'
    } else {
      outBody = await req.text()
      outType = inboundType || 'application/x-www-form-urlencoded'
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(auth ? { Authorization: auth } : {}),
        ...(accessToken && !auth ? { Authorization: `Bearer ${accessToken}` } : {}),
        'content-type': outType
      },
      body: outBody,
    })
    
    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}

export const runtime = 'nodejs'
