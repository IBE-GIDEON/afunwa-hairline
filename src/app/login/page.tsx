import type { Metadata } from "next"

import { AuthRouteClient } from "@/components/auth-route-client"
import { safeInternalPath } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Sign in to Afunwa",
  description:
    "Sign in to Afunwa to track your orders, message vendors and pick up where you left off."
}

export default function LoginPage({
  searchParams
}: {
  searchParams?: { next?: string | string[] }
}) {
  return (
    <AuthRouteClient mode="signin" next={safeInternalPath(searchParams?.next)} />
  )
}
