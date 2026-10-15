import { type SupabaseClient } from "@supabase/supabase-js"

import { env } from "@/lib/env"
import { normalizeDeliveryPrices, type DeliveryPrices } from "@/lib/delivery"

/**
 * Server only. Reads and writes the delivery_prices table with the service role.
 */

/** Whether a signed-in user is one of the admin emails. Empty list means nobody. */
export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false
  return env.adminEmails.includes(email.trim().toLowerCase())
}

/** Every configured delivery price. Errors are thrown, never hidden. */
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
