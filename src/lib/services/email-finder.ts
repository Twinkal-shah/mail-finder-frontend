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
  const apiUrl = 'http://server.mailsfinder.com:8081'
  const maxRetries = 3
  const timeoutMs = 30000 // 30 seconds timeout
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      
      const response = await fetch(`${apiUrl}/find`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          names: [request.full_name],
          domain: request.domain
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }
      
      const data = await response.json()
      const payload = typeof data?.result === 'object' && data.result !== null ? data.result : data
      const rawStatus = typeof payload?.status === 'string' ? payload.status : (typeof data?.status === 'string' ? data.status : undefined)
      const email: string | null = typeof payload?.email === 'string' ? payload.email : null
      let normalizedStatus: 'valid' | 'invalid' | 'error'
      if (email) {
        normalizedStatus = 'valid'
      } else if (rawStatus) {
        const s = rawStatus.toLowerCase()
        if (s === 'valid' || s === 'found' || s === 'success') {
          normalizedStatus = 'valid'
        } else if (s === 'invalid' || s === 'not_found' || s === 'failed') {
          normalizedStatus = 'invalid'
        } else {
          normalizedStatus = 'error'
        }
      } else {
        normalizedStatus = 'invalid'
      }
      const confidence = typeof payload?.confidence === 'number' ? payload.confidence : (normalizedStatus === 'valid' ? 95 : 0)
      const message = typeof payload?.message === 'string' ? payload.message : (normalizedStatus === 'valid' ? 'Email found' : normalizedStatus === 'invalid' ? 'No email found' : 'Email search completed')
      const catch_all = typeof payload?.catch_all === 'boolean' ? payload.catch_all : data?.catch_all
      const connections = typeof payload?.connections === 'number' ? payload.connections : data?.connections
      const domain = typeof payload?.domain === 'string' ? payload.domain : (typeof data?.domain === 'string' ? data.domain : undefined)
      const mx = typeof payload?.mx === 'string' ? payload.mx : (typeof data?.mx === 'string' ? data.mx : undefined)
      const time_exec = typeof payload?.time_exec === 'number' ? payload.time_exec : data?.time_exec
      const user_name = typeof payload?.user_name === 'string' ? payload.user_name : (typeof data?.user_name === 'string' ? data.user_name : undefined)
      const ver_ops = typeof payload?.ver_ops === 'number' ? payload.ver_ops : data?.ver_ops
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
      const isTimeout = error instanceof Error && error.name === 'AbortError'
      const isConnectionRefused = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')
      
      console.error(`🔥 Email finder API error (attempt ${attempt}/${maxRetries}) for ${request.full_name} @ ${request.domain}:`, {
        error: errorMessage,
        isTimeout,
        isConnectionRefused,
        errorType: error instanceof Error ? error.name : 'Unknown'
      })
      
      // If this is the last attempt, return error result
      if (attempt === maxRetries) {
        let finalMessage = 'Failed to find email due to API error'
        
        if (isTimeout) {
          finalMessage = 'Request timed out after 30 seconds'
        } else if (isConnectionRefused) {
          finalMessage = 'Unable to connect to email finder service'
        } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          finalMessage = 'Rate limit exceeded - too many requests'
        }
        
        return {
          email: null,
          confidence: 0,
          status: 'error',
          message: finalMessage
        }
      }
      
      // Wait before retrying (exponential backoff)
      const backoffDelay = Math.pow(2, attempt) * 1000
      console.log(`⏳ Retrying in ${backoffDelay}ms...`)
      await new Promise(resolve => setTimeout(resolve, backoffDelay))
    }
  }
  
  // This should never be reached, but just in case
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