import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/user/auth/refresh`
  const cookie = req.headers.get('cookie') || ''
  const refreshToken = req.headers.get('refreshtoken') || ''
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(refreshToken ? { refreshtoken: refreshToken } : {}),
      },
      cache: 'no-store',
    })
    
    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    
    // Parse the response to get tokens
    let responseData
    try {
      responseData = JSON.parse(text)
    } catch {
      return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
    }
    
    // Handle different backend response formats
    let accessToken, refreshTokenNew
    
    if (responseData.data && responseData.data.access_token) {
      accessToken = responseData.data.access_token
      refreshTokenNew = responseData.data.refresh_token
    } else if (responseData.accessToken) {
      accessToken = responseData.accessToken
      refreshTokenNew = responseData.refreshToken
    }
    
    // If refresh was successful, update cookies
    if (res.ok && accessToken) {
      const response = NextResponse.json(responseData, { status: res.status })
      
      // Update access token cookie
      response.cookies.set('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      })
      
      // Update refresh token cookie if provided
      if (refreshTokenNew) {
        response.cookies.set('refresh_token', refreshTokenNew, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30 // 30 days
        })
      }
      
      return response
    }
    
    return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}

export const runtime = 'nodejs'