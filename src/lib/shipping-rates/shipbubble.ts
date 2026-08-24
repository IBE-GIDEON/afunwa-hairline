import { getCountryName } from "@/lib/countries"
import { env } from "@/lib/env"
import { type RateAddress, type RateProvider, type RateRequest, type RateResult } from "./types"

const DEFAULT_API_BASE_URL = "https://api.shipbubble.com"
const TIMEOUT_MS = 9000

type ShipbubblePostResult = {
  ok: boolean
  status: number
  data: unknown
  text: string
}

type AddressCodeResult =
  | { ok: true; code: number }
  | { ok: false; reason: string }

type CategoryIdResult =
  | { ok: true; id: number }
  | { ok: false; reason: string }

let cachedCategoryId: number | null = null

export const shipbubbleProvider: RateProvider = {
  id: "courier",

  isConfigured() {
    return Boolean(env.shipbubbleApiKey)
  },

  async quote(request: RateRequest): Promise<RateResult> {
    if (!this.isConfigured()) {
      return { ok: false, reason: "Shipbubble key is not set." }
    }

    try {
      const [sender, receiver] = await Promise.all([
        validateAddress(request.origin, "sender"),
        validateAddress(request.destination, "receiver")
      ])

      if (!sender.ok) return sender
      if (!receiver.ok) return receiver

      const category = await getCategoryId()
      if (!category.ok) return category

      const response = await postShipbubble("/v1/shipping/fetch_rates", {
        sender_address_code: sender.code,
        // Shipbubble's public docs spell this field this way.
        reciever_address_code: receiver.code,
        pickup_date: tomorrowDate(),
        category_id: category.id,
        service_type: "pickup",
        delivery_instructions: "Please call before pickup or delivery.",
        package_items: [
          {
            name: "Afunwa order",
            description: "Customer order",
            unit_weight: String(Math.max(0.1, roundTo(request.weightKg, 3))),
            unit_amount: String(Math.max(1, Math.round(request.declaredValue))),
            quantity: "1"
          }
        ],
        package_dimension: {
          length: Math.max(1, Math.round(request.lengthCm)),
          width: Math.max(1, Math.round(request.widthCm)),
          height: Math.max(1, Math.round(request.heightCm))
        }
      })

      if (!response.ok) {
        return {
          ok: false,
          reason: describeShipbubbleError("Shipbubble rates", response)
        }
      }

      const best = pickBestRate(response.data)
      if (!best) {
        return {
          ok: false,
          reason: "Shipbubble returned no pickup courier for that route."
        }
      }

      return {
        ok: true,
        amount: Math.round(best.amount * 100) / 100,
        currency: best.currency,
        serviceName: best.serviceName
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError"
      return {
        ok: false,
        reason: aborted
          ? "Shipbubble did not answer in time."
          : `Shipbubble request failed: ${
              error instanceof Error ? error.message : "unknown"
            }`
      }
    }
  }
}

async function validateAddress(
  address: RateAddress,
  role: "sender" | "receiver"
): Promise<AddressCodeResult> {
  const contact = toShipbubbleContact(address, role)
  if (!contact.ok) return contact

  const response = await postShipbubble("/v1/shipping/address/validate", contact.body)
  if (!response.ok) {
    return {
      ok: false,
      reason: describeShipbubbleError(`Shipbubble ${role} address`, response)
    }
  }

  const code = readNumber(asObject(asObject(response.data)?.data)?.address_code)
  if (!code) {
    return {
      ok: false,
      reason: `Shipbubble ${role} address validation returned no address code.`
    }
  }

  return { ok: true, code }
}

function toShipbubbleContact(
  address: RateAddress,
  role: "sender" | "receiver"
):
  | { ok: true; body: { name: string; email: string; phone: string; address: string } }
  | { ok: false; reason: string } {
  const name =
    clean(address.name) ||
    (role === "sender" ? clean(env.shipbubbleSenderName) : "") ||
    (role === "sender" ? "Afunwa store" : "Afunwa customer")

  const email =
    normalizeEmail(address.email) ||
    (role === "sender" ? normalizeEmail(env.shipbubbleSenderEmail) : "")

  const phone =
    normalizePhone(address.phone) ||
    (role === "sender" ? normalizePhone(env.shipbubbleSenderPhone) : "")

  const addressText = formatAddress(address)

  if (!email) {
    return {
      ok: false,
      reason:
        role === "sender"
          ? "Shipbubble needs the store owner's email."
          : "Shipbubble needs the buyer's email."
    }
  }

  if (!phone) {
    return {
      ok: false,
      reason:
        role === "sender"
          ? "Shipbubble needs the store pickup phone."
          : "Shipbubble needs the buyer's phone."
    }
  }

  if (!addressText) {
    return {
      ok: false,
      reason:
        role === "sender"
          ? "Shipbubble needs the store pickup address."
          : "Shipbubble needs the buyer's delivery address."
    }
  }

  return { ok: true, body: { name, email, phone, address: addressText } }
}

async function postShipbubble(
  path: string,
  body: Record<string, unknown>
): Promise<ShipbubblePostResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.shipbubbleApiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store"
    })

    const text = await response.text().catch(() => "")
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }

    return { ok: response.ok, status: response.status, data, text }
  } finally {
    clearTimeout(timer)
  }
}

async function getShipbubble(path: string): Promise<ShipbubblePostResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.shipbubbleApiKey}`
      },
      signal: controller.signal,
      cache: "no-store"
    })

    const text = await response.text().catch(() => "")
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }

    return { ok: response.ok, status: response.status, data, text }
  } finally {
    clearTimeout(timer)
  }
}

function pickBestRate(data: unknown) {
  const payload = asObject(asObject(data)?.data) ?? asObject(data)
  if (!payload) return null

  const candidates = [
    readCourier(payload.cheapest_courier),
    ...((Array.isArray(payload.couriers) ? payload.couriers : [])
      .map(readCourier)
      .filter(Boolean) as Array<{
      amount: number
      currency: string
      serviceName?: string
    }>)
  ].filter(Boolean) as Array<{
    amount: number
    currency: string
    serviceName?: string
  }>

  if (candidates.length === 0) return null
  return candidates.sort((left, right) => left.amount - right.amount)[0]
}

function readCourier(value: unknown) {
  const courier = asObject(value)
  if (!courier) return null

  const amount =
    readNumber(courier.rate_card_amount) ??
    readNumber(courier.total) ??
    readNumber(courier.amount)

  if (!amount || amount <= 0) return null

  const courierName = clean(courier.courier_name)
  const serviceCode = clean(courier.service_code)
  const eta = clean(courier.delivery_eta)
  const serviceName = [courierName, serviceCode, eta ? `Delivery: ${eta}` : ""]
    .filter(Boolean)
    .join(" - ")

  return {
    amount,
    currency:
      clean(courier.rate_card_currency) ||
      clean(courier.currency) ||
      "NGN",
    serviceName: serviceName || undefined
  }
}

function describeShipbubbleError(prefix: string, response: ShipbubblePostResult) {
  const data = asObject(response.data)
  const message = clean(data?.message)
  const errors = Array.isArray(data?.errors)
    ? data.errors.map(clean).filter(Boolean).join(" ")
    : ""
  const detail = [message, errors].filter(Boolean).join(" ")
  const fallback = response.text.slice(0, 220)
  return `${prefix} replied ${response.status}. ${detail || fallback}`.trim()
}

function apiBaseUrl() {
  return (env.shipbubbleBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "")
}

async function getCategoryId(): Promise<CategoryIdResult> {
  const configured = Number(env.shipbubbleCategoryId)
  if (Number.isFinite(configured) && configured > 0) {
    return { ok: true, id: Math.floor(configured) }
  }

  if (cachedCategoryId) {
    return { ok: true, id: cachedCategoryId }
  }

  const response = await getShipbubble("/v1/shipping/labels/categories")
  if (!response.ok) {
    return {
      ok: false,
      reason: describeShipbubbleError("Shipbubble categories", response)
    }
  }

  const categoryId = pickCategoryId(response.data)
  if (!categoryId) {
    return {
      ok: false,
      reason: "Shipbubble returned no usable package category."
    }
  }

  cachedCategoryId = categoryId
  return { ok: true, id: categoryId }
}

function pickCategoryId(data: unknown) {
  const payload = asObject(data)
  const categories = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.categories)
      ? payload.categories
      : []

  const parsed = categories
    .map((value) => {
      const row = asObject(value)
      if (!row) return null

      const id = readNumber(row.category_id) ?? readNumber(row.id)
      const label = clean(row.category) || clean(row.name) || clean(row.label)
      return id && label ? { id, label: label.toLowerCase() } : null
    })
    .filter(Boolean) as Array<{ id: number; label: string }>

  for (const preferred of [
    "fashion",
    "hair",
    "wig",
    "beauty",
    "cosmetic",
    "accessor",
    "jewel"
  ]) {
    const match = parsed.find((category) => category.label.includes(preferred))
    if (match) return match.id
  }

  return parsed[0]?.id ?? null
}

function tomorrowDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function formatAddress(address: RateAddress) {
  const seen = new Set<string>()
  return [
    address.addressLine,
    address.city,
    address.region,
    getCountryName(address.countryCode)
  ]
    .map(clean)
    .filter((part) => {
      if (!part) return false
      const key = part.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(", ")
}

function normalizeEmail(value: unknown) {
  const email = clean(value).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""
}

function normalizePhone(value: unknown) {
  const raw = clean(value)
  if (!raw) return ""
  if (raw.startsWith("+")) return raw

  const digits = raw.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`
  return `+${digits}`
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function readNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function roundTo(value: number, places: number) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
