import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/user/auth/login`
  const cookie = req.headers.get('cookie') || ''
  
  try {
    const body = await req.text()
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        'content-type': 'application/json'
      },
      body,
    })
    
    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    
    // Parse the response to get user data
    let responseData
    try {
      responseData = JSON.parse(text)
      console.log('Backend login response:', responseData)
    } catch {
      // If response is not JSON, return as-is
      return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
    }
    
    // Handle different backend response formats
    let accessToken, user
    
    // Check for your backend format: { data: { user, access_token } }
    if (responseData.data && responseData.data.user && responseData.data.access_token) {
      accessToken = responseData.data.access_token
      user = responseData.data.user
      console.log('Detected your backend format with data wrapper')
    }
    // Check for standard format: { accessToken, user }
    else if (responseData.accessToken && responseData.user) {
      accessToken = responseData.accessToken
      user = responseData.user
      console.log('Detected standard format')
    }
    
    // If login was successful and we have the data, set cookies
    if (res.ok && accessToken && user) {
      console.log('Setting cookies with user data:', user)
      const response = NextResponse.json(responseData, { status: res.status })
      
      // Set HTTP-only cookies for server-side authentication
      response.cookies.set('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      })
      
      response.cookies.set('user_data', JSON.stringify(user), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      })
      
      return response
    }
    
    // Return original response if not successful
    return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}

export const runtime = 'nodejs'

