import { NextResponse } from "next/server"

import { env, hasSupabaseAdmin } from "@/lib/env"
import {
  COURIER_METHODS,
  isLocalShippingCountry,
  type ShippingMethod
} from "@/lib/shipping"
import { parseZoneRates, zoneForCountry } from "@/lib/shipping-zones"
import { getRateProvider, quoteCarrier } from "@/lib/shipping-rates"
import { verifyAuthToken } from "@/lib/supabase/auth-guard"
import { getSupabaseAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Why a live carrier is not quoting.
 *
 * Checkout deliberately hides the reason from buyers — "DHL replied 401" is
 * not a shopper's problem, and every failure quietly becomes the flat rate.
 * That is right for them and useless for whoever has to fix it, which is what
 * this is for: the seller's own view of what a live courier quote said.
 *
 * Seller-only. It names configuration state and upstream errors, which is not
 * something to hand to the public.
 *
 *   GET /api/shipping/diagnose?to=Lagos&country=NG
 */
export async function GET(request: Request) {
  const user = await verifyAuthToken(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdminClient()
  if (!hasSupabaseAdmin || !supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 })
  }

  // Owning a store is what makes someone the seller here.
  const { data: vendor } = await supabase
    .from("vendor_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!vendor) {
    return NextResponse.json({ error: "Sellers only" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const toCity = (searchParams.get("to") ?? "Lagos").trim()
  const toCountry = (searchParams.get("country") ?? "NG").trim().toUpperCase()
  const toAddress = (
    searchParams.get("address") ??
    `${toCity}, ${toCountry}`
  ).trim()

  const origin = {
    countryCode: String(vendor.origin_country ?? "NG"),
    city: String(vendor.origin_city ?? vendor.city ?? ""),
    region: vendor.origin_state ? String(vendor.origin_state) : undefined,
    postalCode: vendor.origin_postcode ? String(vendor.origin_postcode) : undefined,
    addressLine: vendor.origin_address
      ? String(vendor.origin_address)
      : String(vendor.city ?? ""),
    name: vendor.store_name ? String(vendor.store_name) : undefined,
    email: (user.email ?? env.shipbubbleSenderEmail) || undefined,
    phone: vendor.whatsapp_number
      ? String(vendor.whatsapp_number)
      : env.shipbubbleSenderPhone || undefined
  }

  // A real weight if any product has one, so the test is not artificial.
  const { data: products } = await supabase
    .from("products")
    .select("name, weight_kg")
    .eq("vendor_id", vendor.id)
    .limit(200)

  const weighed = (products ?? []).filter((row) => Number(row.weight_kg) > 0)
  const defaultWeight = Number(vendor.default_item_weight_kg ?? 0)
  const fallbackWeight = Number(env.shippingDefaultItemWeightKg)
  // An explicit weight wins: pricing a three kilogram bundle order should not
  // require editing a product first.
  const requestedWeight = Number(searchParams.get("weight") ?? 0)
  const testWeight =
    (Number.isFinite(requestedWeight) && requestedWeight > 0
      ? requestedWeight
      : 0) ||
    Number(weighed[0]?.weight_kg ?? 0) ||
    defaultWeight ||
    (Number.isFinite(fallbackWeight) && fallbackWeight > 0 ? fallbackWeight : 1)

  const localOnlyDestination = isLocalShippingCountry(toCountry)
  const carriers = localOnlyDestination ? [] : COURIER_METHODS

  const results = await Promise.all(
    carriers.map(async (method) => {
      const provider = getRateProvider(method.id as ShippingMethod)
      const configured = provider?.isConfigured() ?? false

      if (!configured) {
        return {
          carrier: method.id,
          configured: false,
          quoted: false,
          reason: "Keys are not set for this carrier."
        }
      }

      const result = await quoteCarrier(method.id as ShippingMethod, {
        origin,
        destination: {
          countryCode: toCountry,
          city: toCity,
          region: toCity,
          addressLine: toAddress,
          name: "Shipping check",
          email: (user.email ?? env.shipbubbleSenderEmail) || undefined,
          phone: vendor.whatsapp_number
            ? String(vendor.whatsapp_number)
            : env.shipbubbleSenderPhone || undefined
        },
        weightKg: testWeight,
        lengthCm: Number(vendor.package_length_cm ?? 30),
        widthCm: Number(vendor.package_width_cm ?? 25),
        heightCm: Number(vendor.package_height_cm ?? 15),
        declaredValue: 100000
      })

      return {
        carrier: method.label,
        configured: true,
        quoted: result.ok,
        // The upstream's own words, which is the whole point of this route.
        ...(result.ok
          ? { amount: result.amount, currency: result.currency, service: result.serviceName }
          : { reason: result.reason })
      }
    })
  )

  const zone = zoneForCountry(toCountry)
  const zoneRates = parseZoneRates(vendor.shipping_zones)
  const currentZoneRate = zoneRates[zone] ?? null

  return NextResponse.json({
    testedRoute: `${origin.city || "(no pickup city)"} -> ${toAddress}`,
    localOnlyDestination,
    // What this destination would be priced as once zone pricing is on, so a
    // live quote can be turned straight into a rate to save.
    zone,
    currentZoneRate,
    readiness: {
      pickupCitySet: Boolean(origin.city),
      pickupCountry: origin.countryCode,
      productsWithWeight: weighed.length,
      productsTotal: products?.length ?? 0,
      storeDefaultWeightKg: defaultWeight || null,
      weightUsedForTestKg: testWeight || null,
      // The two things that stop every carrier at once, called out plainly.
      blocking: [
        ...(origin.city ? [] : ["No pickup city on the store — no carrier can quote."]),
        ...(testWeight > 0
          ? []
          : ["No weights on any product and no store default — no carrier can quote."])
      ]
    },
    carriers: results
  })
}
