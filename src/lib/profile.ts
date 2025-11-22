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
  const res = await apiGet<Record<string, unknown>>('/api/user/profile/getProfile', { useProxy: true })
  if (!res.ok || !res.data) return null
  const d = res.data as Record<string, unknown>
  const profile = (d && typeof d === 'object' && 'data' in d ? (d.data as Profile) : (d as unknown as Profile))
  return profile || null
}

export async function getProfileDataClient(): Promise<Profile | null> {
  try {
    const res = await apiGet<Record<string, unknown>>('/api/user/profile/getProfile', { useProxy: true })
    if (!res.ok || !res.data) return null
    const d = res.data as Record<string, unknown>
    const profile = (d && typeof d === 'object' && 'data' in d ? (d.data as Profile) : (d as unknown as Profile))
    return profile || null
  } catch {
    return null
  }
}

