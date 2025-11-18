'use server'

import { deductCredits, getCurrentUser, isPlanExpired } from '@/lib/auth'
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
    const user = await getCurrentUser()
    
    if (!user) {
      return {
        success: false,
        error: 'You must be logged in to perform this action.'
      }
    }
    
    // Check if plan has expired
    const planExpired = await isPlanExpired()
    if (planExpired) {
      return {
        success: false,
        error: "Your plan has expired. Please upgrade to Pro."
      }
    }

    // Check if user has Find Credits via backend
    const credits = await getUserCredits(user.id)
    if (!credits) {
      return {
        success: false,
        error: 'Failed to check your credits. Please try again.'
      }
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
    
    // Deduct credits for all search attempts (found, not_found, but not error)
    if (result.status === 'found' || result.status === 'not_found') {
      const deducted = await deductCredits(1, 'email_find', {
        full_name: request.full_name,
        company_domain: request.company_domain,
        role: request.role,
        result: result.status,
        email: result.email
      })
      
      if (!deducted) {
        return {
          success: false,
          error: 'Failed to process payment. Please try again.'
        }
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