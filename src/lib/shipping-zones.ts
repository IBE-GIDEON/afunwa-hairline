import zonesByCountry from "@/lib/geo/zones.json"

/**
 * Where an order is going, priced as a group rather than one country at a time.
 *
 * Nine zones instead of a live quote per visitor. A live courier call on every
 * page would mean one request per product per shopper, a slow uncacheable
 * page, and a price that moves between browsing and paying — which is the one
 * thing a shop must never do.
 *
 * Every country belongs to exactly one, and ROW catches whatever is left, so
 * nobody is ever quoted nothing.
 */
export const SHIPPING_ZONES = [
  {
    id: "NG",
    label: "Nigeria",
    description: "Your own flat fee. Nothing is added to product prices."
  },
  { id: "WAF", label: "West Africa", description: "Ghana, Benin, Togo, Senegal" },
  { id: "AFR", label: "Rest of Africa", description: "Kenya, South Africa, Egypt" },
  { id: "UKI", label: "UK & Ireland", description: "Separate since Brexit" },
  { id: "EUR", label: "Europe", description: "Germany, France, Italy" },
  { id: "NAM", label: "North America", description: "United States, Canada" },
  { id: "MEA", label: "Middle East", description: "UAE, Saudi Arabia, Qatar" },
  { id: "APAC", label: "Asia & Oceania", description: "Australia, China, India" },
  { id: "ROW", label: "Rest of world", description: "Latin America, Caribbean" }
] as const

export type ShippingZone = (typeof SHIPPING_ZONES)[number]["id"]

export const DEFAULT_ZONE: ShippingZone = "NG"

/** The zone that carries no uplift, because it has a flat fee instead. */
export const HOME_ZONE: ShippingZone = "NG"

const BY_COUNTRY = zonesByCountry as Record<string, string>

export function isShippingZone(value: unknown): value is ShippingZone {
  return (
    typeof value === "string" &&
    SHIPPING_ZONES.some((zone) => zone.id === value)
  )
}

/** Which zone a country is in. Unknown countries price as rest of world. */
export function zoneForCountry(countryCode: string | undefined): ShippingZone {
  if (!countryCode) return DEFAULT_ZONE
  const zone = BY_COUNTRY[countryCode.toUpperCase()]
  return isShippingZone(zone) ? zone : "ROW"
}

export function getShippingZone(id: ShippingZone) {
  return SHIPPING_ZONES.find((zone) => zone.id === id) ?? SHIPPING_ZONES[0]
}

/**
 * What a seller charges for a zone.
 *
 * Two numbers rather than one, because a 0.2kg closure and a 3kg bundle order
 * do not cost the same to send. A flat uplift overcharges the small parcel and
 * quietly loses money on the large one — and the large one is the order worth
 * having.
 */
export interface ZoneRate {
  /** Charged once per order, whatever it weighs. */
  base: number
  /** Added for each kilogram. */
  perKg: number
}

export type ZoneRates = Partial<Record<ShippingZone, ZoneRate>>

/**
 * What to add to an order going to this zone.
 *
 * Nigeria adds nothing — it keeps the seller's flat delivery fee, unchanged.
 * A zone with no rate set also adds nothing, so an unconfigured shop shows
 * honest prices rather than invented ones.
 */
export function computeZoneUplift(
  zone: ShippingZone,
  weightKg: number,
  rates: ZoneRates | undefined
): number {
  if (zone === HOME_ZONE) return 0

  const rate = rates?.[zone]
  if (!rate) return 0

  const base = Number(rate.base)
  const perKg = Number(rate.perKg)

  const safeBase = Number.isFinite(base) && base > 0 ? base : 0
  const safePerKg = Number.isFinite(perKg) && perKg > 0 ? perKg : 0
  const safeWeight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0

  return Math.round((safeBase + safePerKg * safeWeight) * 100) / 100
}

/** Reads whatever is in vendor_profiles.shipping_zones safely. */
export function parseZoneRates(value: unknown): ZoneRates {
  if (!value || typeof value !== "object") return {}

  const out: ZoneRates = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isShippingZone(key)) continue
    const entry = raw as { base?: unknown; perKg?: unknown } | null
    if (!entry || typeof entry !== "object") continue

    const base = Number(entry.base)
    const perKg = Number(entry.perKg)
    if (!Number.isFinite(base) && !Number.isFinite(perKg)) continue

    out[key] = {
      base: Number.isFinite(base) && base > 0 ? base : 0,
      perKg: Number.isFinite(perKg) && perKg > 0 ? perKg : 0
    }
  }
  return out
}
