import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { processJobInBackground } from '@/lib/bulk-finder-processor'

async function createSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

// GET endpoint to fetch user bulk finder jobs
export async function GET() {
  try {
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      console.log('GET bulk finder jobs - No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createSupabaseClient()
    
    const { data: jobs, error } = await supabase
      .from('bulk_finder_jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching bulk finder jobs:', error)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    return NextResponse.json({ jobs })
  } catch (error) {
    console.error('GET bulk finder jobs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST endpoint for background processing
export async function POST(request: NextRequest) {
  try {
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      console.log('POST bulk finder jobs - No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { jobId } = body
    
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    }

    // Start background processing with proper error handling
    processJobInBackground(jobId).catch(async (error) => {
      console.error('Background processing failed for job:', jobId, error)
      
      // Update job status to failed if background processing fails
      try {
        const supabase = await createSupabaseClient()
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
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST bulk finder job error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Background processing function