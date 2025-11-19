import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { verifyEmail } from '@/lib/services/email-verifier'
// Removed unused imports - backend handles credits
import { SupabaseClient } from '@supabase/supabase-js'
import { EmailData } from '@/app/(dashboard)/verify/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Create Supabase client with service role for background processing
function createServiceClient() {
  return createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      get() { return undefined },
      set() {},
      remove() {},
    },
  })
}

// POST: Create a new bulk verification job
export async function POST(request: NextRequest) {
  try {
    const { emails } = await request.json()
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: 'Invalid emails array' },
        { status: 400 }
      )
    }

    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Plan and credit checks are handled by the backend API

    // Create Supabase client
    const cookieStore = await cookies()
    const supabase = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    // Prepare emails data with initial status
    const emailsData = emails.map((email: string, index: number) => ({
      id: index,
      email: email.trim(),
      status: 'pending',
      result: null
    }))

    // Create the job in database
    const { data: job, error } = await supabase
      .from('bulk_verification_jobs')
      .insert({
        user_id: user.id,
        total_emails: emails.length,
        emails_data: emailsData,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating job:', error)
      return NextResponse.json(
        { error: 'Failed to create verification job' },
        { status: 500 }
      )
    }

    // Start processing the job in the background
    processJobInBackground(job.id)

    return NextResponse.json({
      jobId: job.id,
      status: 'pending',
      totalEmails: emails.length
    })

  } catch (error) {
    console.error('Bulk verify API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET: Get job status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    const { data: job, error } = await supabase
      .from('bulk_verification_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      totalEmails: job.total_emails,
      processedEmails: job.processed_emails,
      successfulVerifications: job.successful_verifications,
      failedVerifications: job.failed_verifications,
      emailsData: job.emails_data,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at
    })

  } catch (error) {
    console.error('Get job status error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Background job processing function
async function processJobInBackground(jobId: string) {
  // Use setTimeout to avoid blocking the response
  setTimeout(async () => {
    try {
      await processJob(jobId)
    } catch (error) {
      console.error('Background job processing error:', error)
    }
  }, 100)
}

// Main job processing function
async function processJob(jobId: string) {
  const supabase = createServiceClient()
  
  try {
    // Get the job
    const { data: job, error: fetchError } = await supabase
      .from('bulk_verification_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (fetchError || !job) {
      console.error('Job not found:', fetchError)
      return
    }

    // Update job status to processing
    await supabase
      .from('bulk_verification_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId)

    const emailsData = job.emails_data as EmailData[]
    const currentIndex = job.current_index || 0
    let processedEmails = job.processed_emails || 0
    let successfulVerifications = job.successful_verifications || 0
    let failedVerifications = job.failed_verifications || 0

    // Process emails from current index
    for (let i = currentIndex; i < emailsData.length; i++) {
      const emailItem = emailsData[i]
      
      if (emailItem.status !== 'pending') {
        continue // Skip already processed emails
      }

      try {
        // Update email status to processing
        emailsData[i].status = 'processing'
        await updateJobProgress(supabase, jobId, {
          current_index: i,
          emails_data: emailsData
        })

        // Verify the email
        const result = await verifyEmail({ email: emailItem.email })
        
        // Update email with result
        emailsData[i] = {
          ...emailItem,
          status: result.status,
          result: {
            status: result.status,
            confidence: result.confidence,
            deliverable: result.deliverable,
            disposable: result.disposable,
            role_account: result.role_account,
            reason: result.reason,
            catch_all: result.catch_all,
            domain: result.domain,
            mx: result.mx,
            user_name: result.user_name
          }
        }

        processedEmails++
        
        if (result.status !== 'error') {
          successfulVerifications++
          
          // Credits are handled by the backend API
        } else {
          failedVerifications++
        }

        // Update job progress
        await updateJobProgress(supabase, jobId, {
          current_index: i + 1,
          processed_emails: processedEmails,
          successful_verifications: successfulVerifications,
          failed_verifications: failedVerifications,
          emails_data: emailsData
        })

        // Add small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500))

      } catch (emailError) {
        console.error(`Error processing email ${emailItem.email}:`, emailError)
        
        // Mark email as error
        emailsData[i] = {
          ...emailItem,
          status: 'error',
          result: {
            status: 'error',
            reason: 'Processing failed'
          }
        }
        
        processedEmails++
        failedVerifications++
        
        await updateJobProgress(supabase, jobId, {
          current_index: i + 1,
          processed_emails: processedEmails,
          failed_verifications: failedVerifications,
          emails_data: emailsData
        })
      }
    }

    // Mark job as completed
    await supabase
      .from('bulk_verification_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId)

  } catch (error) {
    console.error('Job processing error:', error)
    
    // Mark job as failed
    await supabase
      .from('bulk_verification_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', jobId)
  }
}

// Helper function to update job progress
async function updateJobProgress(supabase: SupabaseClient, jobId: string, updates: Record<string, unknown>) {
  await supabase
    .from('bulk_verification_jobs')
    .update(updates)
    .eq('id', jobId)
}