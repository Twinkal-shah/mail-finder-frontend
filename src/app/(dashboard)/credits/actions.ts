'use server'

import { cookies } from 'next/headers'
import { apiGet } from '@/lib/api'
import { LemonSqueezyWebhookEvent } from '@/lib/services/lemonsqueezy'

interface CreditUsage {
  date: string
  credits_used: number
}

interface CreditTransaction {
  created_at: string
  amount: number
}

interface Transaction {
  id: string
  user_id: string
  lemonsqueezy_order_id?: string
  lemonsqueezy_subscription_id?: string
  product_name: string
  product_type: string
  amount: number
  credits_find_added: number
  credits_verify_added: number
  status: string
  webhook_event: string
  metadata?: Record<string, unknown>
  created_at: string
}


// Get user profile with credits breakdown
export async function getUserProfileWithCredits() {
  try {
    // For server-side, we'll use the auth-server functions
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    
    if (!user) {
      console.log('No user found in cookies for getUserProfileWithCredits')
      return {
        id: 'client-user',
        email: '',
        full_name: null,
        plan: 'free',
        credits_find: 0,
        credits_verify: 0,
        total_credits: 0
      }
    }
    
    // Map user data from cookies to profile structure
    return {
      id: user.id || user._id || 'client-user',
      email: user.email || '',
      full_name: user.full_name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email?.split('@')[0] || null,
      plan: user.plan || 'free',
      credits_find: user.credits_find || 0,
      credits_verify: user.credits_verify || 0,
      total_credits: (user.credits_find || 0) + (user.credits_verify || 0)
    }
  } catch (error) {
    console.error('Error fetching user profile:', error)
    // Return minimal profile on error
    return {
      id: 'client-user',
      email: '',
      full_name: null,
      plan: 'free',
      credits_find: 0,
      credits_verify: 0,
      total_credits: 0
    }
  }
}

export async function getCreditUsageHistory(): Promise<CreditUsage[]> {
  try {
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return []
    }
    // Get credit usage from the last 30 days via backend transactions
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const res = await apiGet<CreditTransaction[]>('/api/user/credits/transactions', { useProxy: true })
    if (res.ok && Array.isArray(res.data)) {
      const usageByDate: { [key: string]: number } = {}
      ;(res.data as CreditTransaction[]).forEach((tx) => {
        const date = new Date(tx.created_at).toISOString().split('T')[0]
        const creditsUsed = Math.abs(Number(tx.amount))
        usageByDate[date] = (usageByDate[date] || 0) + (isNaN(creditsUsed) ? 0 : creditsUsed)
      })

      const result: CreditUsage[] = []
      const currentDate = new Date(thirtyDaysAgo)
      const today = new Date()
      while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split('T')[0]
        result.push({ date: dateStr, credits_used: usageByDate[dateStr] || 0 })
        currentDate.setDate(currentDate.getDate() + 1)
      }
      return result
    }

    return []
  } catch (error) {
    console.error('Error in getCreditUsageHistory:', error)
    return []
  }
}

export async function createLemonSqueezyCheckout(
  plan: 'pro' | 'agency' | 'lifetime' | 'credits',
  options?: { package?: '100k' | '50k' | '25k' | '10k'; variantId?: string }
) {
  const token = (await cookies()).get('access_token')?.value
  if (!token) {
    throw new Error('Not authenticated')
  }

  const url = `${process.env.NEXT_PUBLIC_SERVER_URL}/api/transaction/lemonsqeezy/checkout`
  const planMap: Record<string, string> = {
    pro: 'Pro',
    agency: 'Agency',
    lifetime: 'Lifetime',
    credits: 'Credits',
  }
  const backendPlan = planMap[plan] ?? 'Pro'
  const variantMap: Record<string, string | undefined> = {
    Pro: process.env.LEMONSQUEEZY_PRO_VARIANT_ID,
    Agency: process.env.LEMONSQUEEZY_AGENCY_VARIANT_ID,
    Lifetime: process.env.LEMONSQUEEZY_LIFETIME_VARIANT_ID,
  }
  let variantId = backendPlan !== 'Credits' ? variantMap[backendPlan] : undefined
  const bodyPayload: Record<string, unknown> = { plan: backendPlan }
  if (backendPlan === 'Credits') {
    const creditsVariantMap: Record<string, string | undefined> = {
      '100k': process.env.LEMONSQUEEZY_CREDITS_100K_VARIANT_ID,
      '50k': process.env.LEMONSQUEEZY_CREDITS_50K_VARIANT_ID,
      '25k': process.env.LEMONSQUEEZY_CREDITS_25K_VARIANT_ID,
      '10k': process.env.LEMONSQUEEZY_CREDITS_10K_VARIANT_ID,
    }
    const pkg = options?.package
    const explicitVariant = options?.variantId
    variantId = explicitVariant ?? (pkg ? creditsVariantMap[pkg] : undefined)
    if (pkg) bodyPayload.package = pkg
  }
  if (variantId) {
    bodyPayload.variantId = variantId
    const asNum = Number(variantId)
    if (!Number.isNaN(asNum)) {
      bodyPayload.variant_id = asNum
      bodyPayload.enabled_variants = [asNum]
    }
    bodyPayload.enabledVariants = [variantId]
    bodyPayload.variant = variantId
  }
  const reqInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(bodyPayload),
    cache: 'no-store',
  } as RequestInit

  let res = await fetch(url, reqInit)
  if (!res.ok && res.status >= 500) {
    await new Promise(r => setTimeout(r, 200))
    res = await fetch(url, reqInit)
  }

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((json as Record<string, unknown>)?.['message'] as string || 'Failed to create checkout')
  }
  return (json as Record<string, unknown>)?.['data']
}

// Deprecated: use createLemonSqueezyCheckout('credits') from client

export async function createLemonSqueezyPortal() {
  // Get user's profile including plan information from backend
  interface ProfileResponse {
    plan?: string
    lemonsqueezy_customer_id?: string
  }
  const profRes = await apiGet<ProfileResponse>('/api/user/profile/getProfile', { useProxy: true })
  const profile = profRes.ok ? profRes.data : null
  // Check if user is on free plan
  if (profile?.plan === 'free') {
    throw new Error('You are currently on the Free Plan. Billing management is available only on paid plans. 👉 Upgrade to our Agency or Lifetime plan to unlock billing and advanced features.')
  }
  const customerId = profile?.lemonsqueezy_customer_id
  
  if (!customerId) {
    throw new Error('No billing information found. Please make a purchase first to access billing management.')
  }
  
  try {
    const { createLemonSqueezyPortal: createLSPortal } = await import('@/lib/services/lemonsqueezy')
    
    // Get the actual LemonSqueezy customer portal URL
    const portalResponse = await createLSPortal(customerId)
    return portalResponse
  } catch (error) {
    console.error('LemonSqueezy portal error:', error)
    throw new Error('Failed to create billing portal session')
  }
}

// Mock transaction history for demo
export async function getTransactionHistory(): Promise<Transaction[]> {
  try {
    const token = (await cookies()).get('access_token')?.value
    if (!token) {
      return []
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/transaction/getMyTransaction`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      return []
    }
    const payload = await res.json().catch(() => ({}))
    const raw = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.transactions) ? payload.transactions : []))
    if (!Array.isArray(raw)) {
      return []
    }
    const mapped: Transaction[] = raw.map((t: Record<string, unknown>) => ({
      id: String(t['id'] ?? t['_id'] ?? ''),
      user_id: String(t['user_id'] ?? t['userId'] ?? ''),
      lemonsqueezy_order_id: (t['lemonsqueezy_order_id'] ?? t['order_id'] ?? undefined) as string | undefined,
      lemonsqueezy_subscription_id: (t['lemonsqueezy_subscription_id'] ?? t['subscription_id'] ?? undefined) as string | undefined,
      product_name: String(t['product_name'] ?? t['productName'] ?? t['plan_name'] ?? 'Unknown'),
      product_type: String(t['product_type'] ?? t['type'] ?? 'credit_pack'),
      amount: Number(t['amount'] ?? 0),
      credits_find_added: Number(t['credits_find_added'] ?? t['find_credits'] ?? 0),
      credits_verify_added: Number(t['credits_verify_added'] ?? t['verify_credits'] ?? 0),
      status: String(t['status'] ?? t['payment_status'] ?? 'completed'),
      webhook_event: String(t['webhook_event'] ?? ''),
      metadata: (t['metadata'] as Record<string, unknown>) ?? undefined,
      created_at: String(t['created_at'] ?? t['createdAt'] ?? new Date().toISOString()),
    }))
    return mapped
  } catch (error) {
    return []
  }
}

// LemonSqueezy webhook handler
export async function handleLemonSqueezyWebhook(event: LemonSqueezyWebhookEvent) {
  try {
    const { handleLemonSqueezyWebhook: handleWebhook } = await import('@/lib/services/lemonsqueezy')
    await handleWebhook(event)
  } catch (error) {
    console.error('LemonSqueezy webhook error:', error)
    throw error
  }
}
