/**
 * Regenerates src/lib/geo/zones.json — which shipping zone each country is in.
 *
 *   node scripts/gen-zones.mjs
 *
 * Source: github.com/dr5hn/countries-states-cities-database (CC BY 4.0), using
 * its UN region and subregion fields rather than a hand-typed list of 250
 * countries, which would be wrong somewhere and nobody would ever notice.
 *
 * Every country lands in a zone. Anything the data does not classify falls to
 * ROW, so a buyer in an obscure territory still gets a price rather than an
 * error.
 */
import { writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"

const SOURCE =
  "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json"

const OUT_DIR = join(process.cwd(), "src", "lib", "geo")
const FLAG_DIR = join(process.cwd(), "node_modules", "country-flag-icons", "3x2")

/** Countries the picker can actually offer, so the two files agree. */
const known = new Set(
  readdirSync(FLAG_DIR)
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.replace(".svg", ""))
    .filter((code) => /^[A-Z]{2}$/.test(code))
)

function zoneFor(country) {
  const code = country.iso2
  const region = country.region ?? ""
  const sub = country.subregion ?? ""

  if (code === "NG") return "NG"

  // The UK left the EU, so its customs and courier pricing diverged from the
  // continent. Worth its own zone rather than averaged into Europe.
  if (code === "GB" || code === "IE") return "UKI"

  if (region === "Africa") {
    return sub === "Western Africa" ? "WAF" : "AFR"
  }

  if (region === "Europe") return "EUR"

  if (region === "Americas") {
    // Northern America is the US, Canada and their neighbours. The Caribbean
    // and Latin America price quite differently, so they sit in ROW.
    return sub === "Northern America" ? "NAM" : "ROW"
  }

  if (region === "Asia") {
    // The UN calls the Middle East "Western Asia".
    return sub === "Western Asia" ? "MEA" : "APAC"
  }

  if (region === "Oceania") return "APAC"

  return "ROW"
}

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`countries.json: HTTP ${response.status}`)
const countries = await response.json()

const zones = {}
for (const country of countries) {
  const code = country.iso2
  if (!code || !known.has(code)) continue
  zones[code] = zoneFor(country)
}

// Anything the picker offers that the dataset never mentioned still needs a
// home, or a buyer there would fall through to no zone at all.
for (const code of known) {
  if (!zones[code]) zones[code] = "ROW"
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(
  join(OUT_DIR, "zones.json"),
  JSON.stringify(zones),
  "utf8"
)

const counts = {}
for (const zone of Object.values(zones)) counts[zone] = (counts[zone] ?? 0) + 1

console.log(`${Object.keys(zones).length} countries mapped`)
for (const [zone, count] of Object.entries(counts).sort()) {
  console.log(`  ${zone.padEnd(5)} ${count}`)
}
