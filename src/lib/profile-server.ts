import { apiGet, apiPut } from './api'
import { cookies } from 'next/headers'

type Profile = {
  id: string
  full_name?: string
  email?: string
  plan?: string | null
  credits_find?: number
  credits_verify?: number
  lemonsqueezy_customer_id?: string | null
}

export async function initializeUserCredits(): Promise<boolean> {
  return true
}

export async function updateProfile(updates: Partial<Profile>): Promise<Profile | null> {
  try {
    const res = await apiPut<Profile>('/api/user/profile/updateProfile', updates, { useProxy: true })
    if (!res.ok || !res.data) return null
    return res.data as Profile
  } catch {
    return null
  }
}

export async function getUserCredits(): Promise<{
  total: number
  find: number
  verify: number
} | null> {
  try {
    const cookieStore = await cookies()
    const cookieHeader = cookieStore.toString()

    const { getAccessTokenFromCookies } = await import('@/lib/auth-server')
    const token = await getAccessTokenFromCookies()

    interface CreditsResponse {
      credits_find?: number
      credits_verify?: number
      credits?: number
      find?: number
      verify?: number
      findCredits?: number
      verifyCredits?: number
    }

    // ⭐ DO NOT use baseURL here
    const res = await apiGet<CreditsResponse>('/api/user/credits', {
      useProxy: true,
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
    })

    if (!res.ok || !res.data) {
      const { getCurrentUserFromCookies } = await import('@/lib/auth-server')
      const user = await getCurrentUserFromCookies()
      if (user) {
        const findFallback = Number((user as Record<string, unknown>).credits_find ?? 0)
        const verifyFallback = Number((user as Record<string, unknown>).credits_verify ?? 0)
        return {
          total: findFallback + verifyFallback,
          find: findFallback,
          verify: verifyFallback
        }
      }
      return null
    }

    const d = res.data as CreditsResponse

    const find = Number(d.credits_find ?? d.find ?? d.findCredits ?? 0)
    const verify = Number(d.credits_verify ?? d.verify ?? d.verifyCredits ?? 0)

    return {
      total: find + verify,
      find,
      verify
    }
  } catch (error) {
    console.error("Error fetching credits:", error)
    return null
  }
}
