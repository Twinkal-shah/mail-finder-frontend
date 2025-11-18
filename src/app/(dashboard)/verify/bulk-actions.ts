'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isPlanExpired } from '@/lib/auth'
import type { BulkVerificationJob } from './types'

async function createSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

/**
 * Submit email data for bulk verification as a background job
 */
export async function submitBulkVerificationJob(emailsData: Array<{email: string, [key: string]: unknown}>, filename?: string): Promise<{
  success: boolean
  jobId?: string
  error?: string
}> {
  try {
    if (!emailsData || !Array.isArray(emailsData) || emailsData.length === 0) {
      return {
        success: false,
        error: 'Invalid emails data array'
      }
    }

    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    // Check if plan has expired
    const planExpired = await isPlanExpired()
    if (planExpired) {
      return {
        success: false,
        error: 'Your plan has expired. Please upgrade to Pro.'
      }
    }

    // Check if user has Verify Credits specifically
    const supabaseClient = await createSupabaseClient()
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('credits_verify')
      .eq('id', user.id)
      .single()
    
    if (profileError || !profile) {
      return {
        success: false,
        error: 'Failed to check your credits. Please try again.'
      }
    }
    
    const availableCredits = profile.credits_verify || 0
    const requiredCredits = emailsData.length
    
    if (availableCredits === 0) {
      return {
        success: false,
        error: "You don't have any Verify Credits to perform this action. Please purchase more credits."
      }
    }
    
    if (availableCredits < requiredCredits) {
      return {
        success: false,
        error: `You need ${requiredCredits} Verify Credits but only have ${availableCredits}. Please purchase more credits.`
      }
    }

    const supabase = await createSupabaseClient()
     const jobId = crypto.randomUUID()

     // Insert job into database
     const { error: insertError } = await supabase
      .from('bulk_verification_jobs')
      .insert({
        id: jobId,
        user_id: user.id,
        status: 'pending',
        total_emails: emailsData.length,
        processed_emails: 0,
        successful_verifications: 0,
        failed_verifications: 0,
        emails_data: emailsData.map(data => ({ ...data, status: 'pending' })),
        filename: filename
      })

    if (insertError) {
      console.error('Error creating bulk verification job:', insertError)
      return {
        success: false,
        error: 'Failed to create verification job'
      }
    }

    // Trigger background processing directly
    try {
      // Import and call the background processing function directly
      const { processJobInBackground } = await import('@/app/api/bulk-verify/process/route')
      
      // Start background processing without waiting for it to complete
      processJobInBackground(jobId).catch(async (error) => {
        console.error('Background processing failed for job:', jobId, error)
        
        // Update job status to failed if background processing fails
        try {
          await supabase
            .from('bulk_verification_jobs')
            .update({ 
              status: 'failed',
              error_message: error.message || 'Background processing failed'
            })
            .eq('id', jobId)
        } catch (updateError) {
          console.error('Failed to update job status to failed:', updateError)
        }
      })
     } catch (error) {
       console.error('Error triggering background processing:', error)
     }

    revalidatePath('/(dashboard)', 'layout')

    return {
      success: true,
      jobId
    }
  } catch (error) {
    console.error('Submit bulk verification job error:', error)
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.'
    }
  }
}

/**
 * Get the status of a specific bulk verification job
 */
export async function getBulkVerificationJobStatus(jobId: string): Promise<{
  success: boolean
  job?: BulkVerificationJob
  error?: string
}> {
  try {
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    const supabase = await createSupabaseClient()
    
    const { data: jobData, error } = await supabase
      .from('bulk_verification_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Error fetching job:', error)
      return {
        success: false,
        error: 'Job not found'
      }
    }

    const job: BulkVerificationJob = {
      jobId: jobData.id,
      status: jobData.status,
      totalEmails: jobData.total_emails,
      processedEmails: jobData.processed_emails,
      successfulVerifications: jobData.successful_verifications,
      failedVerifications: jobData.failed_verifications,
      emailsData: jobData.emails_data,
      errorMessage: jobData.error_message,
      createdAt: jobData.created_at,
      updatedAt: jobData.updated_at,
      completedAt: jobData.completed_at
    }

    return {
      success: true,
      job
    }
  } catch (error) {
    console.error('Error getting job status:', error)
    return {
      success: false,
      error: 'Failed to get job status'
    }
  }
}

/**
 * Get all bulk verification jobs for the current user
 */
export async function getUserBulkVerificationJobs(): Promise<{
  success: boolean
  jobs?: BulkVerificationJob[]
  error?: string
}> {
  try {
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    const supabase = await createSupabaseClient()
    
    const { data: jobs, error } = await supabase
      .from('bulk_verification_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching user jobs:', error)
      return {
        success: false,
        error: 'Failed to fetch jobs'
      }
    }

    const formattedJobs: BulkVerificationJob[] = jobs.map(job => ({
      jobId: job.id,
      status: job.status,
      totalEmails: job.total_emails,
      processedEmails: job.processed_emails,
      successfulVerifications: job.successful_verifications,
      failedVerifications: job.failed_verifications,
      emailsData: job.emails_data,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    }))

    return {
      success: true,
      jobs: formattedJobs
    }
  } catch (error) {
    console.error('Error in getUserBulkVerificationJobs:', error)
    return {
      success: false,
      error: 'Internal server error'
    }
  }
}

/**
 * Stop a running bulk verification job
 */
export async function stopBulkVerificationJob(jobId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    const supabase = await createSupabaseClient()
    
    const { error } = await supabase
      .from('bulk_verification_jobs')
      .update({
        status: 'failed',
        error_message: 'Job manually stopped by user',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .eq('user_id', user.id)
      .eq('status', 'processing')

    if (error) {
      console.error('Error stopping job:', error)
      return {
        success: false,
        error: 'Failed to stop job'
      }
    }

    revalidatePath('/verify')
    
    return {
      success: true
    }
  } catch (error) {
    console.error('Error in stopBulkVerificationJob:', error)
    return {
      success: false,
      error: 'Internal server error'
    }
  }
}