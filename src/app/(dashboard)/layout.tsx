import { DashboardLayout } from '@/components/dashboard-layout'
import { getProfileData } from '@/lib/profile'
import { getCurrentUserFromCookies } from '@/lib/auth-server'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

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
    console.log('No user session found server-side, proceeding with client auth...')
    // Return the layout with minimal data, client will handle auth
    return (
      <DashboardLayout userProfile={{
        full_name: 'Guest User', // More appropriate message for non-authenticated users
        credits: 0,
        email: 'Please log in',
        company: null,
        plan: 'free',
        plan_expiry: null,
        credits_find: 0,
        credits_verify: 0
      }}>
        {children}
      </DashboardLayout>
    )
  }
  
  // User found via cookies, proceed normally
  // Try to fetch full profile data from backend
  let fullProfile = null
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
        console.log('Full profile from backend:', fullProfile)
      }
    }
  } catch (error) {
    console.error('Failed to fetch full profile:', error)
  }
  
  // Use the user data from cookies to create the profile
  // Backend returns: { _id, email, firstName, lastName } (your backend format)
  // Frontend expects: { full_name, email, credits, etc. }
  const userProfile = {
    full_name: fullProfile?.full_name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.full_name || user.email?.split('@')[0] || 'User',
    credits: (fullProfile?.credits_find || user.credits_find || 0) + (fullProfile?.credits_verify || user.credits_verify || 0),
    email: fullProfile?.email || user.email || '',
    company: fullProfile?.company ?? user.company ?? null,
    plan: fullProfile?.plan || user.plan || 'free',
    plan_expiry: fullProfile?.plan_expiry ?? user.plan_expiry ?? null,
    credits_find: fullProfile?.credits_find ?? user.credits_find ?? 0,
    credits_verify: fullProfile?.credits_verify ?? user.credits_verify ?? 0
  }

  return (
    <DashboardLayout userProfile={userProfile}>
      {children}
    </DashboardLayout>
  )
}
