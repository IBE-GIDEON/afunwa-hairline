import crypto from "node:crypto"

import { env, hasPaystack } from "@/lib/env"

const API = "https://api.paystack.co"

/**
 * Opens a Paystack hosted checkout and returns the link to send the buyer to.
 *
 * Amount goes to Paystack in kobo, so naira is multiplied by 100 here and
 * nowhere else. Sending naira unconverted would charge a hundredth of the price.
 */
export async function initializePaystackTransaction(payload: {
  amount: number
  email: string
  reference: string
  callbackUrl: string
  metadata: Record<string, unknown>
}) {
  const response = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.paystackSecretKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: Math.round(payload.amount * 100),
      currency: "NGN",
      email: payload.email,
      reference: payload.reference,
      callback_url: payload.callbackUrl,
      metadata: payload.metadata
    })
  })

  const body = (await response.json().catch(() => null)) as {
    status?: boolean
    message?: string
    data?: { authorization_url?: string }
  } | null

  if (!response.ok || !body?.status || !body.data?.authorization_url) {
    throw new Error(body?.message ?? "Unable to start Paystack checkout")
  }

  return { checkoutUrl: body.data.authorization_url }
}

/**
 * Re-reads a transaction from Paystack.
 *
 * The webhook body is never trusted for money on its own. The signature proves
 * the event came from Paystack, but this call proves what Paystack says the
 * payment was, which is the only thing that may mark an order paid.
 */
export async function verifyPaystackTransaction(reference: string) {
  const response = await fetch(
    `${API}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${env.paystackSecretKey}` } }
  )

  const body = (await response.json().catch(() => null)) as {
    status?: boolean
    data?: {
      status?: string
      reference?: string
      amount?: number
      currency?: string
    }
  } | null

  if (!response.ok || !body?.status || !body.data) {
    return null
  }

  return body.data
}

/**
 * Paystack signs the raw request body with the secret key (HMAC SHA-512) and
 * sends the result in `x-paystack-signature`. Compared in constant time.
 *
 * No secret configured means nothing can be verified, so nothing is accepted.
 */
export function verifyPaystackSignature(rawBody: string, signature: string | null) {
  if (!hasPaystack || !signature) return false

  const expected = Buffer.from(
    crypto.createHmac("sha512", env.paystackSecretKey).update(rawBody).digest("hex")
  )
  const received = Buffer.from(signature)

  if (expected.length !== received.length) return false
  return crypto.timingSafeEqual(expected, received)
}
