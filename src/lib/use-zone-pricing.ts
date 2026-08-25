"use client"

import { useEffect, useMemo, useState } from "react"

import { useLocale } from "@/components/providers/locale-provider"
import { getCurrencyMeta } from "@/lib/currency"
import { loadVendors } from "@/lib/marketplace"
import {
  computeZoneUplift,
  zoneForCountry,
  type ShippingZone,
  type ZoneRates
} from "@/lib/shipping-zones"

/**
 * The shop's zone rates, fetched once for the page.
 *
 * Module scope because every price on a grid asks for the same answer, and
 * one storefront has one set of rates. loadVendors is cached underneath, so
 * this is a single request however many products are on screen.
 */
let cachedRates: ZoneRates | null = null
let inFlight: Promise<ZoneRates> | null = null

async function loadZoneRates(): Promise<ZoneRates> {
  if (cachedRates) return cachedRates
  if (inFlight) return inFlight

  inFlight = loadVendors("")
    .then((vendors) => {
      const rates = (vendors[0]?.shippingZones ?? {}) as ZoneRates
      cachedRates = rates
      inFlight = null
      return rates
    })
    .catch(() => {
      inFlight = null
      return {}
    })

  return inFlight
}

/**
 * What to add to a price for where this shopper is.
 *
 * The zone follows the country already chosen in the header — the same choice
 * that picks their currency — so a shopper who switches to the UK sees UK
 * prices in pounds, and the two can never disagree about where they are.
 *
 * Nigeria adds nothing: it keeps the flat delivery fee it has always had.
 */
export function useZonePricing() {
  const { currency } = useLocale()
  const [rates, setRates] = useState<ZoneRates>(() => cachedRates ?? {})

  useEffect(() => {
    if (cachedRates) return
    let ignore = false
    loadZoneRates().then((next) => {
      if (!ignore) setRates(next)
    })
    return () => {
      ignore = true
    }
  }, [])

  const zone: ShippingZone = useMemo(
    () => zoneForCountry(getCurrencyMeta(currency).region ?? undefined),
    [currency]
  )

  return useMemo(
    () => ({
      zone,
      /** Naira to add to a product of this weight. Zero at home. */
      upliftFor: (weightKg: number | undefined) =>
        computeZoneUplift(zone, Number(weightKg ?? 0), rates),
      /** Whether prices here already contain the shipping. */
      shippingIncluded: zone !== "NG"
    }),
    [zone, rates]
  )
}
