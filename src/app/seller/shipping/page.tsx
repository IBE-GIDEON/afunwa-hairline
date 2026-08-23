import { type Metadata } from "next"

import { ShippingCheckClient } from "@/components/shipping-check-client"

export const metadata: Metadata = {
  title: "Shipping check"
}

export default function ShippingCheckPage() {
  return <ShippingCheckClient />
}
