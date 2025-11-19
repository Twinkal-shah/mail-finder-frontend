import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
  const url = `${backend}/api/user/credits`
  const cookie = req.headers.get('cookie') || ''
  const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
  try {
    const creditsProfileRes = await fetch('http://localhost:3000/api/user/profile/credits', {
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : {},
      cache: 'no-store',
    })
    if (creditsProfileRes.ok) {
      const cd = await creditsProfileRes.json()
      const find = Number(cd.credits_find ?? cd.find ?? cd.findCredits ?? cd.data?.credits_find ?? 0)
      const verify = Number(cd.credits_verify ?? cd.verify ?? cd.verifyCredits ?? cd.data?.credits_verify ?? 0)
      return NextResponse.json({ credits_find: find, credits_verify: verify, find, verify, total_credits: find + verify })
    }

    const profileRes = await fetch('http://localhost:3000/api/user/profile/getProfile', {
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : {},
      cache: 'no-store',
    })
    if (profileRes.ok) {
      const d = await profileRes.json()
      const find = Number(d.credits_find ?? d.find ?? d.findCredits ?? d.data?.credits_find ?? 0)
      const verify = Number(d.credits_verify ?? d.verify ?? d.verifyCredits ?? d.data?.credits_verify ?? 0)
      return NextResponse.json({ credits_find: find, credits_verify: verify, find, verify, total_credits: find + verify })
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : {},
      cache: 'no-store',
    })
    const contentType = res.headers.get('content-type') || 'application/json'
    const text = await res.text()
    if (res.status === 404 || res.status === 429) {
      const user = await getCurrentUserFromCookies()
      const find = Number(user?.credits_find ?? 0)
      const verify = Number(user?.credits_verify ?? 0)
      return NextResponse.json({
        credits_find: find,
        credits_verify: verify,
        find,
        verify,
        total_credits: find + verify
      }, { status: 200 })
    }
    return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
  } catch (error) {
    return NextResponse.json({ error: 'Proxy error', message: (error as Error).message }, { status: 500 })
  }
}

export const runtime = 'nodejs'