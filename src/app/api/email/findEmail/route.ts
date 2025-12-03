import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/email/findEmail`
  const cookie = req.headers.get('cookie') || ''
  const auth = req.headers.get('authorization') || ''
  const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
  const accessToken = await getAccessTokenFromCookies()
  
  try {
    const inboundType = req.headers.get('content-type') || ''
    let outBody: string
    let outType: string
    if (inboundType.includes('application/json')) {
      const json = await req.json() as { full_name?: string; domain?: string; role?: string; first_name?: string; last_name?: string }
      let first = ''
      let last = ''
      if (json.first_name || json.last_name) {
        first = (json.first_name || '').trim()
        last = (json.last_name || '').trim()
      } else if (json.full_name) {
        const parts = json.full_name.trim().split(/\s+/)
        first = parts[0] || ''
        last = parts.slice(1).join(' ') || ''
      }
      const params = new URLSearchParams()
      if (json.domain) params.set('domain', json.domain.trim())
      if (first) params.set('first_name', first)
      if (last) params.set('last_name', last)
      const roleTrimmed = (json.role || '').trim()
      const roleLower = roleTrimmed.toLowerCase()
      if (roleTrimmed && roleLower !== 'undefined' && roleLower !== '$undefined' && roleLower !== 'null' && roleLower !== 'none') {
        params.set('role', roleTrimmed)
      }
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
