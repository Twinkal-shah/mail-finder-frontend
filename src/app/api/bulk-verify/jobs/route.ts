import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

// GET: Get all bulk verification jobs for the current user
export async function GET() {
  try {
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

    const { data: jobs, error } = await supabase
      .from('bulk_verification_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching jobs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch jobs' },
        { status: 500 }
      )
    }

    const formattedJobs = jobs.map(job => ({
      jobId: job.id,
      status: job.status,
      totalEmails: job.total_emails,
      processedEmails: job.processed_emails,
      successfulVerifications: job.successful_verifications,
      failedVerifications: job.failed_verifications,
      emailsData: job.emails_data,
      errorMessage: job.error_message,
      filename: job.filename,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at
    }))

    return NextResponse.json({ jobs: formattedJobs })

  } catch (error) {
    console.error('Get user jobs error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST: Trigger background processing for a specific job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobId } = body

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    // Trigger the background processing
    // This will be handled by the main bulk-verify route
    console.log('Starting background processing for job:', jobId)
    const processUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bulk-verify/process?jobId=${jobId}`
    console.log('Process URL:', processUrl)
    
    const response = await fetch(processUrl, {
      method: 'POST'
    })

    console.log('Background process response:', response.status, response.statusText)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Background processing failed:', errorText)
      return NextResponse.json(
        { error: 'Failed to start background processing', details: errorText },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error triggering background processing:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}