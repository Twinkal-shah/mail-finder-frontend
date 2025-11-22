import { DashboardLayout } from '@/components/dashboard-layout'
import { getCurrentUserFromCookies } from '@/lib/auth-server'
import { cookies } from 'next/headers'
import { apiGet } from '@/lib/api'

// Force dynamic rendering for all dashboard pages
export const dynamic = 'force-dynamic'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  // In server components, we need to handle the request differently
  // Let's use a simpler approach by fetching directly from backend
  const user = await getCurrentUserFromCookies()
  
  // Debug: Log the user data from cookies
  console.log('Server-side user from cookies:', user)
  
  // Debug: Check what cookies are actually present
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  console.log('All cookies:', allCookies.map(c => ({ name: c.name, value: c.value.substring(0, 50) + '...' })))
  
  // If no user found via cookies, don't redirect immediately
  // Let the client-side handle authentication
 if (!user) {
  return (
    <DashboardLayout userProfile={{
      full_name: '',
      email: '',
      company: null,
      plan: 'free',
      plan_expiry: null,

      // ⭐ Prevent flicker — do NOT initialize credits to 0
      credits: undefined as unknown as number,
      credits_find: undefined as unknown as number,
      credits_verify: undefined as unknown as number,
    }}>

        {children}
      </DashboardLayout>
    )
  }
  
  // User found via cookies, proceed normally
  // Try to fetch full profile data from backend
  let fullProfile = null
  let serverFind = 0
  let serverVerify = 0
  try {
    // Get access token from cookies to make authenticated request
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('access_token')?.value
    
    if (accessToken) {
      console.log('Fetching full profile from backend...')
      const profileRes = await fetch(`${process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'}/api/user/profile/getProfile`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': cookieStore.toString()
        },
        cache: 'no-store'
      })
      
      if (profileRes.ok) {
        fullProfile = await profileRes.json()
      }
    }
    const creditsRes = await apiGet<Record<string, unknown>>('/api/user/credits', { useProxy: true })
    if (creditsRes.ok && creditsRes.data) {
      const d = creditsRes.data as Record<string, unknown>
      serverFind = Number(d['credits_find'] ?? d['find'] ?? 0)
      serverVerify = Number(d['credits_verify'] ?? d['verify'] ?? 0)
    }
  } catch (error) {
    console.error('Failed to fetch full profile:', error)
  }
  
  // Use the user data from cookies to create the profile
  // Backend returns: { _id, email, firstName, lastName } (your backend format)
  // Frontend expects: { full_name, email, credits, etc. }
if (!serverFind && !serverVerify) {
  serverFind = Number(fullProfile?.credits_find ?? user.credits_find ?? 0)
  serverVerify = Number(fullProfile?.credits_verify ?? user.credits_verify ?? 0)
}

  const userProfile = {
    full_name: fullProfile?.full_name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.full_name || null,
    credits: serverFind + serverVerify,
    email: fullProfile?.email || user.email || '',
    company: fullProfile?.company ?? user.company ?? null,
    plan: fullProfile?.plan || user.plan || 'free',
    plan_expiry: fullProfile?.plan_expiry ?? user.plan_expiry ?? null,
    credits_find: serverFind,
    credits_verify: serverVerify
  }

  return (
    <DashboardLayout userProfile={userProfile}>
      {children}
    </DashboardLayout>
  )
}
