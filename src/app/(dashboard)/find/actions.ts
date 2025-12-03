'use server'


import { getUserCredits } from '@/lib/profile-server'
import { revalidatePath } from 'next/cache'
import { findEmail as findEmailService, type EmailFinderRequest } from '@/lib/services/email-finder'

interface FindEmailRequest {
  full_name: string
  company_domain: string
  role?: string
}

interface EmailResult {
  email: string | null
  confidence: number
  status: 'found' | 'not_found' | 'error'
}

interface FindEmailResponse {
  success: boolean
  result?: EmailResult
  error?: string
  invalidateQueries?: boolean
}



export async function findEmail(request: FindEmailRequest): Promise<FindEmailResponse> {
  try {
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    
    if (!user) {
      return {
        success: false,
        error: 'You must be logged in to perform this action.'
      }
    }

    // Check if user has Find Credits via backend
    let credits = await getUserCredits()
    if (!credits) {
      const findFallback = Number((user as Record<string, unknown>).credits_find ?? 0)
      const verifyFallback = Number((user as Record<string, unknown>).credits_verify ?? 0)
      credits = { total: findFallback + verifyFallback, find: findFallback, verify: verifyFallback }
    }
    if ((credits.find || 0) === 0) {
      return {
        success: false,
        error: "You don't have enough Find Credits to perform this action. Please purchase more credits."
      }
    }

    // Call email finder service
    const emailRequest: EmailFinderRequest = {
      full_name: request.full_name,
      domain: request.company_domain,
      role: request.role
    }
    const serviceResult = await findEmailService(emailRequest)
    
    // Map service result to expected format
    const result: EmailResult = {
      email: serviceResult.email || null,
      confidence: serviceResult.confidence || 0,
      status: serviceResult.status === 'valid' ? 'found' :
              serviceResult.status === 'invalid' ? 'not_found' : 'error'
    }

    if (!result.email) {
      try {
        const { cookies } = await import('next/headers')
        const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
        const cookieHeader = cookies().toString()
        const token = await getAccessTokenFromCookies()
        const payload = {
          full_name: request.full_name,
          domain: request.company_domain,
          role: request.role
        }
        const port = process.env.PORT
        const origin = port ? `http://localhost:${port}` : (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_LOCAL_FRONTEND_URL || 'http://localhost:3000')
        const res = await fetch(`${origin.replace(/\/$/, '')}/api/email/findEmail`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload),
          cache: 'no-store'
        })
        const text = await res.text()
        let data: Record<string, unknown> = {}
        try { data = JSON.parse(text) as Record<string, unknown> } catch { data = {} }
        const root = data
        const p = (typeof root?.data === 'object' && root.data !== null)
          ? (root.data as Record<string, unknown>)
          : (typeof root?.result === 'object' && root.result !== null)
            ? (root.result as Record<string, unknown>)
            : root
        const email = typeof p?.email === 'string' ? (p.email as string) : null
        const confidence = typeof p?.confidence === 'number' ? (p.confidence as number) : (email ? 95 : 0)
        if (email) {
          result.email = email
          result.confidence = confidence
          result.status = 'found'
        }
      } catch {}
    }
    
    // Deduct credits for all search attempts (found, not_found, but not error)
 // Deduct credit if the finder actually returned an email (means it was a real attempt)
if (result.status === 'found') {
  try {
    const { cookies } = await import('next/headers')
    const { getAccessTokenFromCookies } = await import('@/lib/auth-server')

    const cookieHeader = cookies().toString()
    const token = await getAccessTokenFromCookies()

    const port = process.env.PORT
    const origin = port ? `http://localhost:${port}` : (process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_LOCAL_FRONTEND_URL || "http://localhost:3000")

    const deductResponse = await fetch(`${origin.replace(/\/$/, '')}/api/user/profile/updateProfile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        credits_find: credits.find - 1,
        metadata: {
          email: result.email,
          confidence: result.confidence,
          status: result.status,
          operation: 'email_find'
        }
      }),
      cache: "no-store" // <-- REQUIRED IN SERVER ACTIONS
    })

    if (!deductResponse.ok) {
      console.error('Failed to deduct credits:', await deductResponse.text())
    }
  } catch (error) {
    console.error('Error deducting credits:', error)
  }
}





    // Mock: Skip database save for demo
    // In a real app, this would save to the searches table

    // Revalidate the layout to update credits display
    revalidatePath('/(dashboard)', 'layout')
    
    return {
      success: true,
      result,
      invalidateQueries: true // Signal to invalidate React Query cache
    }
  } catch (error) {
    console.error('Find email error:', error)
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.'
    }
  }
}
