import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/user/me`
  const cookie = req.headers.get('cookie') || ''
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        'content-type': 'application/json'
      },
      credentials: 'include'
    })
    
    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    
    return new NextResponse(text, { 
      status: res.status, 
      headers: { 
        'content-type': contentType,
        // Forward cookies from backend
        ...(res.headers.get('set-cookie') ? { 'set-cookie': res.headers.get('set-cookie')! } : {})
      } 
    })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}

export const runtime = 'nodejs'