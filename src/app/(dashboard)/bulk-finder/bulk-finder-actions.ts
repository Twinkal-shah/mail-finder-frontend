'use server'

import { revalidatePath } from 'next/cache'

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

    try {
      const processResponse = await fetch(`/api/bulk-finder/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      })
      if (!processResponse.ok) {
        return { success: false, error: 'Failed to start background processing' }
      }
    } catch {
      return { success: false, error: 'Failed to start background processing' }
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
      const jobRes = await fetch(`/api/bulk-finder/status?jobId=${jobId}`, {
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
      console.error('Error fetching finder job:', error)
      return {
        success: false,
        error: 'Job not found'
      }
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
      const jobs: Array<Record<string, unknown>> = (data.jobs || []) as Array<Record<string, unknown>>
      const formattedJobs: BulkFinderJob[] = jobs.map((j: Record<string, unknown>) => {
        const job = j as Record<string, unknown>
        return {
          jobId: (job.jobId as string) || (job.id as string),
          status: job.status as BulkFinderJob['status'],
          totalRequests: (job.totalRequests as number) || (job.total_requests as number),
          processedRequests: (job.processedRequests as number) || (job.processed_requests as number),
          successfulFinds: (job.successfulFinds as number) || (job.successful_finds as number),
          failedFinds: (job.failedFinds as number) || (job.failed_finds as number),
          requestsData: (job.requestsData as BulkFindRequest[]) ?? (job.requests_data as BulkFindRequest[]),
          errorMessage: (job.errorMessage as string) || (job.error_message as string),
          createdAt: (job.createdAt as string) || (job.created_at as string),
          updatedAt: (job.updatedAt as string) || (job.updated_at as string)
        }
      })

      return {
        success: true,
        jobs: formattedJobs
      }
    } catch (error) {
      console.error('Error fetching user finder jobs:', error)
      return {
        success: false,
        error: 'Failed to fetch jobs'
      }
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
      const stopRes = await fetch(`/api/bulk-finder/stop?jobId=${jobId}`, {
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
    try {
      const { getJobQueue } = await import('@/lib/job-queue')
      const jobQueue = getJobQueue()
      await jobQueue.recoverStuckJobs()
    } catch {}
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
