import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const token = (await cookies()).get('access_token')?.value
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 })
  }
  let plan: 'pro' | 'agency' | 'lifetime' | 'credits' = 'pro'
  let pkg: '100k' | '50k' | '25k' | '10k' | undefined
  let incomingVariantId: string | undefined
  try {
    const json = await req.json()
    plan = (json?.plan as typeof plan) ?? plan
    pkg = (json?.package as typeof pkg) ?? undefined
    incomingVariantId = typeof json?.variantId === 'string' ? json?.variantId : undefined
  } catch {}
  const planMap: Record<string, string> = { pro: 'Pro', agency: 'Agency', lifetime: 'Lifetime', credits: 'Credits' }
  const backendPlan = planMap[plan] ?? 'Pro'
  const variantMap: Record<string, string | undefined> = {
    Pro: process.env.LEMONSQUEEZY_PRO_VARIANT_ID,
    Agency: process.env.LEMONSQUEEZY_AGENCY_VARIANT_ID,
    Lifetime: process.env.LEMONSQUEEZY_LIFETIME_VARIANT_ID,
  }
  let variantId = backendPlan !== 'Credits' ? variantMap[backendPlan] : undefined
  if (backendPlan === 'Credits') {
    const creditsVariantMap: Record<string, string | undefined> = {
      '100k': process.env.LEMONSQUEEZY_CREDITS_100K_VARIANT_ID,
      '50k': process.env.LEMONSQUEEZY_CREDITS_50K_VARIANT_ID,
      '25k': process.env.LEMONSQUEEZY_CREDITS_25K_VARIANT_ID,
      '10k': process.env.LEMONSQUEEZY_CREDITS_10K_VARIANT_ID,
    }
    variantId = incomingVariantId ?? (pkg ? creditsVariantMap[pkg] : undefined)
  }
  const payload: Record<string, unknown> = { plan: backendPlan }
  if (pkg) payload.package = pkg
  if (variantId) {
    payload.variantId = variantId
    const asNum = Number(variantId)
    if (!Number.isNaN(asNum)) payload.variant_id = asNum
  }
  const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/transaction/lemonsqeezy/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const contentType = res.headers.get('content-type') || 'application/json'
  const text = await res.text()
  return new NextResponse(text, { status: res.status, headers: { 'content-type': contentType } })
}

export const runtime = 'nodejs'
