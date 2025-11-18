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
    const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
    const user = await getCurrentUserFromCookies()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
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
          return NextResponse.json(
            { error: 'Your plan has expired. Please upgrade to Pro.' },
            { status: 403 }
          )
        }
      }
    } catch (error) {
      console.error('Error checking plan status:', error)
      // Continue with credit check even if plan check fails
    }

    // Parse request body
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

    // Check if user has sufficient credits via backend API
    try {
      const creditsRes = await fetch('/api/user/credits', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (creditsRes.ok) {
        const creditsData = await creditsRes.json()
        const availableCredits = creditsData.verify || 0
        if (availableCredits < 1) {
          return NextResponse.json(
            { error: 'Insufficient verify credits' },
            { status: 402 }
          )
        }
      } else {
        console.error('Failed to check credits:', await creditsRes.text())
        return NextResponse.json(
          { error: 'Failed to check credits' },
          { status: 500 }
        )
      }
    } catch (error) {
      console.error('Error checking credits:', error)
      return NextResponse.json(
        { error: 'Failed to check credits' },
        { status: 500 }
      )
    }

    // Prepare email verification request
    const verificationRequest: EmailVerifierRequest = {
      email: body.email.trim().toLowerCase()
    }

    // Call email verification service
    const serviceResult = await verifyEmail(verificationRequest)

    // Deduct credits after successful verification via backend API
    try {
      const deductResponse = await fetch('/api/user/credits/deduct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 1,
          type: 'verify',
          operation: 'email_verify',
          metadata: {
            email: body.email,
            result: serviceResult.status
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