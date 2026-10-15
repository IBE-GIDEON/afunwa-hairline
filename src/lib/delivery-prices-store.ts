import { type SupabaseClient } from "@supabase/supabase-js"

import { env } from "@/lib/env"
import {
  normalizeDeliveryOptions,
  normalizeDeliveryPrices,
  type DeliveryOption,
  type DeliveryPrices
} from "@/lib/delivery"

/**
 * Server only. Reads and writes the delivery tables with the service role.
 */

/** Whether a signed-in user is one of the admin emails. Empty list means nobody. */
export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false
  return env.adminEmails.includes(email.trim().toLowerCase())
}

/** Every configured per-country delivery price. Errors are thrown, never hidden. */
export async function loadDeliveryPrices(supabase: SupabaseClient): Promise<DeliveryPrices> {
  const { data, error } = await supabase
    .from("delivery_prices")
    .select("country_code, fee_ngn")

  if (error) {
    throw new Error(`Delivery prices could not be read: ${error.message}`)
  }

  return normalizeDeliveryPrices(
    Object.fromEntries(
      (data ?? []).map((row) => [String(row.country_code), row.fee_ngn])
    )
  )
}

/** Every Nigerian delivery option, switched on or off, in admin order. */
export async function loadDeliveryOptions(supabase: SupabaseClient): Promise<DeliveryOption[]> {
  const { data, error } = await supabase
    .from("delivery_options")
    .select("id, label, detail, fee_ngn, active, sort_order")
    .order("sort_order", { ascending: true })

  if (error) {
    throw new Error(`Delivery options could not be read: ${error.message}`)
  }

  return normalizeDeliveryOptions(
    (data ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      detail: row.detail,
      fee: row.fee_ngn,
      active: row.active,
      sort_order: row.sort_order
    }))
  )
}
