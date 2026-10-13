import { hasPaystackCheckout } from "@/lib/env"
import { PAY_ON_DELIVERY_ENABLED } from "@/lib/feature-flags"
import { type PaymentMethod } from "@/lib/types"

/**
 * The ways a buyer may pay, in the order they are offered.
 *
 * One list, so the checkout page and anything else that offers a choice can
 * never disagree, and so the default can never be a method the buyer was not
 * shown. Direct transfer is the only route while Pay on Delivery is off.
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  // Card first: it is the only one that settles before the parcel moves.
  ...(hasPaystackCheckout ? (["paystack"] as PaymentMethod[]) : []),
  // Handing out an account number and confirming payments by hand is the
  // fallback, not the plan. Paystack's own page already takes a bank transfer
  // and confirms it by webhook, so once it is configured this route disappears.
  //
  // It stays while Paystack is unconfigured, because with Pay on Delivery off
  // too, removing it outright would leave checkout with no way to pay.
  ...(hasPaystackCheckout ? [] : (["vendor_transfer"] as PaymentMethod[])),
  ...(PAY_ON_DELIVERY_ENABLED ? (["pay_on_delivery"] as PaymentMethod[]) : [])
]

/** Rails where the money is taken before the parcel moves. */
const PREPAID_METHODS: PaymentMethod[] = ["paystack"]

export function isPrepaidMethod(method: PaymentMethod) {
  return PREPAID_METHODS.includes(method)
}

/**
 * What a buyer in this country may pay with.
 *
 * Outside Nigeria it is card only, deliberately. An international parcel costs
 * tens of thousands of naira to send and cannot be recovered. A buyer in
 * Monrovia who goes quiet after a transfer promise takes the courier fee with
 * them. At home a failed order costs a rider, which is survivable.
 *
 * Returns nothing when no card rail is configured, rather than quietly falling
 * back to a transfer. Refusing the order is the cheaper mistake.
 */
export function paymentMethodsFor(
  countryCode: string | undefined,
  homeCountry = "NG"
): PaymentMethod[] {
  if (!countryCode || countryCode.toUpperCase() === homeCountry) {
    return PAYMENT_METHODS
  }
  return PAYMENT_METHODS.filter(isPrepaidMethod)
}
