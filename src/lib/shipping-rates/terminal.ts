import { env } from "@/lib/env"
import { type RateProvider, type RateRequest, type RateResult } from "./types"

/**
 * Terminal Africa (TShip), an aggregator.
 *
 * One key gets rates from DHL Express, FedEx, Aramex and the Nigerian local
 * couriers at once, and this returns the cheapest of them. That is the point:
 * every other carrier here needs its own account, its own contract and its own
 * onboarding, while this one issues a key from a dashboard.
 *
 * It also prices in the currency asked for — NGN, EUR, GBP, USD and others —
 * so Africa and Europe come from the same call.
 */
const LIVE_API = "https://api.terminal.africa/v1"
const SANDBOX_API = "https://sandbox.terminal.africa/v1"

/** A carrier being slow must not hold up a checkout page. */
const TIMEOUT_MS = 9000

function api() {
  return env.terminalEnvironment === "sandbox" ? SANDBOX_API : LIVE_API
}

export const terminalProvider: RateProvider = {
  id: "terminal",

  isConfigured() {
    return Boolean(env.terminalApiKey)
  },

  async quote(request: RateRequest): Promise<RateResult> {
    if (!this.isConfigured()) {
      return { ok: false, reason: "Terminal Africa key is not set." }
    }

    if (!env.terminalPackagingId) {
      return {
        ok: false,
        reason:
          "TERMINAL_PACKAGING_ID is not set. Copy a packaging id from the Terminal dashboard."
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(`${api()}/rates/shipment/quotes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.terminalApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pickup_address: toTerminalAddress(request.origin),
          delivery_address: toTerminalAddress(request.destination),
          parcel: {
            weight: Number(request.weightKg.toFixed(3)),
            weight_unit: "kg",
            packaging: env.terminalPackagingId,
            description: "Hair products",
            items: [
              {
                name: "Hair products",
                description: "Wigs, closures, frontals or bundles",
                quantity: 1,
                value: Math.round(request.declaredValue),
                currency: "NGN",
                weight: Number(request.weightKg.toFixed(3))
              }
            ]
          },
          // Naira, so the figure lands beside every other price in the shop
          // without a second conversion.
          currency: "NGN"
        }),
        signal: controller.signal,
        cache: "no-store"
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        return {
          ok: false,
          reason: `Terminal replied ${response.status}. ${detail.slice(0, 200)}`
        }
      }

      const body = (await response.json()) as {
        status?: boolean
        message?: string
        data?:
          | { rates?: TerminalRate[] }
          | TerminalRate[]
      }

      // Their payload has appeared both as a bare array and wrapped in rates,
      // so accept either rather than break on the one we did not see.
      const raw = Array.isArray(body.data)
        ? body.data
        : (body.data?.rates ?? [])

      let best: { amount: number; currency: string; carrier?: string } | null = null

      for (const rate of raw) {
        const amount = Number(rate?.amount)
        if (!Number.isFinite(amount) || amount <= 0) continue
        if (!best || amount < best.amount) {
          best = {
            amount,
            currency: String(rate?.currency ?? "NGN"),
            carrier: rate?.carrier_name ? String(rate.carrier_name) : undefined
          }
        }
      }

      if (!best) {
        return {
          ok: false,
          reason:
            body.message ?? "Terminal returned no priced carrier for that route."
        }
      }

      return {
        ok: true,
        amount: Math.round(best.amount * 100) / 100,
        currency: best.currency,
        serviceName: best.carrier
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError"
      return {
        ok: false,
        reason: aborted
          ? "Terminal did not answer in time."
          : `Terminal request failed: ${
              error instanceof Error ? error.message : "unknown"
            }`
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

type TerminalRate = {
  amount?: unknown
  currency?: unknown
  carrier_name?: unknown
}

function toTerminalAddress(address: {
  countryCode: string
  city: string
  region?: string
  postalCode?: string
  addressLine?: string
}) {
  return {
    city: address.city,
    // They take the ISO code here, the same value the country picker holds.
    country: address.countryCode,
    state: address.region ?? address.city,
    ...(address.addressLine ? { line1: address.addressLine } : {}),
    ...(address.postalCode ? { zip: address.postalCode } : {})
  }
}
