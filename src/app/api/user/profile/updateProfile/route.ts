import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/user/profile/updateProfile`

  const cookie = req.headers.get('cookie') || ''
  const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
  const accessToken = await getAccessTokenFromCookies()

  try {
    // Must parse JSON properly
    const jsonBody = await req.json()
    console.log("📤 PROXY SENDING BODY:", jsonBody);   // 👈 ADD THIS

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(jsonBody), // Correct JSON forwarding
    })

    const text = await res.text()
    const contentType = res.headers.get('content-type') || 'application/json'

    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': contentType }
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Proxy error', message: (error as Error).message },
      { status: 500 }
    )
  }
}

export const runtime = 'nodejs'
