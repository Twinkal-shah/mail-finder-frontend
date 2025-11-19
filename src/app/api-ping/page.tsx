'use client'

import { useEffect, useState } from 'react'

export default function ApiPingPage() {
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [details, setDetails] = useState<string>('')

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL || window.location.origin).replace(/\/$/, '')
    // Prefer same-origin calls first to leverage Next.js rewrites and avoid CORS
    const candidates = [
      `${window.location.origin}/api/ping`,
      `${window.location.origin}/ping`,
      `${base}/api/ping`,
      `${base}/ping`,
    ]

    async function ping() {
      for (const url of candidates) {
        try {
          const res = await fetch(url)
          const text = await res.text()
          if (res.ok) {
            setStatus('ok')
            setDetails(`OK ${res.status} ${res.statusText} from ${url}\n${text}`)
            return
          } else {
            setDetails(`Failed ${res.status}: ${text} on ${url}`)
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          setDetails(`Network/CORS error on ${url}: ${msg}`)
        }
      }
      setStatus('error')
    }

    ping()
  }, [])

  return (
    <div style={{ padding: 24 }}>
      <h1>API Ping</h1>
      <p>Status: {status}</p>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{details}</pre>
    </div>
  )
}