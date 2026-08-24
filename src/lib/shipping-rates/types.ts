import { type ShippingMethod } from "@/lib/shipping"

/** Where a parcel leaves from, or goes to. */
export interface RateAddress {
  /** ISO 3166-1 alpha-2. */
  countryCode: string
  city: string
  /** State or province. */
  region?: string
  postalCode?: string
  addressLine?: string
  name?: string
  email?: string
  phone?: string
}

export interface RateRequest {
  origin: RateAddress
  destination: RateAddress
  /** Total billable weight of the parcel, kilograms. */
  weightKg: number
  /** Outer box, centimetres. */
  lengthCm: number
  widthCm: number
  heightCm: number
  /** Declared value of the goods, naira — some carriers rate on it. */
  declaredValue: number
}

export type RateResult =
  | { ok: true; amount: number; currency: string; serviceName?: string }
  /**
   * Never throws upward. A carrier being down, unconfigured or unable to serve
   * a route must fall back to the seller's flat rate, not take checkout with
   * it. The reason is carried so the seller can be told why.
   */
  | { ok: false; reason: string }

export interface RateProvider {
  id: ShippingMethod
  /** False when its keys are absent, so it is not called at all. */
  isConfigured(): boolean
  quote(request: RateRequest): Promise<RateResult>
}
