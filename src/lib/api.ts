type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

interface RequestOptions {
  method?: HttpMethod
  headers?: Record<string, string>
  body?: string | Record<string, unknown> | FormData
  useProxy?: boolean
  includeAuth?: boolean
  token?: string | null
}

function getBackendBaseUrl(): string {
  return process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'
}

function getAppBaseUrl(): string {
  // Prefer explicit app URL for server-side absolute fetches
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    vercelUrl ||
    process.env.NEXT_PUBLIC_LOCAL_FRONTEND_URL ||
    'http://localhost:3000'
  )
}

function resolveUrl(path: string, useProxy?: boolean): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const isServer = typeof window === 'undefined'
  if (useProxy || path.startsWith('/api/')) {
    // In server environments, absolute URL is required
    if (isServer) {
      const base = getAppBaseUrl().replace(/\/$/, '')
      const p = path.startsWith('/') ? path : `/${path}`
      return `${base}${p}`
    }
    return path
  }
  const base = getBackendBaseUrl().replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<{ ok: boolean; status: number; data?: T; error?: string | Record<string, unknown> }> {
  const {
    method = 'GET',
    headers = {},
    body,
    useProxy,
    includeAuth = true,
    token
  } = options

  const url = resolveUrl(path, useProxy)

  const finalHeaders: Record<string, string> = { ...headers }
  if (body != null && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json'
  }

  // Auto-attach access-token from localStorage if none provided
  let authToken: string | null = null;
  if (includeAuth) {
    authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null);
  }
  if (authToken && !finalHeaders['Authorization']) {
    finalHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  // In server environment, forward cookies and token to same-origin API routes
  const isServer = typeof window === 'undefined'
  if (isServer && (useProxy || path.startsWith('/api/'))) {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      if (cookieStore && !finalHeaders['Cookie']) {
        // Forward the full cookie header so API routes can read user session
        finalHeaders['Cookie'] = cookieStore.toString()
      }
      if (includeAuth && !finalHeaders['Authorization']) {
        const tokenCookie = cookieStore.get('access_token')?.value
        if (tokenCookie) {
          finalHeaders['Authorization'] = `Bearer ${tokenCookie}`
        }
      }
    } catch {
      // Silently ignore if cookies are not available in this context
    }
  }

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    credentials: 'include'
  })

  // Read body once to avoid "Body is unusable" errors on server
  const contentType = res.headers.get('content-type') || ''
  const rawText = await res.text()
  let data: unknown = undefined
  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(rawText)
    } catch {
      // If JSON parsing fails, keep raw text
    }
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: (data && typeof data === 'object' && Object.keys(data).length > 0 ? data : rawText) as string | Record<string, unknown> }
  }
  return { ok: true, status: res.status, data: (data && typeof data === 'object' && Object.keys(data).length > 0 ? data : rawText) as T }
}

export async function apiGet<T = unknown>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
  return apiRequest<T>(path, { ...opts, method: 'GET' })
}

export async function apiPost<T = unknown>(path: string, body?: string | Record<string, unknown> | FormData, opts: Omit<RequestOptions, 'method'> = {}) {
  return apiRequest<T>(path, { ...opts, method: 'POST', body })
}

export async function apiPut<T = unknown>(path: string, body?: string | Record<string, unknown> | FormData, opts: Omit<RequestOptions, 'method'> = {}) {
  return apiRequest<T>(path, { ...opts, method: 'PUT', body })
}

export async function apiDelete<T = unknown>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
  return apiRequest<T>(path, { ...opts, method: 'DELETE' })
}