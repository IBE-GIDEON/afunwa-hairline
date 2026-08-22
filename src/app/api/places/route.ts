import { NextResponse } from "next/server"

import { isCountryCode } from "@/lib/countries"
import citiesByCountry from "@/lib/geo/cities.json"
import statesByCountry from "@/lib/geo/states.json"

const STATES = statesByCountry as Record<string, string[]>
/** Cities live under the state they belong to. */
const CITIES = citiesByCountry as Record<string, Record<string, string[]>>

type Kind = "region" | "city"

/**
 * The states of a country, or its cities — narrowed to one state when asked.
 *
 * Sent once and filtered in the browser rather than searched here on every
 * keystroke. A round trip per letter is what made these fields feel slow next
 * to the country box, which is a plain select and answers instantly because
 * its options are already on the page.
 *
 * The payload is small enough for that: Nigeria's 491 cities are five
 * kilobytes, the median country is one, and the largest in the world is under
 * two hundred — fetched once per country and then cached.
 *
 * The lists only change when the app is deployed, so they cache hard.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const country = (searchParams.get("country") ?? "").trim().toUpperCase()
  const kind = (searchParams.get("kind") ?? "") as Kind
  // Optional. Given, cities come back narrowed to that state; absent, the
  // whole country is offered so a buyer who has not picked one is not stuck.
  const state = (searchParams.get("state") ?? "").trim()

  if (!isCountryCode(country) || (kind !== "region" && kind !== "city")) {
    return NextResponse.json({ items: [] })
  }

  let items: string[] = []

  if (kind === "region") {
    items = STATES[country] ?? []
  } else {
    const byState = CITIES[country] ?? {}
    if (state) {
      // Case-insensitively, since the state may have been typed rather than
      // picked from the list above it.
      const match = Object.keys(byState).find(
        (name) => name.toLowerCase() === state.toLowerCase()
      )
      items = match ? byState[match] : []
    } else {
      items = [...new Set(Object.values(byState).flat())].sort((a, b) =>
        a.localeCompare(b, "en")
      )
    }
  }

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800"
      }
    }
  )
}
