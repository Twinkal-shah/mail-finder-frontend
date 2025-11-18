'use server'

import { revalidatePath } from 'next/cache'

import { recoverStuckJobs } from '@/lib/bulk-finder-processor'
import type { BulkFinderJob, BulkFindRequest } from './types.js'

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

    // Check if user has Find Credits via backend API
    try {
      const creditsRes = await fetch('/api/user/credits', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!creditsRes.ok) {
        return {
          success: false,
          error: 'Failed to check your credits. Please try again.'
        }
      }
      
      const creditsData = await creditsRes.json()
      const availableCredits = creditsData.find || 0
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
    } catch (error) {
      console.error('Error checking credits:', error)
      return {
        success: false,
        error: 'Failed to check your credits. Please try again.'
      }
    }

    // Credits will be deducted per row during processing

    // Create job via backend API
    const jobId = crypto.randomUUID()
    
    try {
      const createResponse = await fetch('/api/bulk-finder/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          requests: requests.map(request => ({ ...request, status: 'pending' })),
          filename,
          total_requests: requests.length
        })
      })
      
      if (!createResponse.ok) {
        const errorText = await createResponse.text()
        console.error('Failed to create bulk finder job:', errorText)
        return {
          success: false,
          error: 'Failed to create finder job'
        }
      }
    } catch (error) {
      console.error('Error creating bulk finder job:', error)
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
          console.error('Background processing failed for job:', jobId, error)
          // The backend will handle updating job status to failed
        })
      }
    } catch (error) {
      console.error('Error adding job to queue:', error)
      
      // Fallback to direct processing
      try {
        const { processJobInBackground } = await import('@/lib/bulk-finder-processor')
        processJobInBackground(jobId).catch(async (error) => {
          console.error('Background processing failed for job:', jobId, error)
          // The backend will handle updating job status to failed
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

    // Fetch job status via backend API
    try {
      const jobRes = await fetch(`/api/bulk-finder/jobs/${jobId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!jobRes.ok) {
        console.error('Failed to fetch job:', await jobRes.text())
        return {
          success: false,
          error: 'Job not found'
        }
      }
      
      const jobData = await jobRes.json()
      // Use jobData to avoid unused variable warning
    } catch (error) {
      console.error('Error fetching finder job:', error)
      return {
        success: false,
        error: 'Job not found'
      }
    }

    const job: BulkFinderJob = {
      jobId: jobData.jobId || jobData.id,
      status: jobData.status,
      totalRequests: jobData.totalRequests || jobData.total_requests,
      processedRequests: jobData.processedRequests || jobData.processed_requests,
      successfulFinds: jobData.successfulFinds || jobData.successful_finds,
      failedFinds: jobData.failedFinds || jobData.failed_finds,
      requestsData: jobData.requestsData || jobData.requests_data,
      errorMessage: jobData.errorMessage || jobData.error_message,
      createdAt: jobData.createdAt || jobData.created_at,
      updatedAt: jobData.updatedAt || jobData.updated_at,
      completedAt: jobData.completedAt || jobData.completed_at
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

    // Fetch user jobs via backend API
    try {
      const jobsRes = await fetch('/api/bulk-finder/jobs', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!jobsRes.ok) {
        console.error('Failed to fetch jobs:', await jobsRes.text())
        return {
          success: false,
          error: 'Failed to fetch jobs'
        }
      }
      
      const data = await jobsRes.json()
      const jobs = data.jobs || []
      // Use jobs to avoid unused variable warning
    } catch (error) {
      console.error('Error fetching user finder jobs:', error)
      return {
        success: false,
        error: 'Failed to fetch jobs'
      }
    }

    const formattedJobs: BulkFinderJob[] = jobs.map((job) => ({
      jobId: job.jobId || job.id,
      status: job.status,
      totalRequests: job.totalRequests || job.total_requests,
      processedRequests: job.processedRequests || job.processed_requests,
      successfulFinds: job.successfulFinds || job.successful_finds,
      failedFinds: job.failedFinds || job.failed_finds,
      requestsData: job.requestsData || job.requests_data,
      errorMessage: job.errorMessage || job.error_message,
      createdAt: job.createdAt || job.created_at,
      updatedAt: job.updatedAt || job.updated_at
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
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return {
        success: false,
        error: 'Unauthorized'
      }
    }

    // Stop job via backend API
    try {
      const stopRes = await fetch(`/api/bulk-finder/jobs/${jobId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!stopRes.ok) {
        console.error('Failed to stop job:', await stopRes.text())
        return {
          success: false,
          error: 'Failed to stop job'
        }
      }
    } catch (error) {
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