import { env } from "@/lib/env"
import { type RateProvider, type RateRequest, type RateResult } from "./types"

const LIVE_API = "https://public-api.easyship.com"
const SANDBOX_API = "https://public-api-sandbox.easyship.com"
const TIMEOUT_MS = 9000

function api() {
  return env.easyshipEnvironment === "sandbox" ? SANDBOX_API : LIVE_API
}

export const easyshipProvider: RateProvider = {
  id: "easyship",

  isConfigured() {
    return Boolean(env.easyshipAccessToken)
  },

  async quote(request: RateRequest): Promise<RateResult> {
    if (!this.isConfigured()) {
      return { ok: false, reason: "Easyship token is not set." }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(`${api()}/2024-09/rates`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.easyshipAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          origin_address: toEasyshipAddress(request.origin),
          destination_address: toEasyshipAddress(request.destination),
          incoterms: "DDU",
          calculate_tax_and_duties: false,
          shipping_settings: {
            output_currency: "NGN",
            units: { weight: "kg", dimensions: "cm" }
          },
          parcels: [
            {
              total_actual_weight: Math.max(0.1, Number(request.weightKg.toFixed(3))),
              box: {
                length: Math.max(1, Math.round(request.lengthCm)),
                width: Math.max(1, Math.round(request.widthCm)),
                height: Math.max(1, Math.round(request.heightCm))
              },
              items: [
                {
                  description: "Hair products",
                  hs_code: "670420",
                  quantity: 1,
                  origin_country_alpha2: request.origin.countryCode,
                  declared_currency: "NGN",
                  declared_customs_value: Math.max(1, Math.round(request.declaredValue))
                }
              ]
            }
          ]
        }),
        signal: controller.signal,
        cache: "no-store"
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        return {
          ok: false,
          reason: `Easyship replied ${response.status}. ${detail.slice(0, 200)}`
        }
      }

      const body = (await response.json()) as EasyshipRatesResponse
      let best: { amount: number; currency: string; name?: string } | null = null

      for (const rate of body.rates ?? []) {
        const priced = getPrice(rate)
        if (!priced || priced.currency !== "NGN") continue

        if (!best || priced.amount < best.amount) {
          best = {
            amount: priced.amount,
            currency: priced.currency,
            name: getServiceName(rate)
          }
        }
      }

      if (!best) {
        return { ok: false, reason: "Easyship returned no NGN-priced courier for that route." }
      }

      return {
        ok: true,
        amount: Math.round(best.amount * 100) / 100,
        currency: best.currency,
        serviceName: best.name
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError"
      return {
        ok: false,
        reason: aborted
          ? "Easyship did not answer in time."
          : `Easyship request failed: ${
              error instanceof Error ? error.message : "unknown"
            }`
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

type EasyshipRatesResponse = {
  rates?: EasyshipRate[]
}

type EasyshipRate = {
  currency?: unknown
  total_charge?: unknown
  min_delivery_time?: unknown
  max_delivery_time?: unknown
  courier_service?: {
    name?: unknown
    umbrella_name?: unknown
  }
  rates_in_origin_currency?: {
    currency?: unknown
    total_charge?: unknown
  }
}

function getPrice(rate: EasyshipRate) {
  const candidates = [
    {
      amount: Number(rate.rates_in_origin_currency?.total_charge),
      currency: clean(rate.rates_in_origin_currency?.currency)?.toUpperCase()
    },
    {
      amount: Number(rate.total_charge),
      currency: clean(rate.currency)?.toUpperCase()
    }
  ].filter(
    (price): price is { amount: number; currency: string } =>
      Number.isFinite(price.amount) && price.amount > 0 && Boolean(price.currency)
  )

  return candidates.find((price) => price.currency === "NGN") ?? candidates[0] ?? null
}

function getServiceName(rate: EasyshipRate) {
  const courier =
    clean(rate.courier_service?.umbrella_name) ??
    clean(rate.courier_service?.name) ??
    "Easyship courier"
  const min = Number(rate.min_delivery_time)
  const max = Number(rate.max_delivery_time)

  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
    return min === max
      ? `${courier} (${min} working days)`
      : `${courier} (${min}-${max} working days)`
  }

  return courier
}

function toEasyshipAddress(address: {
  countryCode: string
  city: string
  region?: string
  postalCode?: string
  addressLine?: string
}) {
  const city = clean(address.city) ?? "Lagos"
  const country = clean(address.countryCode)?.toUpperCase() ?? "NG"
  const postalCode = clean(address.postalCode)

  return {
    line_1: clean(address.addressLine) ?? `${city} address`,
    state: clean(address.region) ?? city,
    city,
    country_alpha2: country,
    ...(postalCode ? { postal_code: postalCode } : {})
  }
}

function clean(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  return text || undefined
}
