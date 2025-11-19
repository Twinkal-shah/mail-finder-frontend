'use client'

import { useState, useEffect, useCallback } from 'react'
type User = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

// Global state to prevent multiple simultaneous auth checks
let authCheckInProgress = false
let lastAuthCheck = 0
const AUTH_CHECK_COOLDOWN = 2000 // 2 seconds

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null
  })

  const checkAuth = useCallback(async () => {
    // Prevent multiple simultaneous auth checks
    const now = Date.now()
    if (authCheckInProgress || (now - lastAuthCheck < AUTH_CHECK_COOLDOWN)) {
      return
    }

    authCheckInProgress = true
    lastAuthCheck = now

    try {
      // Use the Next.js API route instead of direct backend call
      const res = await fetch('/api/user/me', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) {
        setAuthState({ user: null, loading: false, error: null })
        return
      }
      const backendUser = await res.json()
      setAuthState({ user: backendUser as User, loading: false, error: null })
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthState({ 
        user: null, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      })
    } finally {
      authCheckInProgress = false
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/user/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.error('Sign out error:', error)
    } finally {
      // Clear localStorage as well
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('user_data')
      }
      setAuthState({ user: null, loading: false, error: null })
    }
  }, [])

  return {
    ...authState,
    signOut,
    refreshAuth: checkAuth
  }
}

// Singleton pattern for auth state to prevent multiple instances
let globalAuthState: AuthState | null = null
let authStateListeners: ((state: AuthState) => void)[] = []

export function useGlobalAuth() {
  const [authState, setAuthState] = useState<AuthState>(
    globalAuthState || { user: null, loading: true, error: null }
  )

  useEffect(() => {
    // Subscribe to global auth state changes
    const listener = (state: AuthState) => {
      setAuthState(state)
    }
    authStateListeners.push(listener)

    // Initialize if not already done
    if (!globalAuthState) {
      const initAuth = async () => {
        try {
          const res = await fetch('/api/user/me', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          })
          let user: User | null = null
          if (res.ok) {
            user = await res.json()
          }
          const newState = {
            user,
            loading: false,
            error: null
          }
          globalAuthState = newState
          authStateListeners.forEach(l => l(newState))
        } catch (error) {
          const errorState = {
            user: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Authentication failed'
          }
          globalAuthState = errorState
          authStateListeners.forEach(l => l(errorState))
        }
      }
      initAuth()
    }

    return () => {
      authStateListeners = authStateListeners.filter(l => l !== listener)
    }
  }, [])

  return authState
}