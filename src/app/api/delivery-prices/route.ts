import { NextResponse } from "next/server"

import { hasSupabaseAdmin } from "@/lib/env"
import { loadDeliveryOptions, loadDeliveryPrices } from "@/lib/delivery-prices-store"
import { getSupabaseAdminClient } from "@/lib/supabase/server"

// Always read fresh: an admin change must show up on the next checkout.
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Public: the Nigerian delivery options, and the fee for each country that has
 * one. Countries missing from the list are "to be confirmed". Nothing secret.
 */
export async function GET() {
  const supabase = getSupabaseAdminClient()
  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json(
      { error: "Delivery prices are unavailable right now." },
      { status: 503 }
    )
  }

  try {
    const [prices, options] = await Promise.all([
      loadDeliveryPrices(supabase),
      loadDeliveryOptions(supabase)
    ])
    return NextResponse.json({ prices, options })
  } catch (error) {
    console.error("Delivery prices read failed", error)
    return NextResponse.json(
      { error: "Delivery prices are unavailable right now." },
      { status: 503 }
    )
  }
}
