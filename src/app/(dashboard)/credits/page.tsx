'use client'

import { useState, useMemo, memo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Coins, CreditCard, ExternalLink, History, TrendingUp, Calendar, CheckCircle, Plus } from 'lucide-react'
import { createLemonSqueezyCheckout, createLemonSqueezyPortal, createCustomCreditCheckout } from './actions'
import { useCreditsData } from '@/hooks/useCreditsData'
import { Line } from 'react-chartjs-2'
import { isAuthenticated, saveRedirectUrl } from '@/lib/auth'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface CreditTransaction {
  id: string
  user_id: string
  lemonsqueezy_order_id?: string
  lemonsqueezy_subscription_id?: string
  product_name: string
  product_type: string
  amount: number
  credits_find_added: number
  credits_verify_added: number
  status: string
  webhook_event: string
  metadata?: Record<string, unknown>
  created_at: string
}

// Removed unused interfaces - UserProfile and CreditUsage are now imported from hooks

const PLANS = {
  free: {
    name: 'Free Trial',
    price: '$0',
    duration: '3 days',
    features: ['25 Email Finds', '25 Email Verifications', 'Basic Support'],
    color: 'bg-gray-100 text-gray-800',
    icon: Calendar
  },
  pro: {
    name: 'Pro',
    price: '$49',
    duration: 'per month',
    features: ['5,000 Email Finds', '5,000 Email Verifications', 'Priority Support', 'API Access'],
    color: 'bg-blue-100 text-blue-800',
    icon: TrendingUp
  },
  agency: {
    name: 'Agency',
    price: '$99',
    duration: 'per month',
    features: ['50,000 Email Finds', '50,000 Email Verifications', 'Premium Support', 'API Access', 'Priority Processing'],
    color: 'bg-purple-100 text-purple-800',
    icon: TrendingUp
  },
  lifetime: {
    name: 'Lifetime',
    price: '$249',
    duration: 'one-time',
    features: ['150,000 Email Finds', '150,000 Email Verifications', 'Premium Support', 'API Access', 'Future Updates'],
    color: 'bg-green-100 text-green-800',
    icon: TrendingUp
  }
}

function CreditsPageComponent() {
  const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({})
  const [isCreatingPortal, setIsCreatingPortal] = useState(false)
  const router = useRouter()
  
  // Check authentication on component mount
  useEffect(() => {
    if (!isAuthenticated()) {
      // Save current URL for redirect after login
      saveRedirectUrl(window.location.pathname + window.location.search)
      // Redirect to login page
      router.push('/auth/login')
    }
  }, [router])
  
  // Use React Query for data fetching with caching
  const { profile, transactions, creditUsage, isLoading, isError, error } = useCreditsData()
  
  // Memoize chart data to prevent unnecessary recalculations
  const chartData = useMemo(() => ({
    labels: creditUsage.map(item => {
      const date = new Date(item.date)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }),
    datasets: [
      {
        label: 'Credits Used',
        data: creditUsage.map(item => item.credits_used),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1,
        fill: true
      }
    ]
  }), [creditUsage])

  // Memoize chart options to prevent unnecessary recalculations
  const chartOptions = useMemo(() => ({
    responsive: true,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      x: {
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    }
  }), [])
  
  // If profile is missing, continue rendering without redirect.
  // The UI below guards profile-dependent sections and will show defaults.
  
  // Handle errors
  if (isError) {
    console.error('Error loading data:', error)
    toast.error('Failed to load data')
  }

  const [pending, startTransition] = useTransition()
  const useProxyForCheckout = process.env.NEXT_PUBLIC_CHECKOUT_USE_PROXY === '1'

  const handleSubscribe = (planName: 'pro' | 'agency' | 'lifetime') => {
    const loadingKey = `plan-${planName}`
    setLoadingStates(prev => ({ ...prev, [loadingKey]: true }))
    startTransition(async () => {
      try {
        if (useProxyForCheckout) {
          const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: planName }),
          })
          const json = await res.json().catch(() => ({}))
          const ls = Array.isArray(json?.data) ? json?.data?.[0] : json
          const url = ls?.data?.attributes?.url || ls?.data?.attributes?.checkout_url || json?.data?.attributes?.url
          if (!url) throw new Error('Checkout URL missing')
          window.location.href = url
        } else {
          const planObj = pricingPlans.find(p => p.name.toLowerCase() === planName)
          if (!planObj) throw new Error('Invalid plan selected')
          const { url } = await createLemonSqueezyCheckout(planObj)
          if (!url) throw new Error('Checkout URL missing')
          window.location.href = url
        }
      } catch (error) {
        console.error('Error creating subscription checkout:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to create checkout session')
      } finally {
        setLoadingStates(prev => ({ ...prev, [loadingKey]: false }))
      }
    })
  }

  const handleBuyCredits = (creditPackage: { credits: number }) => {
    const pkgLabel = creditPackage.credits >= 100000 ? '100k' : creditPackage.credits >= 50000 ? '50k' : creditPackage.credits >= 25000 ? '25k' : '10k'
    const loadingKey = `credits-${creditPackage.credits}`
    setLoadingStates(prev => ({ ...prev, [loadingKey]: true }))
    startTransition(async () => {
      try {
        if (useProxyForCheckout) {
          const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: 'credits', package: pkgLabel }),
          })
          const json = await res.json().catch(() => ({}))
          const ls = Array.isArray(json?.data) ? json?.data?.[0] : json
          const url = ls?.data?.attributes?.url || ls?.data?.attributes?.checkout_url || json?.data?.attributes?.url
          if (!url) throw new Error('Checkout URL missing')
          window.location.href = url
        } else {
          const pkg = customCreditPackages.find(p => p.credits === creditPackage.credits)
          if (!pkg) throw new Error('Invalid credit package')
          const { url } = await createCustomCreditCheckout({ credits: pkg.credits, price: pkg.price })
          if (!url) throw new Error('Checkout URL missing')
          window.location.href = url
        }
      } catch (error) {
        console.error('Error creating custom credit checkout:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to create checkout session')
      } finally {
        setLoadingStates(prev => ({ ...prev, [loadingKey]: false }))
      }
    })
  }

  const handleManageBilling = async () => {
    try {
      setIsCreatingPortal(true)
      const { url } = await createLemonSqueezyPortal()
      if (url) {
        // If it's a local URL (pricing tab), navigate within the app
        if (url.startsWith('/')) {
          router.push(url)
          toast.success('Redirecting to pricing plans...')
        } else {
          // External LemonSqueezy URL, open in new tab
          window.open(url, '_blank')
          toast.success('Redirecting to billing portal...')
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to open billing portal'
      toast.error(errorMessage)
    } finally {
      setIsCreatingPortal(false)
    }
  }

  const handleCancelSubscription = async () => {
    try {
      setIsCreatingPortal(true)
      const { url } = await createLemonSqueezyPortal()
      if (url) {
        // If it's a local URL (pricing tab), navigate within the app
        if (url.startsWith('/')) {
          router.push(url)
          toast.success('Redirecting to pricing plans...')
        } else {
          // External LemonSqueezy URL, open in new tab
          window.open(url, '_blank')
          toast.success('Redirecting to billing portal to manage your subscription...')
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to open billing portal'
      toast.error(errorMessage)
    } finally {
      setIsCreatingPortal(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getOperationLabel = (transaction: CreditTransaction) => {
    // Map webhook events to user-friendly labels
    switch (transaction.webhook_event) {
      case 'order_created':
      case 'subscription_payment_success':
        return 'Credit Purchase'
      case 'subscription_created':
        return 'Subscription Started'
      case 'subscription_cancelled':
        return 'Subscription Cancelled'
      case 'subscription_expired':
        return 'Subscription Expired'
      default:
        // Fallback to product type or product name
        if (transaction.product_type) {
          return transaction.product_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
        }
        return transaction.product_name || 'Transaction'
    }
  }

  const pricingPlans = [
    {
      name: 'Pro',
      price: 49,
      period: 'month',
      findCredits: 5000,
      verifyCredits: 5000,
      popular: false,
      features: [
        '5,000 email finding credits/month',
        '5,000 email verification credits/month',
        'Monthly billing',
        'Bulk verification',
        'Bulk finder',
        'Email support',
        'No API Access'
      ]
    },
    {
      name: 'Agency',
      price: 99,
      period: 'month',
      findCredits: 50000,
      verifyCredits: 50000,
      popular: true,
      features: [
        'Everything in pro plus',
        '50,000 email finding credits/month',
        '50,000 email verification credits/month',
        'Full API Access',
        'Email enrichment automation workflow',
        'Lifetime Community support',
        'Whatsapp support',
        'Priority email support'
      ]
    },
    {
      name: 'Lifetime',
      price: 249,
      period: 'lifetime',
      findCredits: 150000,
      verifyCredits: 150000,
      popular: false,
      features: [
        '150,000 email finding credits',
        '150,000 email verification credits',
        'Full API support upto 300k credits',
        'Cold outbound automation support and implementation',
        'First 2 campaigns are on us with guaranteed deliverability',
        '1 year founder exclusive community access (for limited founders)',
        'Lifetime access',
        'Priority support',
        'All future features'
      ]
    }
  ]

  const customCreditPackages = [
    {
      credits: 100000,
      price: 35,
      description: '100K credits for email finding and verification'
    },
    {
      credits: 50000,
      price: 20,
      description: '50K credits for email finding and verification'
    },
    {
      credits: 25000,
      price: 12,
      description: '25K credits for email finding and verification'
    },
    {
      credits: 10000,
      price: 9,
      description: '10K credits for email finding and verification'
    }
  ]

  // For free plans, assume they are not expired (plan expiry logic removed)
  const daysRemaining = profile?.plan === 'free' ? 3 : 0
  const isExpired = false

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header skeleton */}
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>

        {/* Current Balance skeleton */}
        <Card>
          <CardHeader>
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse flex items-center justify-between">
              <div>
                <div className="h-10 bg-gray-200 rounded w-20 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-28"></div>
              </div>
              <div className="text-right">
                <div className="h-5 bg-gray-200 rounded w-20 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two column cards skeleton */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Plan skeleton */}
          <Card>
            <CardHeader>
              <div className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="animate-pulse space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-6 bg-gray-200 rounded w-20 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-12"></div>
                </div>
                <div className="h-16 bg-gray-200 rounded"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            </CardContent>
          </Card>

          {/* Chart skeleton */}
          <Card>
            <CardHeader>
              <div className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="animate-pulse">
                <div className="h-64 bg-gray-200 rounded"></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription Plans skeleton */}
        <Card>
          <CardHeader>
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-64 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Custom Credit Packages skeleton */}
        <Card>
          <CardHeader>
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-40 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Billing Management skeleton */}
        <Card>
          <CardHeader>
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse">
              <div className="h-10 bg-gray-200 rounded w-32"></div>
            </div>
          </CardContent>
        </Card>

        {/* Transactions skeleton */}
        <Card>
          <CardHeader>
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-200 rounded"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Credits & Billing</h1>
        <p className="text-gray-600 mt-2">
          Manage your credits and billing information.
        </p>
      </div>

      {/* Current Credits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Current Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-blue-600">
                {profile?.total_credits || 0}
              </p>
              <p className="text-gray-600">Total Available Credits</p>
              <div className="mt-2 text-sm text-gray-500">
                <div>Find: {profile?.credits_find || 0} credits</div>
                <div>Verify: {profile?.credits_verify || 0} credits</div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-medium">
                Plan: {profile?.plan || 'Free'}
              </p>
              <p className="text-sm text-gray-600">
                Account: {profile?.full_name || 'User'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Plan and Daily Credit Usage Sections */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Your Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Your Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">{PLANS[profile.plan as keyof typeof PLANS]?.name || profile.plan}</h3>
                    <p className="text-gray-600">
                      {PLANS[profile.plan as keyof typeof PLANS]?.price} {PLANS[profile.plan as keyof typeof PLANS]?.duration}
                    </p>
                  </div>
                  <Badge className={PLANS[profile.plan as keyof typeof PLANS]?.color || 'bg-gray-100 text-gray-800'}>
                    {profile.plan.toUpperCase()}
                  </Badge>
                </div>
                
                {profile.plan === 'free' && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      {isExpired 
                        ? "⚠️ Your free trial has expired. Please upgrade to continue using the service."
                        : `⏰ ${daysRemaining} days remaining in your free trial.`
                      }
                    </p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <h4 className="font-medium">Plan Features:</h4>
                  <ul className="space-y-1">
                    {(PLANS[profile.plan as keyof typeof PLANS]?.features || []).map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-blue-600">{profile.credits_find}</p>
                      <p className="text-sm text-gray-600">Find Credits</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">{profile.credits_verify}</p>
                      <p className="text-sm text-gray-600">Verify Credits</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Daily Credit Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Daily Credit Usage
            </CardTitle>
            <CardDescription>
              Track your daily credit consumption over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            {creditUsage.length > 0 ? (
              <div className="h-64">
                <Line data={chartData} options={chartOptions} />
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No usage data available yet</p>
                  <p className="text-sm">Start using the service to see your credit usage</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pricing Plans */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Subscription Plans
          </CardTitle>
          <CardDescription>
            Choose a subscription plan that fits your needs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingPlans.map((plan) => {
              const isCurrentPlan = profile?.plan?.toLowerCase() === plan.name.toLowerCase()
              return (
                <Card 
                  key={plan.name} 
                  className={`relative ${
                    isCurrentPlan 
                      ? 'border-green-500 border-2 shadow-lg bg-green-50' 
                      : plan.popular 
                      ? 'border-blue-500 border-2 shadow-lg' 
                      : ''
                  }`}
                >
                  {isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-green-500 text-white text-sm px-3 py-1 rounded-full font-medium">
                        Current Plan
                      </span>
                    </div>
                  )}
                  {plan.popular && !isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-blue-500 text-white text-sm px-3 py-1 rounded-full font-medium">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <CardContent className="pt-6">
                    <div className="text-center mb-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                      <div className="text-3xl font-bold text-blue-600 mb-1">
                        ${plan.price}
                      </div>
                      <div className="text-sm text-gray-600">
                        {plan.period === 'lifetime' ? 'One-time payment' : `per ${plan.period}`}
                      </div>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                      {plan.features.map((feature, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          <span className="text-sm text-gray-600">{feature}</span>
                        </div>
                      ))}
                    </div>
                    
                    {isCurrentPlan ? (
                      <Button 
                        className="w-full"
                        onClick={handleCancelSubscription}
                        disabled={isCreatingPortal}
                        variant="destructive"
                        size="lg"
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        {isCreatingPortal ? 'Processing...' : 'Cancel Subscription'}
                      </Button>
                    ) : (
                      <Button 
                        className="w-full"
                        onClick={() => handleSubscribe(plan.name.toLowerCase() as 'pro' | 'agency' | 'lifetime')}
                        disabled={loadingStates[`plan-${plan.name}`]}
                        variant={plan.popular ? 'default' : 'outline'}
                        size="lg"
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        {loadingStates[`plan-${plan.name}`] ? 'Processing...' : (plan.period === 'lifetime' ? 'Get Lifetime Access' : 'Start Subscription')}
                      </Button>
                    )}
                    
                    {plan.period !== 'lifetime' && !isCurrentPlan && (
                      <div className="text-xs text-gray-500 mt-3 text-center">
                        Cancel anytime • No setup fees
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Custom Credit Packages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Custom Credit Packages
          </CardTitle>
          <CardDescription>
            One-time credit purchases for immediate use
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {customCreditPackages.map((creditPackage, index) => (
              <div key={index} className="bg-gray-50 rounded-lg border p-4 hover:shadow-md transition-shadow">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {creditPackage.credits.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 mb-3">Credits</div>
                  <div className="text-xl font-bold text-blue-600 mb-3">
                    ${creditPackage.price}
                  </div>
                  <p className="text-xs text-gray-600 mb-4">
                    {creditPackage.description}
                  </p>
                  <Button
                    onClick={() => handleBuyCredits(creditPackage)}
                    disabled={loadingStates[`credits-${creditPackage.credits}`]}
                    className="w-full"
                    size="sm"
                  >
                    {loadingStates[`credits-${creditPackage.credits}`] ? 'Processing...' : 'Buy Credits'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Billing Management */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Management</CardTitle>
          <CardDescription>
            Manage your payment methods and billing history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline"
            onClick={handleManageBilling}
            disabled={isCreatingPortal}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Manage Billing
          </Button>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Transactions
          </CardTitle>
          <CardDescription>
            Your last 10 credit transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No transactions yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Date</th>
                    <th className="text-left p-2 font-medium">Operation</th>
                    <th className="text-left p-2 font-medium">Amount</th>
                    <th className="text-left p-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b">
                      <td className="p-2 text-sm">
                        {formatDate(transaction.created_at)}
                      </td>
                      <td className="p-2">
                        <span className="text-sm font-medium">
                          {getOperationLabel(transaction)}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`text-sm font-medium ${
                          transaction.amount > 0 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {transaction.amount > 0 ? '+' : ''}${transaction.amount}
                        </span>
                      </td>
                      <td className="p-2 text-sm text-gray-600">
                        <div className="space-y-1">
                          <div>{transaction.product_name}</div>
                          {transaction.credits_find_added > 0 && (
                            <div className="text-xs text-green-600">
                              +{transaction.credits_find_added} Find Credits
                            </div>
                          )}
                          {transaction.credits_verify_added > 0 && (
                            <div className="text-xs text-green-600">
                              +{transaction.credits_verify_added} Verify Credits
                            </div>
                          )}
                          <div className="text-xs text-gray-500">
                            Status: {transaction.status}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Memoize the component to prevent unnecessary re-renders
const CreditsPage = memo(CreditsPageComponent)

export default CreditsPage
