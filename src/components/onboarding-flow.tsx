'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { Progress } from '@/components/ui/progress'
import { X, ArrowRight, Search, CheckCircle, CreditCard, Star } from 'lucide-react'
// Removed Supabase dependency for onboarding checks

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  targetPath: string
  action: string
  completed: boolean
}

interface OnboardingFlowProps {
  userProfile: {
    full_name: string | null
    email: string
    plan: string
  }
}

export function OnboardingFlow({ userProfile }: OnboardingFlowProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      id: 'find-email',
      title: 'Find Your First Email',
      description: 'Click on "Find" in the sidebar and enter a person&apos;s full name and company domain to discover their email address.',
      icon: Search,
      targetPath: '/find',
      action: 'Try finding an email',
      completed: false
    },
    {
      id: 'verify-email',
      title: 'Verify an Email',
      description: 'Once you\'ve found an email, click on "Verify" to check if the email address is valid and deliverable.',
      icon: CheckCircle,
      targetPath: '/verify',
      action: 'Verify an email',
      completed: false
    },
    {
      id: 'upgrade-plan',
      title: 'Upgrade Your Plan',
      description: 'Visit "Credits & Billing" to upgrade your plan. We recommend the Lifetime plan for the best value!',
      icon: CreditCard,
      targetPath: '/credits',
      action: 'View plans',
      completed: false
    }
  ])
  const router = useRouter()
  // Use localStorage to track onboarding completion per user email
  const storageKey = typeof window !== 'undefined' ? `onboardingCompleted:${userProfile.email}` : undefined

  // Check if user should see onboarding
  useEffect(() => {
    const checkOnboardingStatus = () => {
      try {
        // Prefer local flag; if not set, show for free plan users
        const completed = storageKey ? localStorage.getItem(storageKey) === 'true' : false
        if (!completed && userProfile.plan === 'free') {
          setIsVisible(true)
        }
      } catch {
        // On any error, show for free plan users
        if (userProfile.plan === 'free') {
          setIsVisible(true)
        }
      }
    }

    checkOnboardingStatus()
  }, [userProfile.email, userProfile.plan, storageKey])

  const handleStepAction = (step: OnboardingStep) => {
    // Mark step as completed
    setSteps(prev => prev.map(s => 
      s.id === step.id ? { ...s, completed: true } : s
    ))
    
    // Navigate to the target page
    router.push(step.targetPath)
    
    // If this is the last step, mark onboarding as completed
    if (currentStep === steps.length - 1) {
      completeOnboarding()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const completeOnboarding = () => {
    try {
      if (storageKey) {
        localStorage.setItem(storageKey, 'true')
      }
    } catch {}
    setIsVisible(false)
  }

  const skipOnboarding = async () => {
    completeOnboarding()
  }

  const progress = ((currentStep + 1) / steps.length) * 100
  const currentStepData = steps[currentStep]

  if (!isVisible || !currentStepData) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 h-8 w-8 p-0"
            onClick={skipOnboarding}
          >
            <X className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <currentStepData.icon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Welcome to MailsFinder!</CardTitle>
              <CardDescription>
                Let&apos;s get you started with a quick tour
              </CardDescription>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="text-center space-y-3">
            <h3 className="text-xl font-semibold">{currentStepData.title}</h3>
            <p className="text-gray-600 leading-relaxed">
              {currentStepData.description}
            </p>
            
            {currentStepData.id === 'upgrade-plan' && (
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="font-semibold text-yellow-800">Recommended</span>
                </div>
                <p className="text-sm text-yellow-700">
                  The Lifetime plan offers the best value with 150,000 credits for both finding and verifying emails, plus premium support!
                </p>
              </div>
            )}
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={skipOnboarding}
              className="flex-1"
            >
              Skip Tour
            </Button>
            <Button
              onClick={() => handleStepAction(currentStepData)}
              className="flex-1"
            >
              {currentStepData.action}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          
          {/* Step indicators */}
          <div className="flex justify-center gap-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`h-2 w-8 rounded-full transition-colors ${
                  index <= currentStep
                    ? 'bg-blue-600'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}