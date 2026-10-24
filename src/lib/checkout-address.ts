import { safeLocalStorage } from "@/lib/safe-storage"
import {
  DEFAULT_COUNTRY_CODE,
  getCountryName,
  isCountryCode
} from "@/lib/countries"
import { formatNigerianPhone, normalizeNigerianPhone } from "@/lib/nigeria"

/**
 * The delivery address as the buyer fills it in.
 *
 * The orders table keeps a single delivery_address text column, so this shape
 * lives on the buyer's own device and is folded down to one line when the
 * order is placed. Keeping the parts apart is what lets the checkout page
 * reopen the form with everything still in its own field.
 */
export interface CheckoutAddress {
  firstName: string
  lastName: string
  /** ISO 3166-1 alpha-2. */
  country: string
  region: string
  city: string
  phone: string
  additionalPhone: string
  address: string
  landmark: string
}

export const EMPTY_CHECKOUT_ADDRESS: CheckoutAddress = {
  firstName: "",
  lastName: "",
  country: DEFAULT_COUNTRY_CODE,
  region: "",
  city: "",
  phone: "",
  additionalPhone: "",
  address: "",
  landmark: ""
}

const STORAGE_KEY = "afunwa-checkout-address-v1"

export function loadSavedAddress(): CheckoutAddress | null {
  if (typeof window === "undefined") return null

  const raw = safeLocalStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<CheckoutAddress>
    const address = { ...EMPTY_CHECKOUT_ADDRESS, ...parsed }
    // A half-written record from an older version should not present itself as
    // a finished address and skip the buyer past the form.
    return validateAddress(address) === null ? address : null
  } catch {
    return null
  }
}

export function persistAddress(address: CheckoutAddress) {
  if (typeof window === "undefined") return
  safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(address))
}

/**
 * Nigeria gets the local-format handling — 0803… becomes +234803…. Anywhere
 * else is taken as typed, because assuming a Nigerian country code for a Ghana
 * number would rewrite it into one the seller cannot call.
 */
export function normalizeAddressPhone(raw: string, country: string) {
  if (country === DEFAULT_COUNTRY_CODE) return normalizeNigerianPhone(raw)

  const compact = raw.trim().replace(/[\s()-]/g, "")
  return /^\+?\d{7,15}$/.test(compact) ? compact : ""
}

export function formatAddressPhone(phone: string, country: string) {
  return country === DEFAULT_COUNTRY_CODE
    ? formatNigerianPhone(phone)
    : phone.trim()
}

/** The first thing wrong with the address, or null when it is usable. */
export function validateAddress(address: CheckoutAddress): string | null {
  if (!address.firstName.trim()) return "Add your first name."
  if (!address.lastName.trim()) return "Add your last name."
  if (!isCountryCode(address.country)) return "Choose your country."
  if (!address.region.trim()) {
    return address.country === DEFAULT_COUNTRY_CODE
      ? "Choose your state."
      : "Add your state or province."
  }
  if (!address.city.trim()) return "Add your city or area."
  if (!address.address.trim()) return "Add the delivery address."
  if (!normalizeAddressPhone(address.phone, address.country)) {
    return address.country === DEFAULT_COUNTRY_CODE
      ? "Add a valid phone number, like 0803 000 0000."
      : "Add a valid phone number, with its country code."
  }
  if (
    address.additionalPhone.trim() &&
    !normalizeAddressPhone(address.additionalPhone, address.country)
  ) {
    return "Check the additional phone number, or clear it."
  }
  return null
}

export function getFullName(address: CheckoutAddress) {
  return `${address.firstName.trim()} ${address.lastName.trim()}`.trim()
}

/** The two lines under the collapsed step, as on the confirmation card. */
export function addressSummary(address: CheckoutAddress) {
  const place = [address.address.trim(), address.landmark.trim()]
    .filter(Boolean)
    .join(", ")

  const region = [address.region.trim(), address.city.trim()]
    .filter(Boolean)
    .join(" - ")

  return {
    name: getFullName(address),
    detail: [
      place,
      region,
      getCountryName(address.country),
      formatAddressPhone(address.phone, address.country)
    ]
      .filter(Boolean)
      .join(" | ")
  }
}

/**
 * Everything the seller needs to deliver, on one line.
 *
 * One line rather than several because the same string is shown read-only on
 * the order page and loaded into a textarea when the buyer edits it, and a
 * read-only paragraph would collapse the newlines anyway.
 */
export function composeDeliveryAddress(address: CheckoutAddress) {
  const parts = [
    getFullName(address),
    address.address.trim(),
    address.landmark.trim() ? `near ${address.landmark.trim()}` : "",
    address.city.trim(),
    address.region.trim(),
    getCountryName(address.country)
  ].filter(Boolean)

  const phones = [address.phone, address.additionalPhone]
    .map((value) => formatAddressPhone(value, address.country))
    .filter(Boolean)

  const contact = phones.length > 1 ? `${phones[0]} or ${phones[1]}` : phones[0] ?? ""

  return contact ? `${parts.join(", ")} — ${contact}` : parts.join(", ")
}
