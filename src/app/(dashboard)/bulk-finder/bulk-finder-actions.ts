'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { recoverStuckJobs } from '@/lib/bulk-finder-processor'
import type { BulkFinderJob, BulkFindRequest } from './types.js'

interface DatabaseJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused'
  total_requests: number
  processed_requests: number
  successful_finds: number
  failed_finds: number
  requests_data: BulkFindRequest[]
  error_message?: string
  created_at: string
  updated_at: string
}

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
 * Submit requests for bulk email finding as a background job
 */
export async function submitBulkFinderJob(requests: BulkFindRequest[], filename?: string): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return {
        success: false,
        error: 'Invalid requests array'
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

    // Check if user has Find Credits specifically
    const supabaseClient = await createSupabaseClient()
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('credits_find')
      .eq('id', user.id)
      .single()
    
    if (profileError || !profile) {
      return {
        success: false,
        error: 'Failed to check your credits. Please try again.'
      }
    }
    
    const availableCredits = profile.credits_find || 0
    const requiredCredits = requests.length
    
    if (availableCredits === 0) {
      return {
        success: false,
        error: "You don't have any Find Credits to perform this action. Please purchase more credits."
      }
    }
    
    if (availableCredits < requiredCredits) {
      return {
        success: false,
        error: `You need ${requiredCredits} Find Credits but only have ${availableCredits}. Please purchase more credits.`
      }
    }

    // Credits will be deducted per row during processing

    const supabase = await createSupabaseClient()
    const jobId = crypto.randomUUID()

    // Insert job into database
    const { error: insertError } = await supabase
      .from('bulk_finder_jobs')
      .insert({
        id: jobId,
        user_id: user.id,
        status: 'pending',
        total_requests: requests.length,
        processed_requests: 0,
        successful_finds: 0,
        failed_finds: 0,
        requests_data: requests.map(request => ({ ...request, status: 'pending' })),
        filename: filename
      })

    if (insertError) {
      return {
        success: false,
        error: 'Failed to create finder job'
      }
    }

    // Add job to the queue for reliable background processing
    try {
      const { getJobQueue } = await import('@/lib/job-queue')
      const jobQueue = getJobQueue()
      
      const success = await jobQueue.addJob(jobId)
      if (!success) {
        console.error('Failed to add job to queue, falling back to direct processing')
        
        // Fallback to direct processing
        const { processJobInBackground } = await import('@/lib/bulk-finder-processor')
        processJobInBackground(jobId).catch(async (error) => {
          try {
            await supabase
              .from('bulk_finder_jobs')
              .update({ 
                status: 'failed',
                error_message: error.message || 'Background processing failed'
              })
              .eq('id', jobId)
          } catch (updateError) {
            console.error('Failed to update job status to failed:', updateError)
          }
        })
      }
    } catch (error) {
      console.error('Error adding job to queue:', error)
      
      // Fallback to direct processing
      try {
        const { processJobInBackground } = await import('@/lib/bulk-finder-processor')
        processJobInBackground(jobId).catch(async (error) => {
          try {
            await supabase
              .from('bulk_finder_jobs')
              .update({ 
                status: 'failed',
                error_message: error.message || 'Background processing failed'
              })
              .eq('id', jobId)
          } catch (updateError) {
            console.error('Failed to update job status to failed:', updateError)
          }
        })
      } catch (fallbackError) {
        console.error('Error in fallback processing:', fallbackError)
      }
    }

    revalidatePath('/(dashboard)', 'layout')

    return {
      success: true,
      jobId
    }
  } catch (error) {
    console.error('Error submitting bulk finder job:', error)
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.'
    }
  }
}

/**
 * Get the status of a specific bulk finder job
 */
export async function getBulkFinderJobStatus(jobId: string): Promise<{
  success: boolean
  job?: BulkFinderJob
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
      .from('bulk_finder_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Error fetching finder job:', error)
      return {
        success: false,
        error: 'Job not found'
      }
    }

    const job: BulkFinderJob = {
      jobId: jobData.id,
      status: jobData.status,
      totalRequests: jobData.total_requests,
      processedRequests: jobData.processed_requests,
      successfulFinds: jobData.successful_finds,
      failedFinds: jobData.failed_finds,
      requestsData: jobData.requests_data,
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
    console.error('Error getting finder job status:', error)
    return {
      success: false,
      error: 'Failed to get job status'
    }
  }
}

/**
 * Get all bulk finder jobs for the current user
 */
export async function getUserBulkFinderJobs(): Promise<{
  success: boolean
  jobs?: BulkFinderJob[]
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
      .from('bulk_finder_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching user finder jobs:', error)
      return {
        success: false,
        error: 'Failed to fetch jobs'
      }
    }

    const formattedJobs: BulkFinderJob[] = jobs.map((job: DatabaseJob) => ({
      jobId: job.id,
      status: job.status,
      totalRequests: job.total_requests,
      processedRequests: job.processed_requests,
      successfulFinds: job.successful_finds,
      failedFinds: job.failed_finds,
      requestsData: job.requests_data,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    }))

    return {
      success: true,
      jobs: formattedJobs
    }
  } catch (error) {
    console.error('Error in getUserBulkFinderJobs:', error)
    return {
      success: false,
      error: 'Internal server error'
    }
  }
}

/**
 * Stop a bulk finder job
 */
export async function stopBulkFinderJob(jobId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    const supabase = await createSupabaseClient()
    
    const { error } = await supabase
      .from('bulk_finder_jobs')
      .update({
        status: 'failed',
        error_message: 'Job manually stopped by user',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error stopping finder job:', error)
      return {
        success: false,
        error: 'Failed to stop job'
      }
    }

    revalidatePath('/(dashboard)', 'layout')

    return {
      success: true
    }
  } catch (error) {
    console.error('Error in stopBulkFinderJob:', error)
    return {
      success: false,
      error: 'Internal server error'
    }
  }
}

/**
 * Recover stuck jobs that have been processing for too long
 */
export async function recoverStuckJobsAction(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    await recoverStuckJobs()
    revalidatePath('/bulk-finder')
    return { success: true }
  } catch (error) {
    console.error('Error recovering stuck jobs:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to recover stuck jobs'
    }
  }
}