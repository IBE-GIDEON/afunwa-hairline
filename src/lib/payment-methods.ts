import { hasFlutterwave, hasPayPal } from "@/lib/env"
import { PAY_ON_DELIVERY_ENABLED } from "@/lib/feature-flags"
import { type PaymentMethod } from "@/lib/types"

/**
 * The ways a buyer may pay, in the order they are offered.
 *
 * One list, so the checkout page and anything else that offers a choice can
 * never disagree — and so the default can never be a method the buyer was not
 * shown. Direct transfer is the only route while Pay on Delivery is off.
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  // Card first: it is the only one that settles before the parcel moves.
  ...(hasFlutterwave ? (["flutterwave"] as PaymentMethod[]) : []),
  ...(hasPayPal ? (["paypal"] as PaymentMethod[]) : []),
  // Handing out an account number and confirming payments by hand is the
  // fallback, not the plan. Flutterwave's own page already takes a bank
  // transfer and confirms it by webhook, so once it is configured this route
  // is strictly worse and disappears.
  //
  // It stays while Flutterwave is unconfigured, because with Pay on Delivery
  // off too, removing it outright would leave checkout with no way to pay.
  ...(hasFlutterwave ? [] : (["vendor_transfer"] as PaymentMethod[])),
  ...(PAY_ON_DELIVERY_ENABLED ? (["pay_on_delivery"] as PaymentMethod[]) : [])
]
