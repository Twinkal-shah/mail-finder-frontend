'use client'

import { useQuery } from '@tanstack/react-query'
import { getTransactionHistory, getCreditUsageHistory } from '@/app/(dashboard)/credits/actions'
import { useEffect, useState } from 'react'
import { getProfileDataClient } from '@/lib/profile'
import { apiGet } from '@/lib/api'

// Hook for user profile with credits - client-side version
export function useUserProfile() {
  const [profile, setProfile] = useState<{
    id: string
    email: string
    full_name: string
    plan: string
    credits_find: number
    credits_verify: number
    total_credits: number
  } | null>(null)
  
  useEffect(() => {
    ;(async () => {
      try {
        const p = await getProfileDataClient()
        let findCredits = 0
        let verifyCredits = 0
        try {
          const res = await apiGet<Record<string, unknown>>('/api/user/credits', { useProxy: true })
          if (res.ok && res.data) {
            const d = res.data as Record<string, unknown>
            findCredits = Math.max(Number(d['find'] ?? d['credits_find'] ?? 0), 0)
            verifyCredits = Math.max(Number(d['verify'] ?? d['credits_verify'] ?? 0), 0)
          }
        } catch {}
        if (p) {
          const profileData = {
            id: p.id,
            email: p.email || '',
            full_name: (p.full_name as string) || 'User',
            plan: (p.plan as string) || 'free',
            credits_find: Math.max(findCredits, 0),
            credits_verify: Math.max(verifyCredits, 0),
            total_credits: Math.max(findCredits, 0) + Math.max(verifyCredits, 0)
          }
          setProfile(profileData)
        } else {
          setProfile({
            id: 'guest',
            email: 'Please log in',
            full_name: 'Guest User',
            plan: 'free',
            credits_find: 0,
            credits_verify: 0,
            total_credits: 0
          })
        }
      } catch {
        setProfile({
          id: 'guest',
          email: 'Please log in',
          full_name: 'Guest User',
          plan: 'free',
          credits_find: 0,
          credits_verify: 0,
          total_credits: 0
        })
      }
    })()
  }, [])
  
  return { data: profile, isLoading: false, isError: false, error: null, refetch: () => {} }
}

// Hook for transaction history
export function useTransactionHistory(limit: number = 10) {
  return useQuery({
    queryKey: ['transactionHistory', limit],
    queryFn: () => getTransactionHistory(),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000, // 3 minutes
    retry: 2,
  })
}

// Hook for credit usage history
export function useCreditUsageHistory() {
  return useQuery({
    queryKey: ['creditUsageHistory'],
    queryFn: getCreditUsageHistory,
    staleTime: 30 * 1000, // 30 seconds for more real-time updates
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    refetchInterval: 60 * 1000, // Auto-refetch every minute for real-time updates
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
  })
}

// Combined hook for all credits data
export function useCreditsData() {
  const profileQuery = useUserProfile()
  const transactionsQuery = useTransactionHistory()
  const usageQuery = useCreditUsageHistory()

  return {
    profile: profileQuery.data,
    transactions: transactionsQuery.data || [],
    creditUsage: usageQuery.data || [],
    isLoading: profileQuery.isLoading || transactionsQuery.isLoading || usageQuery.isLoading,
    isError: profileQuery.isError || transactionsQuery.isError || usageQuery.isError,
    error: profileQuery.error || transactionsQuery.error || usageQuery.error,
    refetch: () => {
      profileQuery.refetch()
      transactionsQuery.refetch()
      usageQuery.refetch()
    }
  }
}