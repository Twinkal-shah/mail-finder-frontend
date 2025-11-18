import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
    const url = `${backend}/api/bulk-finder/jobs`
    
    // Forward the request to the backend with authentication
    const cookie = request.headers.get('cookie') || ''
    const body = await request.json()
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: JSON.stringify(body)
    })
    
    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    
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