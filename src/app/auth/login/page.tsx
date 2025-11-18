'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { apiPost } from '@/lib/api'
import { getRedirectUrl } from '@/lib/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  

  const handleBackendLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Use our apiPost helper so the token is stored automatically
      const res = await apiPost('/api/user/auth/login', { email, password }, { includeAuth: false })
      console.log('Login response:', res)
      if (!res.ok) {
        setError((res.error && (res.error.message || res.error.error)) || `Login failed (${res.status})`)
        return
      }
      // Backend returns { accessToken, user }
      const { accessToken, user } = res.data as { accessToken: string; user: { id: string; email: string, firstName?: string, lastName?: string } }
      
      // Store in localStorage
      try {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('user_data', JSON.stringify(user))
      } catch (e) {
        console.error('Error storing in localStorage:', e)
      }
      
      console.log('Redirecting to /find')
      
      // Check if there's a redirect URL saved
      const redirectUrl = getRedirectUrl()
      const targetUrl = redirectUrl || '/find'
      
      console.log('Redirecting to:', targetUrl)
      // Use window.location for reliable redirect
      window.location.href = targetUrl
    } catch (e: unknown) {
      console.error('Login error:', e)
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setIsLoading(false)
    }
  }

  const registerInBackend = async (payload: { email: string; password: string; firstName: string; lastName: string; phone: string; company?: string | null }) => {
    try {
      // Use apiPost helper for consistency
      const res = await apiPost('/api/user/auth/signup', payload, { includeAuth: false })
      console.log('Signup API response:', res)
      
      if (res.ok && res.data) {
        return { ok: true, data: res.data }
      }
      
      // Handle "email already exists" case - we need to try login instead
      const errorMsg = res.error?.message || res.error?.error || ''
      if (res.status === 400 && errorMsg.toLowerCase().includes('already registered')) {
        console.log('Email already registered, will proceed to login...')
        return { ok: true, data: null } // Signal that we should try login
      }
      
      // Handle 409 conflict (already exists)
      if (res.status === 409) {
        console.log('Email already exists, will proceed to login...')
        return { ok: true, data: null } // Signal that we should try login
      }
      
      // Other errors
      const msg = errorMsg || `HTTP ${res.status}`
      return { ok: false, error: msg }
    } catch (e: any) {
      console.error('Signup error:', e)
      return { ok: false, error: e?.message || 'Network error' }
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        // Register only in backend
        const nameParts = fullName.trim().split(/\s+/)
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''
        console.log('Attempting signup with:', { email, firstName, lastName, phone: phone.trim() })
        const backendResult = await registerInBackend({
          email,
          password,
          firstName,
          lastName,
          phone: phone.trim(),
          company: company || null
        })
        console.log('Signup result:', backendResult)
        if (!backendResult.ok) {
          setError(`Backend registration failed: ${backendResult.error}`)
          return
        }
        
        // Check if we got signup data or need to login
        if (backendResult.data) {
          // Signup successful - redirect to login page to force login
          console.log('Signup successful, redirecting to login...')
          // Clear the form and switch to login mode
          setIsSignUp(false)
          setSuccess('Account created successfully! Please log in to continue.')
          setError(null) // Clear any previous errors
          // Optionally clear password field for security
          setPassword('')
        } else {
          // Email already exists or no data returned - try login
          console.log('Email exists or no signup data, attempting login...')
          await handleBackendLogin()
        }
      } else {
        // Sign in via backend only
        await handleBackendLogin()
      }
    } catch (error: Error | unknown) {
      setError(error instanceof Error ? error.message : 'An unexpected error occurred')
      setSuccess(null) // Clear success message on error
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </CardTitle>
          <CardDescription className="text-center">
            {isSignUp 
              ? 'Enter your details to create your account'
              : 'Enter your email and password to access your account'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required={isSignUp}
                placeholder="Enter your full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required={isSignUp}
                placeholder="Enter your phone number"
              />
            </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company (Optional)</Label>
                  <Input
                    id="company"
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Enter your company name"
                  />
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                minLength={6}
              />
            </div>

            {success && (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}
            
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            {!isSignUp && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 mb-2">
                  <strong>New to MailsFinder?</strong>
                </p>
                <p className="text-sm text-blue-700 mb-3">
                  Create an account to start finding and verifying emails today!
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
                setSuccess(null) // Clear success message when switching modes
                setFullName('')
                setCompany('')
                setPhone('')
              }}
              className="text-sm text-blue-600 hover:text-blue-500 font-medium"
            >
              {isSignUp 
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"
              }
            </button>
          </div>


        </CardContent>
      </Card>
    </div>
  )
}