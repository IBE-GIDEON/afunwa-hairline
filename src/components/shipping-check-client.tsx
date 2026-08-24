"use client"

import Link from "next/link"
import { useState } from "react"
import { FiAlertTriangle, FiCheck, FiX } from "react-icons/fi"

import { useAuth } from "@/components/providers/auth-provider"
import { Button, Card, Input, PAGE_WIDTH, SectionHeading } from "@/components/ui"
import { getAccessToken } from "@/lib/marketplace"
import { cn } from "@/lib/utils"

type CarrierResult = {
  carrier: string
  configured: boolean
  quoted: boolean
  reason?: string
  amount?: number
  currency?: string
  service?: string
}

type Diagnosis = {
  testedRoute: string
  readiness: {
    pickupCitySet: boolean
    pickupCountry: string
    productsWithWeight: number
    productsTotal: number
    storeDefaultWeightKg: number | null
    weightUsedForTestKg: number | null
    blocking: string[]
  }
  carriers: CarrierResult[]
}

/**
 * The seller's answer to "why is there no shipping price?".
 *
 * The same check as /api/shipping/diagnose, with a button on it. That endpoint
 * needs a bearer token, which is not something anyone can produce by typing a
 * URL into a browser — so asking a shop owner to call it directly was never a
 * real instruction.
 */
export function ShippingCheckClient() {
  const { profile, vendorProfile } = useAuth()
  const [city, setCity] = useState("Lagos")
  const [country, setCountry] = useState("NG")
  const [result, setResult] = useState<Diagnosis | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    setError("")

    try {
      const token = await getAccessToken()
      const response = await fetch(
        `/api/shipping/diagnose?to=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      )

      const data = (await response.json()) as Diagnosis & { error?: string }

      if (!response.ok) {
        setError(data.error ?? "Could not run the check.")
        setResult(null)
        return
      }

      setResult(data)
    } catch {
      setError("Could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!profile || !vendorProfile) {
    return (
      <div className={`${PAGE_WIDTH.content} space-y-4 p-4 pb-safe-nav lg:py-8`}>
        <SectionHeading title="Shipping check" />
        <Card className="p-5">
          <p className="text-lg font-semibold text-ink">Sellers only</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            This checks your own store's Easyship setup, so it needs the account
            that owns the store.
          </p>
          <Link
            href="/profile"
            className="mt-4 inline-flex rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white"
          >
            Go to Profile
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className={`${PAGE_WIDTH.content} space-y-4 p-4 pb-safe-nav lg:py-8`}>
      <SectionHeading title="Shipping check" />

      <Card className="p-5">
        <p className="text-sm leading-6 text-muted">
          Asks Easyship for a real courier price to a test address and shows
          exactly what came back. Run this after adding the Easyship token.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
          <Input
            value={city}
            placeholder="Deliver to city"
            onChange={(event) => setCity(event.target.value)}
          />
          <Input
            value={country}
            placeholder="NG"
            maxLength={2}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
          />
          <Button onClick={run} disabled={busy}>
            {busy ? "Checking..." : "Run check"}
          </Button>
        </div>

        {error ? (
          <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </Card>

      {result ? (
        <>
          {result.readiness.blocking.length > 0 ? (
            <Card className="border-amber-300 bg-amber-50 p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <FiAlertTriangle aria-hidden="true" />
                Fix these first — they stop Easyship
              </p>
              <ul className="mt-2 space-y-1">
                {result.readiness.blocking.map((line) => (
                  <li key={line} className="text-sm leading-6 text-amber-900">
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/onboarding/seller"
                className="mt-3 inline-flex rounded-full bg-chrome px-4 py-2.5 text-sm font-semibold text-white"
              >
                Open store settings
              </Link>
            </Card>
          ) : null}

          <Card className="p-5">
            <p className="text-sm font-bold text-ink">Route tested</p>
            <p className="mt-1 text-sm text-muted">{result.testedRoute}</p>

            <dl className="mt-4 space-y-2 text-sm">
              <Row
                label="Pickup address set"
                ok={result.readiness.pickupCitySet}
                value={result.readiness.pickupCitySet ? "Yes" : "Not set"}
              />
              <Row
                label="Products with a weight"
                ok={result.readiness.productsWithWeight > 0}
                value={`${result.readiness.productsWithWeight} of ${result.readiness.productsTotal}`}
              />
              <Row
                label="Weight used for this test"
                ok={Boolean(result.readiness.weightUsedForTestKg)}
                value={
                  result.readiness.weightUsedForTestKg
                    ? `${result.readiness.weightUsedForTestKg} kg`
                    : "None"
                }
              />
            </dl>
          </Card>

          <Card className="p-0">
            <p className="border-b border-border px-5 py-3 text-sm font-bold text-ink">
              Easyship
            </p>
            <div className="divide-y divide-border">
              {result.carriers.map((carrier) => (
                <div key={carrier.carrier} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold capitalize text-ink">
                      {carrier.carrier}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                        carrier.quoted
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-700"
                      )}
                    >
                      {carrier.quoted ? <FiCheck /> : <FiX />}
                      {carrier.quoted ? "Quoting" : "Not quoting"}
                    </span>
                  </div>

                  {carrier.quoted ? (
                    <p className="mt-1 text-sm text-muted">
                      {carrier.currency} {carrier.amount?.toLocaleString()}
                      {carrier.service ? ` — via ${carrier.service}` : ""}
                    </p>
                  ) : (
                    // The upstream's own words. This is the line worth pasting
                    // to anyone helping, so it is shown verbatim.
                    <p className="mt-1 break-words text-sm leading-6 text-muted">
                      {carrier.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}

function Row({
  label,
  value,
  ok
}: {
  label: string
  value: string
  ok: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "font-semibold",
          ok ? "text-success" : "text-rose-700"
        )}
      >
        {value}
      </dd>
    </div>
  )
}
