import { apiGet } from '@/lib/api'

export type Profile = {
  id: string
  full_name?: string
  email?: string
  company?: string | null
  plan?: string | null
  plan_expiry?: string | null
  credits_find?: number
  credits_verify?: number
  lemonsqueezy_customer_id?: string | null
}

export async function getProfileData(): Promise<Profile | null> {
  const res = await apiGet<Profile>('/api/user/profile/getProfile', { useProxy: true })
  if (!res.ok || !res.data) return null
  return res.data as Profile
}

export async function getProfileDataClient(): Promise<Profile | null> {
  try {
    const res = await apiGet<Profile>('/api/user/profile/getProfile', { useProxy: true })
    if (!res.ok || !res.data) return null
    return res.data as Profile
  } catch {
    // swallow network / 404 errors on client; UI will show fallback
    return null
  }
}

