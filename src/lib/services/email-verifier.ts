interface EmailVerifierResult {
  email: string
  status: 'valid' | 'invalid' | 'risky' | 'unknown' | 'error'
  confidence: number
  reason?: string
  deliverable?: boolean
  disposable?: boolean
  role_account?: boolean
  catch_all?: boolean
  domain?: string
  mx?: string
  user_name?: string
}

interface EmailVerifierRequest {
  email: string
}

// Mock verification results for demo purposes
const mockVerificationResults: Record<string, Omit<EmailVerifierResult, 'email'>> = {
  'john.doe@gmail.com': {
    status: 'valid',
    confidence: 95,
    deliverable: true,
    disposable: false,
    role_account: false
  },
  'test@10minutemail.com': {
    status: 'risky',
    confidence: 70,
    deliverable: true,
    disposable: true,
    role_account: false,
    reason: 'Disposable email provider'
  },
  'admin@company.com': {
    status: 'risky',
    confidence: 80,
    deliverable: true,
    disposable: false,
    role_account: true,
    reason: 'Role-based email account'
  },
  'invalid@nonexistentdomain12345.com': {
    status: 'invalid',
    confidence: 95,
    deliverable: false,
    disposable: false,
    role_account: false,
    reason: 'Domain does not exist'
  }
}

/**
 * Mock email verifier function for demo purposes
 */
export async function verifyEmailMock(request: EmailVerifierRequest): Promise<EmailVerifierResult> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800))
  
  // Handle undefined or null email
  if (!request || !request.email) {
    return {
      email: request?.email || 'unknown',
      status: 'error',
      confidence: 0,
      deliverable: false,
      disposable: false,
      role_account: false,
      reason: 'Invalid email address'
    }
  }
  
  const email = request.email.toLowerCase()
  
  // Check for specific mock results
  if (mockVerificationResults[email]) {
    return {
      email: request.email,
      ...mockVerificationResults[email]
    }
  }
  
  // Generate random result for unknown emails
  const randomStatus = Math.random()
  let status: EmailVerifierResult['status']
  let confidence: number
  let deliverable: boolean
  let reason: string | undefined
  
  if (randomStatus > 0.7) {
    status = 'valid'
    confidence = Math.floor(Math.random() * 20) + 80
    deliverable = true
  } else if (randomStatus > 0.5) {
    status = 'risky'
    confidence = Math.floor(Math.random() * 30) + 50
    deliverable = true
    reason = 'Catch-all domain'
  } else if (randomStatus > 0.3) {
    status = 'invalid'
    confidence = Math.floor(Math.random() * 20) + 80
    deliverable = false
    reason = 'Mailbox does not exist'
  } else {
    status = 'unknown'
    confidence = Math.floor(Math.random() * 40) + 30
    deliverable = false
    reason = 'Unable to verify'
  }
  
  return {
    email: request.email,
    status,
    confidence,
    deliverable,
    disposable: email.includes('temp') || email.includes('10minute'),
    role_account: /^(admin|info|support|contact|sales|marketing)@/.test(email),
    reason
  }
}

/**
 * Real email verifier function using external API
 */
export async function verifyEmailReal(request: EmailVerifierRequest): Promise<EmailVerifierResult> {
  const apiUrl = 'http://server.mailsfinder.com:8081'
  await new Promise(resolve => setTimeout(resolve, 1000))

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(`${apiUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: request.email
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API request failed: ${response.status} - ${errorText}`)
    }

    interface VerifierApiValid {
      status?: string
      connections?: number
      disposable?: boolean
      role_account?: boolean
      message?: string
      catch_all?: boolean
      domain?: string
      mx?: string
      user_name?: string
    }
    interface VerifierApiResponse {
      status?: string
      confidence?: number
      connections?: number
      disposable?: boolean
      role_account?: boolean
      message?: string
      error?: string
      catch_all?: boolean
      domain?: string
      mx?: string
      user_name?: string
      email_status?: string
      result?: { status?: string }
      valid?: VerifierApiValid | boolean
      details?: VerifierApiValid
    }

    const data = await response.json() as VerifierApiResponse

    const validData = typeof data.valid === 'object' && data.valid ? (data.valid as VerifierApiValid) : undefined
    const detailsData = data.details
    const resultData = typeof data.result === 'object' && data.result ? data.result : undefined

    const rawStatus = (validData?.status || detailsData?.status || resultData?.status || data.email_status || data.status)

    let normalizedStatus: EmailVerifierResult['status'] = rawStatus && typeof rawStatus === 'string' ? (rawStatus as EmailVerifierResult['status']) : 'unknown'

    const connections = typeof validData?.connections === 'number' ? validData.connections : (typeof detailsData?.connections === 'number' ? detailsData.connections : (typeof data.connections === 'number' ? data.connections : undefined))
    let confidence = typeof data.confidence === 'number' ? data.confidence : (typeof connections === 'number' ? Math.max(0, Math.min(100, connections * 20)) : 0)

    const reason = typeof validData?.message === 'string' ? validData.message : (typeof detailsData?.message === 'string' ? detailsData.message : (typeof data.message === 'string' ? data.message : (typeof data.error === 'string' ? data.error : undefined)))
    const disposable = typeof validData?.disposable === 'boolean' ? validData.disposable : (typeof detailsData?.disposable === 'boolean' ? detailsData.disposable : (typeof data.disposable === 'boolean' ? data.disposable : false))
    const role_account = typeof validData?.role_account === 'boolean' ? validData.role_account : (typeof detailsData?.role_account === 'boolean' ? detailsData.role_account : (typeof data.role_account === 'boolean' ? data.role_account : false))
    const catch_all = typeof validData?.catch_all === 'boolean' ? validData.catch_all : (typeof detailsData?.catch_all === 'boolean' ? detailsData.catch_all : (typeof data.catch_all === 'boolean' ? data.catch_all : false))
    const domain = typeof validData?.domain === 'string' ? validData.domain : (typeof detailsData?.domain === 'string' ? detailsData.domain : (typeof data.domain === 'string' ? data.domain : undefined))
    const mx = typeof validData?.mx === 'string' ? validData.mx : (typeof detailsData?.mx === 'string' ? detailsData.mx : (typeof data.mx === 'string' ? data.mx : undefined))
    const user_name = typeof validData?.user_name === 'string' ? validData.user_name : (typeof detailsData?.user_name === 'string' ? detailsData.user_name : (typeof data.user_name === 'string' ? data.user_name : undefined))

    if (normalizedStatus === 'unknown' && typeof reason === 'string' && reason.toLowerCase().includes('smtp failed for all mx records')) {
      normalizedStatus = 'risky'
      if (confidence === 0) confidence = 50
    }

    return {
      email: request.email,
      status: normalizedStatus,
      confidence,
      deliverable: normalizedStatus === 'valid',
      disposable,
      role_account,
      reason,
      catch_all,
      domain,
      mx,
      user_name
    }
  } catch (error) {
    console.error('Email verifier API error:', error)
    return {
      email: request.email,
      status: 'error',
      confidence: 0,
      deliverable: false,
      disposable: false,
      role_account: false,
      reason: 'Failed to verify email due to API error'
    }
  }
}

/**
 * Main email verifier function that uses the real API
 * Uses the external API to verify emails
 */
export async function verifyEmail(request: EmailVerifierRequest): Promise<EmailVerifierResult> {
  // Use real API for production
  return verifyEmailReal(request)
}

export type { EmailVerifierResult, EmailVerifierRequest }