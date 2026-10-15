import { type Metadata } from "next"

import { AdminDeliveryClient } from "@/components/admin-delivery-client"

export const metadata: Metadata = {
  title: "Delivery prices",
  robots: { index: false, follow: false }
}

export default function AdminDeliveryPage() {
  return <AdminDeliveryClient />
}
