export type BulkFindItem = { domain: string; first_name: string; last_name: string }

export function toHostname(input: string): string {
  let s = (input || '').trim()
  s = s.replace(/^`+|`+$/g, '')
  s = s.replace(/^"+|"+$/g, '')
  s = s.replace(/^'+|'+$/g, '')
  s = s.replace(/\s+/g, '')
  try {
    if (/^[a-zA-Z]+:\/\//.test(s)) {
      const u = new URL(s)
      s = u.hostname
    } else {
      if (s.includes('@')) s = s.split('@').pop() as string
      s = s.split('/')[0]
      s = s.split('?')[0]
      s = s.split('#')[0]
    }
  } catch {}
  s = s.replace(/^www\./i, '')
  s = s.toLowerCase()
  const ok = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(s)
  return ok ? s : ''
}

export function buildBulkFindPayload(rows: Array<{ fullName: string; domain: string }>): BulkFindItem[] {
  const out: BulkFindItem[] = []
  for (const r of rows) {
    const host = toHostname(r.domain)
    if (!host) continue
    const parts = (r.fullName || '').trim().split(/\s+/)
    const first = parts[0] || ''
    const last = parts.slice(1).join(' ') || ''
    if (!first || !last) continue
    out.push({ domain: host, first_name: first, last_name: last })
  }
  return out
}

export function chunk<T>(list: T[], size: number): T[][] {
  const res: T[][] = []
  for (let i = 0; i < list.length; i += size) res.push(list.slice(i, i + size))
  return res
}

export async function bulkFind(
  rows: Array<{ fullName: string; domain: string }>,
  startBatchSize = 5,
  maxConcurrency = 2,
  onProgress?: (completed: number, total: number) => void
): Promise<{ items: Array<Record<string, unknown>>; totalCredits: number }> {
  const payload = buildBulkFindPayload(rows)
  if (payload.length === 0) return { items: [], totalCredits: 0 }
  let batchSize = Math.max(2, startBatchSize)
  const queue: { items: BulkFindItem[]; size: number }[] = chunk(payload, batchSize).map(part => ({ items: part, size: batchSize }))
  const total = queue.length
  let completed = 0
  let totalCredits = 0
  const out: Array<Record<string, unknown>> = []
  const apiBase = (process.env.NEXT_PUBLIC_CORE_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '')
  const sameOrigin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : ''
  let accessToken: string | null = (typeof window !== 'undefined' ? localStorage.getItem('access_token') : null)
  let refreshToken: string | null = (typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null)
  const buildHeaders = () => ({
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  })
  const tryRefresh = async () => {
    if (!refreshToken) return false
    try {
      const res = await fetch((sameOrigin ? `${sameOrigin}/api/user/auth/refresh` : `${apiBase}/user/auth/refresh`), {
        method: 'GET',
        headers: { refreshtoken: `Bearer ${refreshToken}` },
        credentials: 'include',
        mode: 'cors'
      })
      const body = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok || (body as Record<string, unknown>)?.['success'] === false) return false
      const data = (body as Record<string, unknown>)?.['data'] as Record<string, unknown> | undefined
      const newAccess = typeof data?.['access_token'] === 'string' ? (data['access_token'] as string) : undefined
      const newRefresh = typeof data?.['refresh_token'] === 'string' ? (data['refresh_token'] as string) : undefined
      if (newAccess) {
        accessToken = newAccess
        if (typeof window !== 'undefined') localStorage.setItem('access_token', newAccess)
      }
      if (newRefresh) {
        refreshToken = newRefresh
        if (typeof window !== 'undefined') localStorage.setItem('refresh_token', newRefresh)
      }
      return !!newAccess
    } catch {
      return false
    }
  }
  const worker = async () => {
    while (queue.length) {
      const task = queue.shift() as { items: BulkFindItem[]; size: number }
      try {
        let resp = await fetch((sameOrigin ? `${sameOrigin}/api/email/findBulkEmail` : `${apiBase}/email/findBulkEmail`), {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(task.items),
          credentials: 'include',
          mode: 'cors'
        })
        let body: unknown
        try {
          body = await resp.json()
        } catch {
          body = {}
        }
        const bodyObj: Record<string, unknown> = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
        const bodySuccess = typeof bodyObj['success'] === 'boolean' ? (bodyObj['success'] as boolean) : undefined
        const bodyStatus = typeof bodyObj['status'] === 'number' ? (bodyObj['status'] as number) : undefined
        const bodyJwtError = typeof bodyObj['jwtError'] === 'boolean' ? (bodyObj['jwtError'] as boolean) : undefined
        const bodyMessage = typeof bodyObj['message'] === 'string' ? (bodyObj['message'] as string) : undefined
        if (!resp.ok || bodySuccess === false) {
          const status = resp.status || bodyStatus
          if (status === 401 || bodyJwtError === true || bodyMessage === 'unauthorized') {
            const refreshed = await tryRefresh()
            if (refreshed) {
              resp = await fetch((sameOrigin ? `${sameOrigin}/api/email/findBulkEmail` : `${apiBase}/email/findBulkEmail`), {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify(task.items),
                credentials: 'include',
                mode: 'cors'
              })
              try { body = await resp.json() } catch { body = {} }
              const retryObj: Record<string, unknown> = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
              const retrySuccess = typeof retryObj['success'] === 'boolean' ? (retryObj['success'] as boolean) : undefined
              const retryData = typeof retryObj['data'] === 'object' && retryObj['data'] !== null ? (retryObj['data'] as Record<string, unknown>) : undefined
              const retryResults = Array.isArray(retryData?.['results']) ? (retryData?.['results'] as Array<Record<string, unknown>>) : []
              const retryCredits = Number(retryData?.['totalCredits'] ?? 0)
              if (resp.ok && retrySuccess !== false) {
                const results = retryResults
                const credits = retryCredits
                totalCredits += credits
                for (const it of results) out.push(it)
                continue
              }
            }
          }
          if (status === 504) {
            await new Promise(r => setTimeout(r, 800))
            queue.unshift(task)
            continue
          }
          if (status === 400 && task.size > 2) {
            const newSize = Math.max(2, Math.floor(task.size / 2))
            const parts = chunk(task.items, newSize)
            for (const p of parts) queue.unshift({ items: p, size: newSize })
            batchSize = newSize
            continue
          }
          const bodyError = typeof bodyObj['error'] === 'string' ? (bodyObj['error'] as string) : undefined
          const msg = bodyMessage || bodyError || `Request failed (${status})`
          console.error('bulkFind batch error:', msg)
          continue
        }
        const dataObj: Record<string, unknown> | undefined = typeof bodyObj['data'] === 'object' && bodyObj['data'] !== null ? (bodyObj['data'] as Record<string, unknown>) : undefined
        const results = Array.isArray(dataObj?.['results']) ? (dataObj?.['results'] as Array<Record<string, unknown>>) : []
        const credits = Number(dataObj?.['totalCredits'] ?? 0)
        totalCredits += credits
        for (const it of results) out.push(it)
      } finally {
        completed++
        if (onProgress) onProgress(completed, total)
      }
    }
  }
  const workers = Array(Math.max(1, maxConcurrency)).fill(0).map(() => worker())
  await Promise.all(workers)
  return { items: out, totalCredits }
}
