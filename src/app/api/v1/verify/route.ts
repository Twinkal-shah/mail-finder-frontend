import { NextRequest } from 'next/server'
import { authenticateApiRequest, checkSufficientCredits, deductApiCredits, createApiErrorResponse, createApiSuccessResponse } from '@/lib/api-auth'
import { verifyEmail, type EmailVerifierRequest } from '@/lib/services/email-verifier'

interface VerifyEmailApiRequest {
  email: string
}

interface VerifyEmailApiResponse {
  email: string
  status: 'valid' | 'invalid' | 'risky' | 'unknown' | 'error'
  deliverable: boolean
  reason?: string
  credits_remaining: {
    find: number
    verify: number
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate API request
    const authResult = await authenticateApiRequest(request)
    if (!authResult.success) {
      return createApiErrorResponse(authResult.error || 'Authentication failed', 401)
    }

    // Parse request body
    let body: VerifyEmailApiRequest
    try {
      body = await request.json()
    } catch (error) {
      console.error('Error parsing request body:', error)
      return createApiErrorResponse('Invalid JSON in request body', 400)
    }

    // Validate required fields
    if (!body.email || typeof body.email !== 'string') {
      return createApiErrorResponse('email is required and must be a string', 400)
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return createApiErrorResponse('Invalid email format', 400)
    }

    // Check if user has sufficient credits
    const creditCheck = checkSufficientCredits(authResult, 1, 'verify')
    if (!creditCheck.sufficient) {
      return createApiErrorResponse(creditCheck.error || 'Insufficient credits', 402)
    }

    // Prepare email verification request
    const verificationRequest: EmailVerifierRequest = {
      email: body.email.trim().toLowerCase()
    }

    // Call email verification service
    const serviceResult = await verifyEmail(verificationRequest)

    // Deduct credits only when verification status is valid
    let creditsDeducted = false
    if (serviceResult.status === 'valid') {
      creditsDeducted = await deductApiCredits(authResult.userId!, 1, 'verify')
      if (!creditsDeducted) {
        console.error('Failed to deduct credits for user:', authResult.userId)
      }
    }

    // Calculate remaining credits (subtract 1 if deduction was successful)
    const remainingVerifyCredits = creditsDeducted
      ? (authResult.creditsVerify || 0) - 1
      : (authResult.creditsVerify || 0)

    // Map service result to API response format
    const apiResponse: VerifyEmailApiResponse = {
      email: body.email.trim().toLowerCase(),
      status: serviceResult.status || 'unknown',
      deliverable: serviceResult.deliverable || false,
      reason: serviceResult.reason || undefined,
      credits_remaining: {
        find: authResult.creditsFind || 0,
        verify: remainingVerifyCredits
      }
    }

    return createApiSuccessResponse(apiResponse)

  } catch (error) {
    console.error('API verify email error:', error)
    return createApiErrorResponse('Internal server error', 500)
  }
}

// Handle unsupported methods
export async function GET() {
  return createApiErrorResponse('Method not allowed. Use POST to verify emails.', 405)
}

export async function PUT() {
  return createApiErrorResponse('Method not allowed. Use POST to verify emails.', 405)
}

export async function DELETE() {
  return createApiErrorResponse('Method not allowed. Use POST to verify emails.', 405)
}

export async function PATCH() {
  return createApiErrorResponse('Method not allowed. Use POST to verify emails.', 405)
}