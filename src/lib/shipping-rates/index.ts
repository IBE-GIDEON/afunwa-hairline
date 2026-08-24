import { env } from "@/lib/env"
import { type ShippingMethod } from "@/lib/shipping"
import { dhlProvider } from "./dhl"
import { type RateProvider, type RateRequest, type RateResult } from "./types"

export * from "./types"

/**
 * Topship.
 *
 * Their API exists and keys come from tech@topship.africa, but the request
 * shape is behind a login we do not have, so the mapping is not written. It
 * reports that plainly rather than guessing at an endpoint: a fabricated call
 * would 404 and quietly fall back to the flat rate, and nobody would know why.
 *
 * Filling this in is one function. Everything around it — weight, origin,
 * caching, the re-price at order time, the fallback — is already here.
 */
const topshipProvider: RateProvider = {
  id: "topship",
  isConfigured() {
    return Boolean(env.topshipApiKey)
  },
  async quote() {
    return {
      ok: false,
      reason: env.topshipApiKey
        ? "Topship's rate request format still needs mapping — send us their API docs."
        : "Topship key is not set."
    }
  }
}

/** GIG Logistics. Same position as Topship: access is by arrangement. */
const gigProvider: RateProvider = {
  id: "gig",
  isConfigured() {
    return Boolean(env.gigApiKey)
  },
  async quote() {
    return {
      ok: false,
      reason: env.gigApiKey
        ? "GIG's rate request format still needs mapping — send us their API docs."
        : "GIG key is not set."
    }
  }
}

const PROVIDERS: Partial<Record<ShippingMethod, RateProvider>> = {
  dhl: dhlProvider,
  topship: topshipProvider,
  gig: gigProvider
}

export function getRateProvider(method: ShippingMethod) {
  return PROVIDERS[method]
}

/** True when at least one carrier could answer, so the UI can bother asking. */
export function hasAnyCarrierConfigured() {
  return Object.values(PROVIDERS).some((provider) => provider?.isConfigured())
}

/**
 * A carrier's own price for this parcel.
 *
 * Returns not-ok for every reason a quote might not happen — no keys, no
 * weight, carrier down, route unserved. Callers fall back to the seller's flat
 * rate. Nothing here is ever allowed to throw into a checkout.
 */
export async function quoteCarrier(
  method: ShippingMethod,
  request: RateRequest
): Promise<RateResult> {
  const provider = getRateProvider(method)
  if (!provider) return { ok: false, reason: "Not a carrier method." }
  if (!provider.isConfigured()) {
    return { ok: false, reason: `${method} is not configured.` }
  }

  if (!Number.isFinite(request.weightKg) || request.weightKg <= 0) {
    return {
      ok: false,
      reason: "No weight on the items, so no carrier can price them."
    }
  }

  if (!request.origin.city || !request.origin.countryCode) {
    return { ok: false, reason: "The store has no pickup address set." }
  }

  if (!request.destination.city || !request.destination.countryCode) {
    return { ok: false, reason: "No delivery city yet." }
  }

  try {
    return await provider.quote(request)
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Carrier request failed."
    }
  }
}
