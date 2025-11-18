import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Create Supabase client with service role
function createServiceClient() {
  return createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      get() { return undefined },
      set() {},
      remove() {},
    },
  })
}

// POST: Stop all running bulk verification jobs for the current user
export async function POST() {
  try {
    // Get current user for authorization
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = createServiceClient()

    // Update all processing jobs to failed status
    const { data: updatedJobs, error: updateError } = await supabase
      .from('bulk_verification_jobs')
      .update({
        status: 'failed',
        error_message: 'Job manually stopped due to insufficient credits',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .in('status', ['processing', 'pending'])
      .select()

    if (updateError) {
      console.error('Error stopping jobs:', updateError)
      return NextResponse.json(
        { error: 'Failed to stop jobs' },
        { status: 500 }
      )
    }

    console.log(`Stopped ${updatedJobs?.length || 0} bulk verification jobs for user ${user.id}`)

    return NextResponse.json({
      success: true,
      stoppedJobs: updatedJobs?.length || 0,
      message: 'All running bulk verification jobs have been stopped'
    })

  } catch (error) {
    console.error('Error stopping bulk verification jobs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}