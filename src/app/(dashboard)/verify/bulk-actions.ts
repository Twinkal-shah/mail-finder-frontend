'use server'

import { revalidatePath } from 'next/cache'
import type { BulkVerificationJob, EmailData } from './types'

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

    // Check if plan has expired via backend API
    try {
      const profileRes = await fetch('/api/user/profile/getProfile', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (profileRes.ok) {
        const profile = await profileRes.json()
        if (profile.plan_expired) {
          return {
            success: false,
            error: 'Your plan has expired. Please upgrade to Pro.'
          }
        }
      }
    } catch (error) {
      console.error('Error checking plan status:', error)
      // Continue with credit check even if plan check fails
    }

    // Check if user has Verify Credits via backend API
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
      const availableCredits = creditsData.verify || 0
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
    } catch (error) {
      console.error('Error checking credits:', error)
      return {
        success: false,
        error: 'Failed to check your credits. Please try again.'
      }
    }

    // Create job via backend API
    const jobId = crypto.randomUUID()
    
    try {
      const createResponse = await fetch('/api/bulk-verify/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          emails: emailsData.map(data => ({ ...data, status: 'pending' })),
          filename,
          total_emails: emailsData.length
        })
      })
      
      if (!createResponse.ok) {
        const errorText = await createResponse.text()
        console.error('Failed to create bulk verification job:', errorText)
        return {
          success: false,
          error: 'Failed to create verification job'
        }
      }
    } catch (error) {
      console.error('Error creating bulk verification job:', error)
      return {
        success: false,
        error: 'Failed to create verification job'
      }
    }

    // Background processing will be triggered by the backend API
    // The backend will handle the job processing automatically

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

    // Fetch job status via backend API
    try {
      const jobRes = await fetch(`/api/bulk-verify/jobs/${jobId}`, {
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
      const job: BulkVerificationJob = {
        jobId: jobData.jobId || jobData.id,
        status: jobData.status,
        totalEmails: jobData.totalEmails || jobData.total_emails,
        processedEmails: jobData.processedEmails || jobData.processed_emails,
        successfulVerifications: jobData.successfulVerifications || jobData.successful_verifications,
        failedVerifications: jobData.failedVerifications || jobData.failed_verifications,
        emailsData: jobData.emailsData || jobData.emails_data,
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
      console.error('Error fetching job:', error)
      return {
        success: false,
        error: 'Job not found'
      }
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

    // Fetch user jobs via backend API
    try {
      const jobsRes = await fetch('/api/bulk-verify/jobs', {
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
      const formattedJobs: BulkVerificationJob[] = jobs.map((j: Record<string, unknown>) => {
        const job = j as Record<string, unknown>
        return {
          jobId: (job.jobId as string) || (job.id as string),
          status: job.status as BulkVerificationJob['status'],
          totalEmails: (job.totalEmails as number) || (job.total_emails as number),
          processedEmails: (job.processedEmails as number) || (job.processed_emails as number),
          successfulVerifications: (job.successfulVerifications as number) || (job.successful_verifications as number),
          failedVerifications: (job.failedVerifications as number) || (job.failed_verifications as number),
          emailsData: (job.emailsData as EmailData[]) ?? (job.emails_data as EmailData[]),
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
      console.error('Error fetching user jobs:', error)
      return {
        success: false,
        error: 'Failed to fetch jobs'
      }
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

    // Stop job via backend API
    try {
      const stopRes = await fetch(`/api/bulk-verify/jobs/${jobId}/stop`, {
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