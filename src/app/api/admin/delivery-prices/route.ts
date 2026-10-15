import { NextResponse } from "next/server"

import { COUNTRIES } from "@/lib/countries"
import {
  normalizeDeliveryOptions,
  normalizeDeliveryPrices,
  type DeliveryOption,
  type DeliveryPrices
} from "@/lib/delivery"
import {
  isAdminEmail,
  loadDeliveryOptions,
  loadDeliveryPrices
} from "@/lib/delivery-prices-store"
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

/** Current country fees and Nigerian options, switched on or off. */
export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (auth.error) return auth.error

  const supabase = getSupabaseAdminClient()
  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 })
  }

  try {
    const [prices, options] = await Promise.all([
      loadDeliveryPrices(supabase),
      loadDeliveryOptions(supabase)
    ])
    return NextResponse.json({ prices, options })
  } catch (error) {
    console.error("Admin delivery read failed", error)
    return NextResponse.json({ error: "Could not load prices." }, { status: 500 })
  }
}

/**
 * Saves the whole sheet at once.
 *
 * prices: a country with no fee is removed, which means "to be confirmed".
 * options: each Nigerian option's name, detail, fee and on/off switch. Ids that
 * are not already in the list are refused, so the buyer's choices stay known.
 */
export async function PUT(request: Request) {
  const auth = await requireAdmin(request)
  if (auth.error) return auth.error

  const body = (await request.json().catch(() => null)) as {
    prices?: Record<string, unknown>
    options?: unknown
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

    let options: DeliveryOption[] | null = null
    if (body.options !== undefined) {
      const existing = new Set((await loadDeliveryOptions(supabase)).map((o) => o.id))
      const incoming = normalizeDeliveryOptions(body.options)
      const unknown = incoming.find((option) => !existing.has(option.id))
      if (unknown) {
        return NextResponse.json(
          { error: `Unknown delivery option ${unknown.id}.` },
          { status: 400 }
        )
      }
      for (const option of incoming) {
        if (!option.label.trim()) {
          return NextResponse.json(
            { error: "Every delivery option needs a name." },
            { status: 400 }
          )
        }
      }

      const { error } = await supabase.from("delivery_options").upsert(
        incoming.map((option) => ({
          id: option.id,
          label: option.label.trim(),
          detail: option.detail.trim(),
          fee_ngn: option.fee,
          active: option.active,
          updated_at: new Date().toISOString()
        })),
        { onConflict: "id" }
      )
      if (error) throw new Error(error.message)

      options = await loadDeliveryOptions(supabase)
    }

    return NextResponse.json({
      prices: cleaned,
      options: options ?? (await loadDeliveryOptions(supabase))
    })
  } catch (error) {
    console.error("Admin delivery save failed", error)
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 })
  }
}
