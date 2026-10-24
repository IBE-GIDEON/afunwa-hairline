import type { Metadata } from "next"

import { AuthRouteClient } from "@/components/auth-route-client"
import { safeInternalPath } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Create your Afunwa account",
  description:
    "Join Afunwa in seconds with just an email and password, then shop wigs, hair and beauty delivered across Nigeria."
}

export default function SignUpPage({
  searchParams
}: {
  searchParams?: { next?: string | string[] }
}) {
  return (
    <AuthRouteClient mode="signup" next={safeInternalPath(searchParams?.next)} />
  )
}
