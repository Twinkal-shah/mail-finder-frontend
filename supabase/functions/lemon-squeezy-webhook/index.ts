import "jsr:@supabase/functions-js/edge-runtime.d.ts"
// @ts-expect-error - Supabase edge runtime types
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
}

// @ts-expect-error - Deno environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
// @ts-expect-error - Deno environment variables
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// @ts-expect-error - Deno environment variables
const webhookSecret = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET')!

interface TransactionRecord {
  id: string
  user_id: string
  type: string
  status: string
  amount: number
  currency: string
  credits_find_added: number
  credits_verify_added: number
  plan_name?: string
  subscription_id?: string
  order_id?: string
  created_at: string
  updated_at: string
}

interface SupabaseClient {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: string | number) => {
        single: () => Promise<{ data: unknown; error: Error | null }>
      }
    }
    update: (data: Record<string, unknown>) => {
      eq: (column: string, value: string | number) => {
        select: () => Promise<{ data: unknown; error: Error | null }>
      }
    }
    insert: (data: Record<string, unknown> | Record<string, unknown>[]) => {
      select: () => Promise<{ data: unknown; error: Error | null }>
    }
  }
}

interface LemonSqueezyWebhookEvent {
  meta: {
    event_name: string
    custom_data?: {
      user_id?: string
      plan_name?: string
      find_credits?: string
      verify_credits?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  data: {
    id: string
    attributes: {
      user_email?: string
      customer_id?: string
      status?: string
      total?: number
      product_name?: string
      ends_at?: string
      subscription_id?: string
      custom_data?: {
        user_id?: string
        plan_name?: string
        find_credits?: string
        verify_credits?: string
        [key: string]: unknown
      }
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

// Verify webhook signature
async function verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const key = encoder.encode(secret)
    const data = encoder.encode(payload)
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const signature_buffer = await crypto.subtle.sign('HMAC', cryptoKey, data)
    const signature_array = new Uint8Array(signature_buffer)
    const signature_hex = Array.from(signature_array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    const cleanSignature = signature.replace(/^sha256=/, '')
    return signature_hex === cleanSignature
  } catch {
    return false
  }
}

// Handle webhook events
async function handleWebhookEvent(event: LemonSqueezyWebhookEvent, supabase: SupabaseClient) {
  console.log('handleWebhookEvent called with event:', {
    event_name: event.meta?.event_name,
    meta_custom_data: event.meta?.custom_data,
    data_attributes_custom_data: event.data?.attributes?.custom_data,
    data_id: event.data?.id
  })

  // Try to get user_id from multiple possible locations
  const userId = event.meta?.custom_data?.user_id || event.data?.attributes?.custom_data?.user_id
  
  console.log('Extracted userId:', userId)
  
  if (!userId) {
    console.error('No user_id found in webhook event. Checked locations:', {
      meta_custom_data_user_id: event.meta?.custom_data?.user_id,
      data_attributes_custom_data_user_id: event.data?.attributes?.custom_data?.user_id
    })
    throw new Error('User ID is required')
  }

  // Parse credits from custom_data
  const findCredits = parseInt(event.meta.custom_data?.find_credits || '0')
  const verifyCredits = parseInt(event.meta.custom_data?.verify_credits || '0')
  const planName = event.meta.custom_data?.plan_name || 'pro'

  // Create transaction record
  const transactionData = {
    user_id: userId,
    lemonsqueezy_order_id: event.data.id,
    lemonsqueezy_subscription_id: event.data.attributes.subscription_id || null,
    product_name: event.data.attributes.product_name || 'Unknown Product',
    product_type: determineProductType(event.meta.event_name),
    amount: (event.data.attributes.total || 0) / 100,
    credits_find_added: findCredits,
    credits_verify_added: verifyCredits,
    status: determineTransactionStatus(event.meta.event_name),
    webhook_event: event.meta.event_name,
    metadata: {
      event_data: event.data.attributes,
      processed_at: new Date().toISOString()
    }
  }

  // Insert transaction
  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert(transactionData)
    .select()

  if (transactionError) {
    console.error('Error creating transaction:', transactionError)
    throw transactionError
  }

  // Handle different event types
  const transactionRecord = Array.isArray(transaction) && transaction.length > 0 ? transaction[0] : null
  if (!transactionRecord) {
    throw new Error('Failed to create transaction record')
  }
  
  switch (event.meta.event_name) {
    case 'subscription_payment_success':
    case 'order_created':
      await handlePaymentSuccess(supabase, event, transactionRecord, planName)
      break
    case 'subscription_created':
    case 'subscription_updated':
      await handleSubscriptionEvent(supabase, event, transactionRecord, planName)
      break
    case 'subscription_cancelled':
    case 'subscription_expired':
      await handleSubscriptionCancellation(supabase, event)
      break
    default:
      console.log('Unhandled event:', event.meta.event_name)
  }

  return transaction
}

// Helper functions
function determineProductType(eventName: string): string {
  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_payment_success':
      return 'subscription'
    case 'order_created':
      return 'credit_pack'
    default:
      return 'subscription'
  }
}

function determineTransactionStatus(eventName: string): string {
  switch (eventName) {
    case 'order_created':
    case 'subscription_created':
    case 'subscription_payment_success':
      return 'completed'
    case 'subscription_payment_failed':
      return 'failed'
    default:
      return 'pending'
  }
}

async function handlePaymentSuccess(supabase: SupabaseClient, event: LemonSqueezyWebhookEvent, transaction: TransactionRecord, planName: string) {
  // Use the same user_id extraction logic as handleWebhookEvent
  const userId = event.meta?.custom_data?.user_id || event.data?.attributes?.custom_data?.user_id
  
  console.log('handlePaymentSuccess called with:', {
    userId,
    planName,
    transactionCreditsFind: transaction.credits_find_added,
    transactionCreditsVerify: transaction.credits_verify_added,
    hasCustomData: !!event.data.attributes.custom_data,
    meta_custom_data: event.meta?.custom_data,
    data_attributes_custom_data: event.data?.attributes?.custom_data
  })

  if (!userId) {
    console.error('No user ID found in webhook event')
    throw new Error('User ID is required')
  }
  
  // Get current profile
  console.log('Fetching user profile for:', userId)
  const { data: profile, error: profileFetchError } = await supabase
    .from('profiles')
    .select('credits_find, credits_verify, plan, plan_expiry')
    .eq('id', userId)
    .single() as { data: { credits_find: number; credits_verify: number; plan: string; plan_expiry: string } | null; error: Error | null }

  if (profileFetchError) {
    console.error('Error fetching user profile:', profileFetchError)
    throw profileFetchError
  }

  console.log('Current profile:', {
    id: userId,
    plan: profile?.plan,
    credits_find: profile?.credits_find,
    credits_verify: profile?.credits_verify,
    plan_expiry: profile?.plan_expiry
  })

  const currentFindCredits = profile?.credits_find || 0
  const currentVerifyCredits = profile?.credits_verify || 0
  const newFindCredits = currentFindCredits + (transaction.credits_find_added || 0)
  const newVerifyCredits = currentVerifyCredits + (transaction.credits_verify_added || 0)

  console.log('Credit calculations:', {
    currentFindCredits,
    currentVerifyCredits,
    creditsToAdd: {
      find: transaction.credits_find_added || 0,
      verify: transaction.credits_verify_added || 0
    },
    newFindCredits,
    newVerifyCredits
  })

  // Update profile with new plan and credits
  const updateData: Record<string, unknown> = {
    credits_find: newFindCredits,
    credits_verify: newVerifyCredits,
    updated_at: new Date().toISOString()
  }

  // Update plan if specified
  if (planName) {
    updateData.plan = planName.toLowerCase()
    
    // Set expiry for non-lifetime plans
    if (planName.toLowerCase() !== 'lifetime') {
      const expiry = new Date()
      expiry.setMonth(expiry.getMonth() + 1)
      updateData.plan_expiry = expiry.toISOString()
    } else {
      updateData.plan_expiry = null
    }
  }

  console.log('Updating profile with data:', updateData)

  const { error: profileError } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
  
  if (profileError) {
    console.error('Error updating profile:', profileError)
    throw profileError
  }

  console.log(`Payment processed successfully for user ${userId}, plan: ${planName}`)
  console.log('Profile update completed')
}

async function handleSubscriptionEvent(supabase: SupabaseClient, event: LemonSqueezyWebhookEvent, transaction: TransactionRecord, planName: string) {
  await handlePaymentSuccess(supabase, event, transaction, planName)
}

async function handleSubscriptionCancellation(supabase: SupabaseClient, event: LemonSqueezyWebhookEvent) {
  // Use the same user_id extraction logic as handleWebhookEvent
  const userId = event.meta?.custom_data?.user_id || event.data?.attributes?.custom_data?.user_id
  
  // Downgrade to free plan
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      plan: 'free',
      plan_expiry: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)

  if (profileError) {
    console.error('Error updating profile for cancellation:', profileError)
    throw profileError
  }

  console.log(`Subscription cancelled for user ${userId}`)
}

// @ts-expect-error - Deno serve function
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
      })
    }

    // Get request body and signature
    const body = await req.text()
    const signature = req.headers.get('x-signature')

    console.log('Webhook received:', {
      method: req.method,
      hasSignature: !!signature,
      bodyLength: body.length
    })

    if (!signature) {
      console.error('Missing webhook signature')
      return new Response('Missing signature', { 
        status: 400, 
        headers: corsHeaders 
      })
    }

    // Verify signature
    const isValid = await verifyWebhookSignature(body, signature, webhookSecret)
    if (!isValid) {
      console.error('Invalid webhook signature')
      return new Response('Invalid signature', { 
        status: 401, 
        headers: corsHeaders 
      })
    }

    // Parse event
    const event: LemonSqueezyWebhookEvent = JSON.parse(body)
    
    console.log('Processing webhook event:', {
      event_name: event.meta?.event_name,
      order_id: event.data?.id,
      user_id: event.meta?.custom_data?.user_id,
      has_meta_custom_data: !!event.meta?.custom_data,
      has_data_attributes: !!event.data?.attributes
    })

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle the event
    const result = await handleWebhookEvent(event, supabase)

    console.log('Webhook processed successfully:', result.id)
    
    return new Response(
      JSON.stringify({ success: true, transaction_id: result.id }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Webhook processing failed', 
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})