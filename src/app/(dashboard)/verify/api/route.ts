import { NextRequest, NextResponse } from 'next/server'
import { verifyEmail, type EmailVerifierRequest } from '@/lib/services/email-verifier'

interface VerifyEmailRequest {
  email: string
}

interface VerifyEmailResponse {
  email: string
  status: 'valid' | 'invalid' | 'risky' | 'unknown' | 'error'
  deliverable: boolean
  reason?: string
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    // Get current user using the same method as other dashboard APIs
    // Use server-side function instead of client-side getCurrentUser
    const { getCurrentUserFromCookies, getAccessTokenFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    // Check if plan has expired and get credits from profile data
    const backend = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
    const cookie = request.headers.get('cookie') || ''
    const accessToken = await getAccessTokenFromCookies()
    
    // Parse request body first
    let body: VerifyEmailRequest
    try {
      body = await request.json()
    } catch (error) {
      console.error('Error parsing request body:', error)
      return Response.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.email || typeof body.email !== 'string') {
      return Response.json(
        { error: 'email is required and must be a string' },
        { status: 400 }
      )
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return Response.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check if user has sufficient credits and plan status (get from profile data)
    let availableCredits = 0;
    try {
      const profileHeaders: Record<string, string> = {}
      if (cookie) profileHeaders.Cookie = cookie
      if (accessToken) profileHeaders.Authorization = `Bearer ${accessToken}`
      const origin = request.nextUrl.origin
      const profileRes = await fetch(`${origin}/api/user/profile/getProfile`, {
        method: 'GET',
        headers: profileHeaders,
        cache: 'no-store',
      })
      
      if (profileRes.ok) {
        const profileData = await profileRes.json()
        
        // Check plan expiration
        if (profileData.plan_expired) {
          return NextResponse.json(
            { error: 'Your plan has expired. Please upgrade to Pro.' },
            { status: 403 }
          )
        }
        
        // Extract credits from profile data - handle different field names
        const pd = profileData
        availableCredits = pd.credits_verify || pd.verify || pd.verifyCredits || pd.credits || pd.total_credits ||
          (pd.data?.credits_verify || pd.data?.verify || pd.data?.verifyCredits || pd.data?.credits || pd.data?.total_credits) || 0
        if (!availableCredits || availableCredits < 1) {
          const fallbackUser = user
          const fallbackCredits = Number(fallbackUser?.credits_verify ?? 0)
          availableCredits = fallbackCredits
        }
        if (availableCredits < 1) {
          return NextResponse.json(
            { error: 'Insufficient verify credits' },
            { status: 402 }
          )
        }
      } else {
        const fallbackCredits = Number(user?.credits_verify ?? 0)
        availableCredits = fallbackCredits
        if (availableCredits < 1) {
          return NextResponse.json(
            { error: 'Insufficient verify credits' },
            { status: 402 }
          )
        }
      }
    } catch {
      const fallbackCredits = Number(user?.credits_verify ?? 0)
      availableCredits = fallbackCredits
      if (availableCredits < 1) {
        return NextResponse.json(
          { error: 'Insufficient verify credits' },
          { status: 402 }
        )
      }
    }

    // Prepare email verification request
    const verificationRequest: EmailVerifierRequest = {
      email: body.email.trim().toLowerCase()
    }

    // Call email verification service
    const serviceResult = await verifyEmail(verificationRequest)

    // Deduct credits after successful verification via backend API (use profile endpoint)
    try {
      const updateHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (cookie) updateHeaders.Cookie = cookie
      if (accessToken) updateHeaders.Authorization = `Bearer ${accessToken}`
      const deductResponse = await fetch(`${backend}/api/user/profile/updateProfile`, {
        method: 'PUT',
        headers: updateHeaders,
        body: JSON.stringify({
          credits_verify: availableCredits - 1,
          metadata: {
            email: body.email,
            result: serviceResult.status,
            operation: 'email_verify'
          }
        })
      })
      
      if (!deductResponse.ok) {
        console.error('Failed to deduct credits via backend:', await deductResponse.text())
        // Don't fail the entire request if credit deduction fails
      }
    } catch (deductError) {
      console.error('Error in deductCredits:', deductError)
      // Don't fail the entire request if credit deduction fails
      // but log it for debugging
    }
    // Map service result to API response
    const response: VerifyEmailResponse = {
      email: serviceResult.email,
      status: serviceResult.status,
      deliverable: serviceResult.deliverable || false,
      reason: serviceResult.reason,
      error: serviceResult.status === 'error' ? serviceResult.reason : undefined
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Email verification error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        email: '',
        status: 'error' as const,
        deliverable: false
      },
      { status: 500 }
    )
  }
}

// Handle unsupported HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to verify emails.' },
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to verify emails.' },
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to verify emails.' },
    { status: 405 }
  )
}

export const runtime = 'nodejs'