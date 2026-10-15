import { NextResponse } from "next/server"

import { COUNTRIES } from "@/lib/countries"
import { normalizeDeliveryPrices, type DeliveryPrices } from "@/lib/delivery"
import { isAdminEmail, loadDeliveryPrices } from "@/lib/delivery-prices-store"
import { hasSupabaseAdmin } from "@/lib/env"
import { verifyAuthToken } from "@/lib/supabase/auth-guard"
import { getSupabaseAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

/** Checks the caller is signed in and on the admin list. Returns an error response otherwise. */
async function requireAdmin(request: Request) {
  const user = await verifyAuthToken(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) }
  }
  if (!isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) }
  }
  return { user }
}

/** Current prices. */
export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (auth.error) return auth.error

  const supabase = getSupabaseAdminClient()
  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 })
  }

  try {
    return NextResponse.json({ prices: await loadDeliveryPrices(supabase) })
  } catch (error) {
    console.error("Admin delivery prices read failed", error)
    return NextResponse.json({ error: "Could not load prices." }, { status: 500 })
  }
}

/**
 * Saves the whole price list. A country with no fee is removed, which means
 * "to be confirmed". Only real country codes are accepted.
 */
export async function PUT(request: Request) {
  const auth = await requireAdmin(request)
  if (auth.error) return auth.error

  const body = (await request.json().catch(() => null)) as {
    prices?: Record<string, unknown>
  } | null

  if (!body?.prices || typeof body.prices !== "object") {
    return NextResponse.json({ error: "Send the prices as an object." }, { status: 400 })
  }

  const validCodes = new Set(COUNTRIES.map((country) => country.code))
  const wanted: DeliveryPrices = {}
  for (const [code, raw] of Object.entries(body.prices)) {
    if (raw === null || raw === "" || raw === undefined) continue
    if (!validCodes.has(code)) {
      return NextResponse.json({ error: `Unknown country code ${code}.` }, { status: 400 })
    }
    const fee = Number(raw)
    if (!Number.isFinite(fee) || fee < 0) {
      return NextResponse.json({ error: `Enter a valid fee for ${code}.` }, { status: 400 })
    }
    wanted[code] = fee
  }

  const supabase = getSupabaseAdminClient()
  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 })
  }

  try {
    const current = await loadDeliveryPrices(supabase)
    const cleaned = normalizeDeliveryPrices(wanted)

    const toSave = Object.entries(cleaned).map(([country_code, fee]) => ({
      country_code,
      fee_ngn: fee,
      updated_at: new Date().toISOString()
    }))
    const toRemove = Object.keys(current).filter((code) => !(code in cleaned))

    if (toSave.length > 0) {
      const { error } = await supabase
        .from("delivery_prices")
        .upsert(toSave, { onConflict: "country_code" })
      if (error) throw new Error(error.message)
    }

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("delivery_prices")
        .delete()
        .in("country_code", toRemove)
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ prices: cleaned })
  } catch (error) {
    console.error("Admin delivery prices save failed", error)
    return NextResponse.json({ error: "Could not save prices. Try again." }, { status: 500 })
  }
}
