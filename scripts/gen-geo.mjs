/**
 * Regenerates the state and city lists behind the checkout address lookup.
 *
 *   node scripts/gen-geo.mjs
 *
 * Source: github.com/dr5hn/countries-states-cities-database (CC BY 4.0).
 *
 * Downloaded once and committed rather than called at runtime, which is the
 * whole point: no API key, no billing account, no rate limit, no third party
 * that can be down while someone is trying to check out.
 *
 * Both files are keyed by ISO 3166-1 alpha-2 so they line up with the country
 * picker. The upstream data is keyed by country name, so the names are matched
 * against Intl's and anything unmatched is reported rather than dropped
 * silently.
 */
import { writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"

const BASE =
  "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json"

const OUT_DIR = join(process.cwd(), "src", "lib", "geo")
const FLAG_DIR = join(process.cwd(), "node_modules", "country-flag-icons", "3x2")

const displayNames = new Intl.DisplayNames(["en"], { type: "region" })

/**
 * Every country code, mapped from its English name for lookup.
 *
 * The codes come from the same place src/lib/countries.ts takes them, so the
 * keys here are guaranteed to be ones the country picker can actually ask for.
 * Walking AA to ZZ instead looked equivalent and was not: Intl still resolves
 * the legacy alias "UK" to "United Kingdom", so it overwrote GB and every
 * British address silently found nothing.
 */
function buildNameIndex() {
  const index = new Map()
  const codes = readdirSync(FLAG_DIR)
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.replace(".svg", ""))
    .filter((code) => /^[A-Z]{2}$/.test(code))

  for (const code of codes) {
    let name
    try {
      name = displayNames.of(code)
    } catch {
      continue
    }
    if (!name || name === code) continue
    index.set(normalize(name), code)
  }

  // Names the dataset spells differently from Intl.
  const aliases = {
    "united states of america": "US",
    "russian federation": "RU",
    "syrian arab republic": "SY",
    "iran islamic republic of": "IR",
    "korea south": "KR",
    "korea north": "KP",
    "cote divoire": "CI",
    "cape verde": "CV",
    "czech republic": "CZ",
    "swaziland": "SZ",
    "macedonia": "MK",
    "burma": "MM",
    "east timor": "TL",
    "vatican city": "VA",
    "palestinian territory occupied": "PS",
    "congo the democratic republic of the": "CD",
    "tanzania united republic of": "TZ",
    "bolivia plurinational state of": "BO",
    "venezuela bolivarian republic of": "VE",
    "moldova republic of": "MD",
    "brunei darussalam": "BN",
    "lao peoples democratic republic": "LA",
    "viet nam": "VN",
    "macau sar china": "MO",
    "hong kong sar china": "HK",
    // Names where the two sources disagree on more than punctuation.
    "turkey": "TR",
    "ivory coast": "CI",
    "myanmar": "MM",
    "congo": "CG",
    "democratic republic congo": "CD",
    "hong kong s a r": "HK",
    "macau s a r": "MO",
    "man isle": "IM",
    "fiji islands": "FJ",
    "pitcairn island": "PN",
    "st helena": "SH",
    "st barthelemy": "BL",
    "st martin french part": "MF",
    "sint maarten dutch part": "SX",
    "bonaire sint eustatius saba": "BQ",
    "south georgia": "GS",
    "svalbard jan mayen islands": "SJ",
    "wallis futuna islands": "WF",
    "vatican city state holy see": "VA",
    "virgin islands british": "VG",
    "virgin islands us": "VI",
    "united states minor outlying islands": "UM",
    "heard island mcdonald islands": "HM",
    "turks caicos islands": "TC",
    "sao tome principe": "ST"
  }
  for (const [name, code] of Object.entries(aliases)) index.set(name, code)

  return index
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    // Intl writes "Antigua & Barbuda" where the dataset writes "Antigua and
    // Barbuda", and "Bahamas" where it writes "The Bahamas". Dropping both
    // joining words makes the two spellings meet.
    .replace(/\b(and|the|of)\b/g, " ")
    // Intl abbreviates "St. Lucia"; the dataset spells "Saint Lucia".
    .replace(/\bsaint\b/g, "st")
    .replace(/\s+/g, " ")
    .trim()
}

async function grab(file) {
  const response = await fetch(`${BASE}/${encodeURIComponent(file)}`)
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)
  return response.json()
}

const nameIndex = buildNameIndex()
const unmatched = new Set()

function toCode(countryName) {
  const code = nameIndex.get(normalize(countryName))
  if (!code) unmatched.add(countryName)
  return code
}

// One source for both, because cities have to be grouped by the state they
// sit in. The flat per-country city list could not do that, so a buyer in
// Cross River was offered every city in Nigeria.
const nested = await grab("countries+states+cities.json")

const states = {}
const cities = {}

for (const country of nested) {
  const code = toCode(country.name)
  if (!code) continue

  const stateNames = []
  const byState = {}

  for (const state of country.states ?? []) {
    const stateName = typeof state?.name === "string" ? state.name.trim() : ""
    if (!stateName) continue
    stateNames.push(stateName)

    const cityNames = [
      ...new Set(
        (state.cities ?? [])
          .map((city) => (typeof city?.name === "string" ? city.name.trim() : ""))
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b, "en"))

    if (cityNames.length) byState[stateName] = cityNames
  }

  if (stateNames.length) {
    states[code] = [...new Set(stateNames)].sort((a, b) => a.localeCompare(b, "en"))
  }
  if (Object.keys(byState).length) cities[code] = byState
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, "states.json"), JSON.stringify(states), "utf8")
writeFileSync(join(OUT_DIR, "cities.json"), JSON.stringify(cities), "utf8")

const countStates = Object.values(states).reduce((sum, list) => sum + list.length, 0)
const countCities = Object.values(cities).reduce(
  (sum, byState) =>
    sum + Object.values(byState).reduce((inner, list) => inner + list.length, 0),
  0
)
const ngCities = Object.values(cities.NG ?? {}).reduce((sum, l) => sum + l.length, 0)

console.log(`states: ${countStates} across ${Object.keys(states).length} countries`)
console.log(`cities: ${countCities} across ${Object.keys(cities).length} countries`)
console.log(`nigeria: ${states.NG?.length ?? 0} states, ${ngCities} cities in ${Object.keys(cities.NG ?? {}).length} states`)
if (unmatched.size) {
  console.log(`\nunmatched country names (${unmatched.size}):`)
  for (const name of unmatched) console.log(`  ${name}`)
}
