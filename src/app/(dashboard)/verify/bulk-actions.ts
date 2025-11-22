'use server'

import { revalidatePath } from 'next/cache'
import type { BulkVerificationJob, EmailData } from './types'
import { apiGet, apiPost } from '@/lib/api'
type CreditsResponse = {
  credits_find?: number
  credits_verify?: number
  find?: number
  verify?: number
}

export async function submitBulkVerificationJob(
  emailsData: EmailData[],
  filename?: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    if (!emailsData || !Array.isArray(emailsData) || emailsData.length === 0) {
      return { success: false, error: 'No emails provided' }
    }

    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    try {
      const creditsRes = await apiGet<Record<string, unknown>>('/api/user/credits', { useProxy: true })
      if (!creditsRes.ok || !creditsRes.data) {
        return { success: false, error: 'Failed to check your credits. Please try again.' }
      }
      const creditsData = creditsRes.data as CreditsResponse
      const availableVerify = Number(creditsData.verify ?? creditsData.credits_verify ?? 0)
      const required = emailsData.length
      if (availableVerify === 0) {
        return { success: false, error: "You don't have any Verify Credits. Please purchase more credits." }
      }
      if (availableVerify < required) {
        return { success: false, error: `You need ${required} Verify Credits but only have ${availableVerify}. Please purchase more credits.` }
      }
    } catch (error) {
      console.error('Error checking credits:', error)
      return { success: false, error: 'Failed to check your credits. Please try again.' }
    }

    const jobId = crypto.randomUUID()

    try {
      const createResponse = await apiPost<Record<string, unknown>>(
        '/api/bulk-verify/create',
        {
          jobId,
          emailsData: emailsData.map(e => ({ ...e, status: 'pending' })),
          filename,
          total_emails: emailsData.length
        },
        { useProxy: true }
      )
      if (!createResponse.ok) {
        console.error('Failed to create bulk verification job:', createResponse.error)
        return { success: false, error: 'Failed to create verification job' }
      }
    } catch (error) {
      console.error('Error creating bulk verification job:', error)
      return { success: false, error: 'Failed to create verification job' }
    }

    try {
      const processResponse = await apiPost<Record<string, unknown>>(
        '/api/bulk-verify/jobs',
        { jobId },
        { useProxy: true }
      )
      if (!processResponse.ok) {
        return { success: false, error: 'Failed to start background processing' }
      }
    } catch {
      return { success: false, error: 'Failed to start background processing' }
    }

    revalidatePath('/(dashboard)', 'layout')

    return { success: true, jobId }
  } catch (error) {
    console.error('Error submitting bulk verification job:', error)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

export async function getBulkVerificationJobStatus(jobId: string): Promise<{ success: boolean; job?: BulkVerificationJob; error?: string }> {
  try {
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    try {
      const jobRes = await apiGet<Record<string, unknown>>(`/api/bulk-verify/status?jobId=${jobId}`, { useProxy: true })

      if (!jobRes.ok || !jobRes.data) {
        console.error('Failed to fetch verification job:', jobRes.error)
        return { success: false, error: 'Job not found' }
      }

      const jobData = jobRes.data as Record<string, unknown>
      const job: BulkVerificationJob = {
        jobId: (jobData['jobId'] as string) || (jobData['id'] as string),
        status: jobData['status'] as BulkVerificationJob['status'],
        totalEmails: (jobData['totalEmails'] as number) ?? (jobData['total_emails'] as number),
        processedEmails: (jobData['processedEmails'] as number) ?? (jobData['processed_emails'] as number),
        successfulVerifications: (jobData['successfulVerifications'] as number) ?? (jobData['successful_verifications'] as number),
        failedVerifications: (jobData['failedVerifications'] as number) ?? (jobData['failed_verifications'] as number),
        emailsData: (jobData['emailsData'] as EmailData[]) ?? (jobData['emails_data'] as EmailData[]),
        errorMessage: (jobData['errorMessage'] as string) ?? (jobData['error_message'] as string),
        filename: jobData['filename'] as string,
        createdAt: (jobData['createdAt'] as string) ?? (jobData['created_at'] as string),
        updatedAt: (jobData['updatedAt'] as string) ?? (jobData['updated_at'] as string),
        completedAt: (jobData['completedAt'] as string) ?? (jobData['completed_at'] as string)
      }

      return { success: true, job }
    } catch (error) {
      console.error('Error fetching verification job:', error)
      return { success: false, error: 'Job not found' }
    }
  } catch (error) {
    console.error('Error getting verification job status:', error)
    return { success: false, error: 'Failed to get job status' }
  }
}

export async function stopBulkVerificationJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    try {
      const stopRes = await apiPost<Record<string, unknown>>(`/api/bulk-verify/stop?jobId=${jobId}`, undefined, { useProxy: true })

      if (!stopRes.ok) {
        console.error('Failed to stop verification job:', stopRes.error)
        return { success: false, error: 'Failed to stop job' }
      }
    } catch (error) {
      console.error('Error stopping verification job:', error)
      return { success: false, error: 'Failed to stop job' }
    }

    revalidatePath('/(dashboard)', 'layout')

    return { success: true }
  } catch (error) {
    console.error('Error in stopBulkVerificationJob:', error)
    return { success: false, error: 'Internal server error' }
  }
}
