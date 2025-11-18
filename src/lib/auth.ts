'use client'

// Check if user is authenticated
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  
  try {
    const accessToken = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user_data')
    
    return !!(accessToken && userData)
  } catch (error) {
    console.error('Error checking authentication:', error)
    return false
  }
}

// Get current user data
export function getCurrentUser() {
  if (typeof window === 'undefined') {
    return null
  }
  
  try {
    const userDataStr = localStorage.getItem('user_data')
    if (!userDataStr) return null
    
    return JSON.parse(userDataStr)
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

// Get access token
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  
  try {
    return localStorage.getItem('access_token')
  } catch (error) {
    console.error('Error getting access token:', error)
    return null
  }
}

// Clear all authentication data
export function clearAuthData() {
  if (typeof window === 'undefined') {
    return
  }
  
  try {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_data')
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
  } catch (error) {
    console.error('Error clearing auth data:', error)
  }
}

// Save redirect URL for after login
export function saveRedirectUrl(url: string) {
  if (typeof window === 'undefined') {
    return
  }
  
  try {
    sessionStorage.setItem('redirect_after_login', url)
  } catch (error) {
    console.error('Error saving redirect URL:', error)
  }
}

// Get and clear redirect URL
export function getRedirectUrl(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  
  try {
    const url = sessionStorage.getItem('redirect_after_login')
    if (url) {
      sessionStorage.removeItem('redirect_after_login')
    }
    return url
  } catch (error) {
    console.error('Error getting redirect URL:', error)
    return null
  }
}