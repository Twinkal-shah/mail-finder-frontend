import { apiGet, apiPut } from './api'

type Profile = {
  id: string
  full_name?: string
  email?: string
  plan?: string | null
  credits_find?: number
  credits_verify?: number
  lemonsqueezy_customer_id?: string | null
}

// Initialize user credits for new users (server-side only)
export async function initializeUserCredits(userId: string): Promise<boolean> {
  try {
    // If you want to initialize credits for a new user on backend,
    // implement it there; for now, no client-side action needed.
    return true
  } catch (error) {
    console.error('Error in initializeUserCredits:', error)
    return false
  }
}

// Update profile function for server-side operations
export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
  try {
    const res = await apiPut<Profile>('/api/user/profile/updateProfile', updates, { useProxy: true })
    if (!res.ok || !res.data) return null
    return res.data as Profile
  } catch (error) {
    console.error('Error in updateProfile:', error)
    return null
  }
}

// Get user credits breakdown (server-side)
export async function getUserCredits(userId: string): Promise<{
  total: number
  find: number
  verify: number
} | null> {
  try {
    const res = await apiGet<any>('/api/user/credits', { useProxy: true })
    if (!res.ok || !res.data) return null
    const d = res.data as any
    const find = Number(d.credits_find ?? d.find ?? d.findCredits ?? 0)
    const verify = Number(d.credits_verify ?? d.verify ?? d.verifyCredits ?? 0)
    return {
      total: find + verify,
      find,
      verify
    }
  } catch (error) {
    console.error('Error in getUserCredits:', error)
    return null
  }
}