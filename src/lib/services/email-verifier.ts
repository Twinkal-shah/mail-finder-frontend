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

export async function verifyEmailReal(
  request: EmailVerifierRequest
): Promise<EmailVerifierResult> {
  try {
    // Get JWT token from cookies
    const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
    const accessToken = await getAccessTokenFromCookies()

    const backend =
      process.env.NEXT_PUBLIC_SERVER_URL ||
      process.env.NEXT_PUBLIC_LOCAL_URL ||
      'http://localhost:8000'

    // Prepare body
    const params = new URLSearchParams()
    params.set('email', request.email)

    // Call backend directly
    const res = await fetch(`${backend}/api/email/verifyEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: params.toString()
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`API request failed: ${res.status} - ${errorText}`)
    }

    const json = await res.json()

    // Extract data fields
    const details = json?.data?.details || {}
    const data = json?.data || {}

    // -------------------------------
    // 1️⃣ Extract raw status
    // -------------------------------
    let rawStatus =
      details?.status ||
      data?.status ||
      json?.status ||
      json?.email_status ||
      null

    rawStatus =
      typeof rawStatus === 'string'
        ? rawStatus.toLowerCase()
        : 'unknown'

    // -------------------------------
    // 2️⃣ Normalize into final status
    // -------------------------------
    let normalizedStatus: 'valid' | 'invalid' | 'risky' | 'unknown'

    switch (rawStatus) {
      case 'valid':
      case 'deliverable':
      case 'ok':
        normalizedStatus = 'valid'
        break

      case 'invalid':
      case 'undeliverable':
        normalizedStatus = 'invalid'
        break

      case 'risky':
      case 'catch_all':
      case 'catchall':
        normalizedStatus = 'risky'
        break

      default:
        normalizedStatus = 'unknown'
        break
    }

    // -------------------------------
    // 3️⃣ Extract reason/message
    // -------------------------------
    const reason =
      details?.message ||
      data?.message ||
      json?.message ||
      undefined

    // -------------------------------
    // 4️⃣ Confidence (using SMTP connections)
    // -------------------------------
    const confidence =
      typeof details?.connections === 'number'
        ? Math.min(100, details.connections * 20)
        : 0

    // -------------------------------
    // 5️⃣ Final return object
    // -------------------------------
    return {
      email: request.email,
      status: normalizedStatus,
      confidence,
      deliverable: normalizedStatus === 'valid',
      reason,
      catch_all: details?.catch_all,
      domain: details?.domain,
      mx: details?.mx,
      user_name: details?.user_name
    }
  } catch (error) {
    return {
      email: request.email,
      status: 'error',
      confidence: 0,
      deliverable: false,
      reason:
        error instanceof Error
          ? error.message
          : 'Failed to verify email'
    }
  }
}

export async function verifyEmail(
  request: EmailVerifierRequest
): Promise<EmailVerifierResult> {
  return verifyEmailReal(request)
}

export type { EmailVerifierResult, EmailVerifierRequest }
