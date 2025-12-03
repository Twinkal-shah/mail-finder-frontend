'use server'

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

export async function createLemonSqueezyCheckout(planData: {
  name: string
  price: number
  period: string
  findCredits: number
  verifyCredits: number
}) {
  const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
  const user = await getCurrentUserFromCookies()
  if (!user) {
    throw new Error('User not authenticated')
  }
  
  // Validate plan data
  const validPlans = {
    'Pro': { price: 49, period: 'month', findCredits: 5000, verifyCredits: 5000 },
    'Agency': { price: 99, period: 'month', findCredits: 50000, verifyCredits: 50000 },
    'Lifetime': { price: 249, period: 'lifetime', findCredits: 150000, verifyCredits: 150000 }
  }
  
  const validPlan = validPlans[planData.name as keyof typeof validPlans]
  if (!validPlan || validPlan.price !== planData.price) {
    throw new Error('Invalid subscription plan')
  }
  
  try {
    const { createLemonSqueezyCheckout: createCheckout } = await import('@/lib/services/lemonsqueezy')
    
    // Map plan names to LemonSqueezy variant IDs (these would be configured in your LemonSqueezy dashboard)
    const variantIds = {
      'Pro': process.env.LEMONSQUEEZY_PRO_VARIANT_ID || 'pro-variant-id',
      'Agency': process.env.LEMONSQUEEZY_AGENCY_VARIANT_ID || 'agency-variant-id',
      'Lifetime': process.env.LEMONSQUEEZY_LIFETIME_VARIANT_ID || 'lifetime-variant-id'
    }
    
    const variantId = variantIds[planData.name as keyof typeof variantIds]
    if (!variantId) {
      throw new Error('Invalid plan selected')
    }
    
    const checkoutData = {
      productId: process.env.LEMONSQUEEZY_PRODUCT_ID || 'product-id',
      variantId,
      customData: {
        plan_name: planData.name,
        find_credits: planData.findCredits,
        verify_credits: planData.verifyCredits,
      },
    }
    
    const userId = (user as Record<string, unknown>).id as string | undefined || (user as Record<string, unknown>)._id as string | undefined || ''
    const result = await createCheckout(checkoutData, userId)
    
    return { url: result.url }
  } catch (error) {
    console.error('LemonSqueezy checkout error:', error)
    throw new Error('Failed to create checkout session')
  }
}

export async function createCustomCreditCheckout(creditData: {
  credits: number
  price: number
}) {
  const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
  const user = await getCurrentUserFromCookies()
  if (!user) {
    throw new Error('User not authenticated')
  }
  
  // Validate credit package data
  const validPackages = {
    100000: 35,
    50000: 20,
    25000: 12,
    10000: 9
  }
  
  const validPrice = validPackages[creditData.credits as keyof typeof validPackages]
  if (!validPrice || validPrice !== creditData.price) {
    throw new Error('Invalid credit package')
  }
  
  try {
    const { createLemonSqueezyCheckout: createCheckout } = await import('@/lib/services/lemonsqueezy')
    
    // Map credit amounts to LemonSqueezy variant IDs
    const creditVariantIds = {
      100000: process.env.LEMONSQUEEZY_CREDITS_100K_VARIANT_ID || 'credits-100k-variant-id',
      50000: process.env.LEMONSQUEEZY_CREDITS_50K_VARIANT_ID || 'credits-50k-variant-id',
      25000: process.env.LEMONSQUEEZY_CREDITS_25K_VARIANT_ID || 'credits-25k-variant-id',
      10000: process.env.LEMONSQUEEZY_CREDITS_10K_VARIANT_ID || 'credits-10k-variant-id'
    }
    
    const variantId = creditVariantIds[creditData.credits as keyof typeof creditVariantIds]
    if (!variantId) {
      throw new Error('Invalid credit package selected')
    }
    
    const userId = (user as Record<string, unknown>).id as string | undefined || (user as Record<string, unknown>)._id as string | undefined || ''
    const result = await createCheckout(
      {
        productId: process.env.LEMONSQUEEZY_CREDITS_PRODUCT_ID || process.env.LEMONSQUEEZY_PRODUCT_ID || 'credits-product-id',
        variantId,
        customData: {
          credits: creditData.credits,
          package_type: 'credits',
        },
      },
      userId
    )
    
    return { url: result.url }
  } catch (error) {
    console.error('Mock checkout error:', error)
    throw new Error('Failed to create checkout session')
  }
}

export async function createLemonSqueezyPortal() {
  const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
  const user = await getCurrentUserFromCookies()
  if (!user) {
    throw new Error('User not authenticated')
  }
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
    // Mock implementation - return empty array for now
    // TODO: Implement actual transaction history fetching
    return []
  } catch (error) {
    console.error('Get transactions error:', error)
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
