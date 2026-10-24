"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Button, Card, PAGE_WIDTH } from "@/components/ui"
import { COUNTRIES } from "@/lib/countries"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type LoadState = "loading" | "signed-out" | "forbidden" | "ready" | "error"

/** One Nigerian delivery option as the admin edits it. Fee is text while typing. */
interface OptionDraft {
  id: string
  label: string
  detail: string
  fee: string
  active: boolean
}

interface ApiOption {
  id: string
  label: string
  detail: string
  fee: number
  active: boolean
  sortOrder: number
}

/**
 * Two sheets, one save:
 * - Nigeria: the delivery options the buyer picks from, with fixed fees.
 * - Outside Nigeria: a fee per country. Blank means "to be confirmed".
 */
export function AdminDeliveryClient() {
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [token, setToken] = useState<string | null>(null)

  const [options, setOptions] = useState<OptionDraft[]>([])
  const [savedOptions, setSavedOptions] = useState<OptionDraft[]>([])

  // Country code to the text in its box. Blank text means no price.
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    let ignore = false

    async function load() {
      const supabase = getSupabaseBrowserClient()
      const {
        data: { session }
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
      const accessToken = session?.access_token ?? null

      if (ignore) return
      if (!accessToken) {
        setLoadState("signed-out")
        return
      }
      setToken(accessToken)

      const response = await fetch("/api/admin/delivery-prices", {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(() => null)

      if (ignore) return
      if (response?.status === 403) {
        setLoadState("forbidden")
        return
      }
      if (!response?.ok) {
        setLoadState("error")
        return
      }

      const data = (await response.json()) as {
        prices: Record<string, number>
        options: ApiOption[]
      }

      const priceValues = Object.fromEntries(
        Object.entries(data.prices).map(([code, fee]) => [code, String(fee)])
      )
      const optionRows: OptionDraft[] = [...data.options]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((option) => ({
          id: option.id,
          label: option.label,
          detail: option.detail,
          fee: String(option.fee),
          active: option.active
        }))

      setSaved(priceValues)
      setDraft(priceValues)
      setSavedOptions(optionRows)
      setOptions(optionRows)
      setLoadState("ready")
    }

    load()
    return () => {
      ignore = true
    }
  }, [])

  const visibleCountries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return COUNTRIES
    return COUNTRIES.filter(
      (country) =>
        country.name.toLowerCase().includes(needle) ||
        country.code.toLowerCase() === needle
    )
  }, [query])

  const pricesChanged = useMemo(() => {
    const codes = new Set([...Object.keys(saved), ...Object.keys(draft)])
    return [...codes].some((code) => (saved[code] ?? "") !== (draft[code] ?? "").trim())
  }, [saved, draft])

  const optionsChanged = JSON.stringify(options) !== JSON.stringify(savedOptions)
  const changed = pricesChanged || optionsChanged

  const pricedCount = Object.values(draft).filter((value) => value.trim() !== "").length

  function updateOption(id: string, patch: Partial<OptionDraft>) {
    setOptions((current) =>
      current.map((option) => (option.id === id ? { ...option, ...patch } : option))
    )
  }

  async function save() {
    setMessage(null)

    // The login token from when the page opened expires after about an hour,
    // and saving then failed with "Sign in first", losing every edit. Ask for
    // the current one each time; Supabase refreshes it if needed.
    const supabase = getSupabaseBrowserClient()
    const {
      data: { session }
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
    const currentToken = session?.access_token ?? token
    if (!currentToken) {
      setMessage({ tone: "error", text: "Your login has expired. Sign in again, then save." })
      return
    }

    const prices: Record<string, number | null> = {}
    for (const country of COUNTRIES) {
      const text = (draft[country.code] ?? "").trim()
      if (text === "") {
        prices[country.code] = null
        continue
      }
      const fee = Number(text)
      if (!Number.isFinite(fee) || fee < 0) {
        setMessage({ tone: "error", text: `Enter a valid fee for ${country.name}.` })
        return
      }
      prices[country.code] = fee
    }

    const optionPayload: Array<{
      id: string
      label: string
      detail: string
      fee: number
      active: boolean
    }> = []
    for (const option of options) {
      if (!option.label.trim()) {
        setMessage({ tone: "error", text: "Every delivery option needs a name." })
        return
      }
      // Pickup is always free, whatever is stored. Every other option needs a
      // real fee: a blank box used to save as ₦0, which is free delivery.
      const isPickup = option.id === "pickup"
      if (!isPickup && option.fee.trim() === "") {
        setMessage({ tone: "error", text: `Enter a fee for ${option.label}, or switch it off.` })
        return
      }
      const fee = isPickup ? 0 : Number(option.fee)
      if (!Number.isFinite(fee) || fee < 0) {
        setMessage({ tone: "error", text: `Enter a valid fee for ${option.label}.` })
        return
      }
      optionPayload.push({
        id: option.id,
        label: option.label.trim(),
        detail: option.detail.trim(),
        fee,
        active: option.active
      })
    }

    setSaving(true)
    const response = await fetch("/api/admin/delivery-prices", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`
      },
      body: JSON.stringify({ prices, options: optionPayload })
    }).catch(() => null)
    setSaving(false)

    const data = (await response?.json().catch(() => null)) as {
      prices?: Record<string, number>
      options?: ApiOption[]
      error?: string
    } | null

    if (!response?.ok || !data?.prices || !data.options) {
      setMessage({ tone: "error", text: data?.error ?? "Could not save. Try again." })
      return
    }

    const priceValues = Object.fromEntries(
      Object.entries(data.prices).map(([code, fee]) => [code, String(fee)])
    )
    const optionRows: OptionDraft[] = [...data.options]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => ({
        id: option.id,
        label: option.label,
        detail: option.detail,
        fee: String(option.fee),
        active: option.active
      }))

    setSaved(priceValues)
    setDraft(priceValues)
    setSavedOptions(optionRows)
    setOptions(optionRows)
    setMessage({ tone: "ok", text: "Saved. Checkout uses these prices now." })
  }

  return (
    <div className={`${PAGE_WIDTH.content} space-y-6 px-4 py-8 lg:px-6`}>
      <div>
        <h1 className="text-2xl font-bold text-ink">Delivery prices</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Nigeria: the options buyers choose from at checkout, each with its fixed fee.
          Outside Nigeria: a fee per country. A country left blank is confirmed with
          the buyer after they order.
        </p>
      </div>

      {loadState === "loading" ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : null}

      {loadState === "signed-out" ? (
        <Card className="p-5">
          <p className="text-sm text-ink">Sign in with an admin account to edit prices.</p>
          <Link
            href="/login?next=/admin/delivery"
            className="mt-3 inline-flex text-sm font-semibold text-brand"
          >
            Sign in
          </Link>
        </Card>
      ) : null}

      {loadState === "forbidden" ? (
        <Card className="p-5">
          <p className="text-sm text-ink">This page is for admins only.</p>
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card className="p-5">
          <p className="text-sm text-amber-700">
            Prices could not be loaded. Refresh the page to try again.
          </p>
        </Card>
      ) : null}

      {loadState === "ready" ? (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Nigeria delivery options</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                Switch an option off to hide it at checkout. For pickup, the detail is
                the store address.
              </p>
            </div>
            <Card className="divide-y divide-border p-0">
              {options.map((option) => (
                <div key={option.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_1fr_9rem_auto] md:items-center">
                  <input
                    aria-label="Option name"
                    value={option.label}
                    onChange={(event) => updateOption(option.id, { label: event.target.value })}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-brand/40"
                  />
                  <input
                    aria-label={`Detail for ${option.label}`}
                    value={option.detail}
                    placeholder="Detail (address for pickup)"
                    onChange={(event) => updateOption(option.id, { detail: event.target.value })}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand/40"
                  />
                  {option.id === "pickup" ? (
                    <span className="px-3 py-2 text-sm font-semibold text-success">Free</span>
                  ) : (
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      aria-label={`Fee for ${option.label}`}
                      value={option.fee}
                      onChange={(event) => updateOption(option.id, { fee: event.target.value })}
                      className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand/40"
                    />
                  )}
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={option.active}
                      onChange={(event) => updateOption(option.id, { active: event.target.checked })}
                    />
                    On
                  </label>
                </div>
              ))}
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Outside Nigeria</h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {pricedCount} priced · {COUNTRIES.length - pricedCount} to be confirmed
                </p>
              </div>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a country"
                className="min-w-[200px] rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand/40"
              />
            </div>

            <Card className="overflow-hidden p-0">
              <div className="grid grid-cols-[1fr_9rem] gap-3 border-b border-border bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                <span>Country</span>
                <span>Fee (₦)</span>
              </div>
              <ul className="divide-y divide-border">
                {visibleCountries.map((country) => {
                  const value = draft[country.code] ?? ""
                  const isChanged = (saved[country.code] ?? "") !== value.trim()
                  return (
                    <li
                      key={country.code}
                      className="grid grid-cols-[1fr_9rem] items-center gap-3 px-4 py-2"
                    >
                      <span className="text-sm text-ink">
                        {country.name}
                        <span className="ml-2 text-xs text-muted">{country.code}</span>
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        aria-label={`Delivery fee for ${country.name}`}
                        placeholder="To be confirmed"
                        value={value}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [country.code]: event.target.value
                          }))
                        }
                        className={cn(
                          "w-full rounded-xl border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand/40",
                          isChanged ? "border-brand/50" : "border-border"
                        )}
                      />
                    </li>
                  )
                })}
              </ul>
            </Card>
          </section>

          <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-soft">
            <Button onClick={save} disabled={!changed || saving}>
              {saving ? "Saving..." : "Save prices"}
            </Button>
            {changed ? (
              <span className="text-xs text-muted">You have unsaved changes.</span>
            ) : null}
            {message ? (
              <span
                className={cn(
                  "text-xs font-medium",
                  message.tone === "ok" ? "text-success" : "text-amber-700"
                )}
              >
                {message.text}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
