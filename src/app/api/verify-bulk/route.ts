import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const backend = process.env.LOCAL_URL || process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const urlPrimary = `${backend}/api/email/verifyBulkEmail`

  const cookie = req.headers.get('cookie') || ''
  const authHeader = req.headers.get('authorization') || ''
  const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
  const token = authHeader ? undefined : await getAccessTokenFromCookies()

  try {
    const incoming = await req.json().catch(async () => {
      const text = await req.text()
      try { return JSON.parse(text) } catch { return text }
    })
    const emails = Array.isArray(incoming)
      ? incoming as string[]
      : (typeof incoming === 'object' && Array.isArray((incoming as Record<string, unknown>)?.emails))
        ? ((incoming as Record<string, unknown>).emails as unknown[]).map(v => String(v))
        : []

    const payload = JSON.stringify({ emails })

    const res = await fetch(urlPrimary, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(token && !authHeader ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: payload,
    })

    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}