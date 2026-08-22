"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { FiChevronDown } from "react-icons/fi"

import { Input } from "@/components/ui"
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries"
import { NIGERIAN_STATES } from "@/lib/nigeria"
import { cn } from "@/lib/utils"

export type PlaceSuggestion = {
  text: string
  /** The state a city sits in, when its name gives it away. */
  secondary: string
}

/** How many rows the list shows at once. It scrolls past that. */
const MAX_VISIBLE = 60

type Entry = {
  text: string
  /** Lowercased and stripped of accents, computed once when the list loads. */
  folded: string
}

type LoadedList = {
  entries: Entry[]
  /** Which state each city belongs to, so picking one fills the field above. */
  stateByCity: Map<string, string>
}

/**
 * Country lists, kept for the life of the page.
 *
 * Module scope, not component state: the state field and the city field are
 * separate components, a buyer moves between them and back, and re-fetching
 * Nigeria's cities each time is what made this feel slow.
 */
const listCache = new Map<string, LoadedList>()
const inFlight = new Map<string, Promise<LoadedList>>()

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/**
 * Nigerian states are already in the bundle, so seed them rather than fetch
 * them. This is the field almost every buyer touches, and it now opens with no
 * request at all — the same as the country box beside it.
 */
listCache.set(`${DEFAULT_COUNTRY_CODE}:region:`, {
  entries: NIGERIAN_STATES.map((text) => ({ text, folded: fold(text) })),
  stateByCity: new Map()
})

async function loadList(country: string, kind: "region" | "city", state: string) {
  // The state is part of the key: Lagos's cities and Kano's are different
  // lists for the same country, and both are worth keeping.
  const key = `${country}:${kind}:${kind === "city" ? state.toLowerCase() : ""}`

  const cached = listCache.get(key)
  if (cached) return cached

  const existing = inFlight.get(key)
  if (existing) return existing

  const request = (async () => {
    const scoped =
      kind === "city" && state ? `&state=${encodeURIComponent(state)}` : ""

    const response = await fetch(`/api/places?country=${country}&kind=${kind}${scoped}`)
    const items: string[] = response.ok
      ? ((await response.json()) as { items?: string[] }).items ?? []
      : []

    // With a state chosen every city in the list belongs to it, so the parent
    // is known outright rather than guessed from a matching name.
    const stateByCity = new Map<string, string>()
    if (kind === "city" && state) {
      for (const city of items) stateByCity.set(fold(city), state)
    }

    const loaded: LoadedList = {
      entries: items.map((text) => ({ text, folded: fold(text) })),
      stateByCity
    }

    listCache.set(key, loaded)
    inFlight.delete(key)
    return loaded
  })()

  inFlight.set(key, request)
  return request
}

/**
 * A text field that offers real places as you type.
 *
 * The country's whole list is fetched once and filtered here, so opening the
 * list and narrowing it are both immediate — no request per keystroke, no
 * debounce to wait out. It stays an ordinary text input underneath: a place
 * the list has never heard of is still accepted, because an address field that
 * refuses an address is worse than no list at all.
 */
export function PlaceAutocomplete({
  value,
  onChange,
  onSelect,
  country,
  kind,
  state = "",
  placeholder,
  autoComplete
}: {
  value: string
  onChange: (next: string) => void
  /** Fires only on picking a suggestion, with its parent state attached. */
  onSelect?: (suggestion: PlaceSuggestion) => void
  /** ISO 3166-1 alpha-2 — results are confined to this country. */
  country: string
  kind: "region" | "city"
  /** For a city field: the state already chosen, which narrows the list. */
  state?: string
  placeholder?: string
  autoComplete?: string
}) {
  const scope = kind === "city" ? state.toLowerCase() : ""
  const cacheKey = `${country}:${kind}:${scope}`

  const [list, setList] = useState<LoadedList | null>(
    () => listCache.get(cacheKey) ?? null
  )
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listId = useId()
  const justPicked = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const cached = listCache.get(cacheKey)
    if (cached) {
      setList(cached)
      return
    }

    let ignore = false
    setList(null)
    loadList(country, kind, state)
      .then((loaded) => {
        if (!ignore) setList(loaded)
      })
      .catch(() => undefined)

    return () => {
      ignore = true
    }
  }, [cacheKey, country, kind, state])

  useEffect(() => {
    setOpen(false)
  }, [country])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  // Filtering happens here, on every render, against an already-folded list.
  // Even the largest country in the world is twelve thousand short strings,
  // which is well under a frame.
  const suggestions = useMemo<PlaceSuggestion[]>(() => {
    if (!list) return []

    const needle = fold(value.trim())

    const pickRegion = (text: string) =>
      kind === "city" ? list.stateByCity.get(fold(text)) ?? "" : ""

    if (!needle) {
      // Just opened: show the top of the list so there is something to choose.
      return list.entries
        .slice(0, MAX_VISIBLE)
        .map((entry) => ({ text: entry.text, secondary: pickRegion(entry.text) }))
    }

    const startsWith: PlaceSuggestion[] = []
    const contains: PlaceSuggestion[] = []

    for (const entry of list.entries) {
      if (entry.folded.startsWith(needle)) {
        startsWith.push({ text: entry.text, secondary: pickRegion(entry.text) })
        if (startsWith.length >= MAX_VISIBLE) break
      } else if (
        contains.length < MAX_VISIBLE &&
        entry.folded.includes(needle)
      ) {
        contains.push({ text: entry.text, secondary: pickRegion(entry.text) })
      }
    }

    // Prefix before substring, so "lag" leads with Lagos rather than with
    // somewhere that merely has those letters in the middle.
    return [...startsWith, ...contains].slice(0, MAX_VISIBLE)
  }, [list, value, kind])

  const pick = (suggestion: PlaceSuggestion) => {
    justPicked.current = true
    onChange(suggestion.text)
    onSelect?.(suggestion)
    setOpen(false)
    setActiveIndex(-1)
  }

  const loading = list === null
  // Open with a row saying so rather than with nothing. A click that produces
  // no visible change is indistinguishable from a broken control, which is
  // what the first click looked like while the list was still arriving.
  const visible = open && (suggestions.length > 0 || loading)

  return (
    <div ref={containerRef} className="relative">
      <Input
        className="pr-10"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "off"}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(event) => {
          justPicked.current = false
          onChange(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        // Focus alone does not fire again once the field already has it, so a
        // click after Escape would otherwise never reopen the list.
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (!visible) {
            if (event.key === "ArrowDown") setOpen(true)
            return
          }

          if (event.key === "ArrowDown") {
            event.preventDefault()
            setActiveIndex((current) => (current + 1) % suggestions.length)
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActiveIndex((current) =>
              current <= 0 ? suggestions.length - 1 : current - 1
            )
          } else if (event.key === "Enter" && activeIndex >= 0) {
            // Only swallow Enter when a suggestion is highlighted, so Enter
            // still submits the form the rest of the time.
            event.preventDefault()
            pick(suggestions[activeIndex])
          } else if (event.key === "Escape") {
            setOpen(false)
          }
        }}
      />

      {/* The one thing that says "this is a dropdown". Without it the control
          reads as a plain text box and nobody thinks to click it. */}
      <FiChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted transition-transform",
          visible && "rotate-180"
        )}
      />

      {visible ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-border bg-surface py-1 shadow-lg"
        >
          {loading ? (
            <li className="px-4 py-2.5 text-sm text-muted">Loading places...</li>
          ) : null}
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.text}-${index}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "block w-full px-4 py-2.5 text-left transition",
                  index === activeIndex ? "bg-canvas" : "hover:bg-canvas"
                )}
                // pointerdown, not click: the input's blur would close the list
                // before a click ever landed.
                onPointerDown={(event) => {
                  event.preventDefault()
                  pick(suggestion)
                }}
              >
                <span className="block text-sm text-ink">{suggestion.text}</span>
                {suggestion.secondary ? (
                  <span className="block text-xs text-muted">
                    {suggestion.secondary}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
