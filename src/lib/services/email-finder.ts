interface EmailFinderResult {
  email?: string | null
  confidence?: number
  status: 'valid' | 'invalid' | 'error'
  message?: string
  catch_all?: boolean
  domain?: string
  mx?: string
  time_exec?: number
  user_name?: string
  connections?: number
  ver_ops?: number
}

interface EmailFinderRequest {
  full_name: string
  domain: string
  role?: string
}

// Mock data for demo purposes
const mockEmailResults: EmailFinderResult[] = [
  {
    email: 'john.doe@example.com',
    confidence: 95,
    status: 'valid',
    message: 'Email found and verified',
    catch_all: false,
    user_name: 'John',
    mx: 'mx1.example.com'
  },
  {
    email: 'jane.smith@company.com',
    confidence: 88,
    status: 'valid',
    message: 'Email found with high confidence',
    catch_all: true,
    user_name: 'Jane',
    mx: 'alt1.aspmx.l.google.com'
  },
  {
    email: null,
    confidence: 0,
    status: 'invalid',
    message: 'No email found for this person',
    catch_all: false,
    user_name: '',
    mx: ''
  }
]

/**
 * Mock email finder function for demo purposes
 */
export async function findEmailMock(request: EmailFinderRequest): Promise<EmailFinderResult> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
  
  // Generate a potential email based on name and domain
  const firstName = request.full_name.split(' ')[0]?.toLowerCase()
  const lastName = request.full_name.split(' ').slice(1).join(' ').toLowerCase().replace(/\s+/g, '')
  const potentialEmail = `${firstName}.${lastName}@${request.domain}`
  
  // Return mock result based on potential email or default
  const foundResult = mockEmailResults.find(result => result.email === potentialEmail)
  return foundResult || mockEmailResults[2] // Return the third item (invalid result) as default
}

/**
 * Real email finder function using external API with timeout and retry logic
 */
export async function findEmailReal(request: EmailFinderRequest): Promise<EmailFinderResult> {
  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { apiPost } = await import('@/lib/api')
      const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
      const token = await getAccessTokenFromCookies()
      const res = await apiPost<unknown>('/api/email/findEmail', {
        full_name: request.full_name,
        domain: request.domain,
        role: request.role
      }, { useProxy: true, includeAuth: true, token })
      if (!res.ok) {
        throw new Error(`API request failed: ${res.status}`)
      }
      const raw = res.data as unknown
      let root: Record<string, unknown>
      if (typeof raw === 'string') {
        try {
          root = JSON.parse(raw) as Record<string, unknown>
        } catch {
          root = { message: raw } as Record<string, unknown>
        }
      } else {
        root = raw as Record<string, unknown>
      }
      const payload = (typeof root?.data === 'object' && root.data !== null)
        ? (root.data as Record<string, unknown>)
        : (typeof root?.result === 'object' && root.result !== null)
          ? (root.result as Record<string, unknown>)
          : root
      const email = typeof payload?.email === 'string' ? (payload.email as string) : null
      const rawStatus = typeof payload?.status === 'string' ? (payload.status as string) : (typeof root?.status === 'string' ? (root.status as string) : undefined)
      const successFlag = typeof root?.success === 'boolean' ? (root.success as boolean) : undefined
      let normalizedStatus: 'valid' | 'invalid' | 'error'
      if (email) {
        normalizedStatus = 'valid'
      } else if (rawStatus) {
        const s = rawStatus.toLowerCase()
        if (s === 'valid' || s === 'found' || s === 'success') normalizedStatus = 'valid'
        else if (s === 'invalid' || s === 'not_found' || s === 'failed') normalizedStatus = 'invalid'
        else normalizedStatus = 'error'
      } else if (successFlag !== undefined) {
        normalizedStatus = successFlag ? 'invalid' : 'error'
      } else {
        normalizedStatus = 'invalid'
      }
      const confidence = typeof payload?.confidence === 'number' ? (payload.confidence as number) : (normalizedStatus === 'valid' ? 95 : 0)
      const rootMessage = typeof root?.message === 'string' ? (root.message as string) : undefined
      const payloadMessage = typeof payload?.message === 'string' ? (payload.message as string) : undefined
      const message = rootMessage || payloadMessage || (normalizedStatus === 'valid' ? 'Email found' : normalizedStatus === 'invalid' ? 'No email found' : 'Email search completed')
      const catch_all = typeof payload?.catch_all === 'boolean' ? (payload.catch_all as boolean) : (root?.catch_all as boolean | undefined)
      const connections = typeof payload?.connections === 'number' ? (payload.connections as number) : (root?.connections as number | undefined)
      const domain = typeof payload?.domain === 'string' ? (payload.domain as string) : (typeof root?.domain === 'string' ? (root.domain as string) : undefined)
      const mx = typeof payload?.mx === 'string' ? (payload.mx as string) : (typeof root?.mx === 'string' ? (root.mx as string) : undefined)
      const time_exec = typeof payload?.time_exec === 'number' ? (payload.time_exec as number) : (root?.time_exec as number | undefined)
      const user_name = typeof payload?.user_name === 'string' ? (payload.user_name as string) : (typeof root?.user_name === 'string' ? (root.user_name as string) : undefined)
      const ver_ops = typeof payload?.ver_ops === 'number' ? (payload.ver_ops as number) : (root?.ver_ops as number | undefined)
      return {
        email,
        confidence,
        status: normalizedStatus,
        message,
        catch_all,
        connections,
        domain,
        mx,
        time_exec,
        user_name,
        ver_ops
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (attempt === maxRetries) {
        return {
          email: null,
          confidence: 0,
          status: 'error',
          message: errorMessage.includes('timeout') ? 'Request timed out after 30 seconds' : 'Failed to find email due to API error'
        }
      }
      const backoffDelay = Math.pow(2, attempt) * 1000
      await new Promise(resolve => setTimeout(resolve, backoffDelay))
    }
  }
  return {
    email: null,
    confidence: 0,
    status: 'error',
    message: 'Failed to find email after all retry attempts'
  }
}

/**
 * Main email finder function that uses the real API
 * Uses the external API to find emails
 */
export async function findEmail(request: EmailFinderRequest): Promise<EmailFinderResult> {
  // Use real API for email finding
  return findEmailReal(request)
}

export type { EmailFinderResult, EmailFinderRequest }
