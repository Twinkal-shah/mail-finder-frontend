import { DashboardLayout } from '@/components/dashboard-layout'
import { getProfileData } from '@/lib/profile'
import { getCurrentUserFromCookies } from '@/lib/auth-server'

// Force dynamic rendering for all dashboard pages
export const dynamic = 'force-dynamic'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUserFromCookies()
  
  // If no user found via cookies, don't redirect immediately
  // Let the client-side handle authentication
  if (!user) {
    console.log('No user session found server-side, proceeding with client auth...')
    // Return the layout with minimal data, client will handle auth
    return (
      <DashboardLayout userProfile={{
        full_name: 'Loading...',
        credits: 0,
        email: '',
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
  const profile = await getProfileData(user.id)
  
  // If no Supabase profile found, proceed with a minimal fallback profile
  const userProfile = profile ? {
    full_name: profile.full_name || profile.email?.split('@')[0] || 'User',
    credits: (profile.credits_find || 0) + (profile.credits_verify || 0),
    email: profile.email || user.email || '',
    company: profile.company ?? null,
    plan: profile.plan || 'free',
    plan_expiry: profile.plan_expiry ?? null,
    credits_find: profile.credits_find ?? 0,
    credits_verify: profile.credits_verify ?? 0
  } : {
    full_name: user.email?.split('@')[0] || 'User',
    credits: 0,
    email: user.email,
    company: null,
    plan: 'free',
    plan_expiry: null,
    credits_find: 0,
    credits_verify: 0
  }

  return (
    <DashboardLayout userProfile={userProfile}>
      {children}
    </DashboardLayout>
  )
}
