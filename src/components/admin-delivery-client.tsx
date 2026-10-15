"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Button, Card, PAGE_WIDTH } from "@/components/ui"
import { COUNTRIES } from "@/lib/countries"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type LoadState = "loading" | "signed-out" | "forbidden" | "ready" | "error"

/** Shows each country with a naira box beside it. Blank means "to be confirmed". */
export function AdminDeliveryClient() {
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [token, setToken] = useState<string | null>(null)
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

      const data = (await response.json()) as { prices: Record<string, number> }
      const values = Object.fromEntries(
        Object.entries(data.prices).map(([code, fee]) => [code, String(fee)])
      )
      setSaved(values)
      setDraft(values)
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

  const changed = useMemo(() => {
    const codes = new Set([...Object.keys(saved), ...Object.keys(draft)])
    return [...codes].some((code) => (saved[code] ?? "") !== (draft[code] ?? "").trim())
  }, [saved, draft])

  const pricedCount = Object.values(draft).filter((value) => value.trim() !== "").length

  async function save() {
    if (!token) return
    setMessage(null)

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

    setSaving(true)
    const response = await fetch("/api/admin/delivery-prices", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ prices })
    }).catch(() => null)
    setSaving(false)

    const data = (await response?.json().catch(() => null)) as {
      prices?: Record<string, number>
      error?: string
    } | null

    if (!response?.ok || !data?.prices) {
      setMessage({ tone: "error", text: data?.error ?? "Could not save. Try again." })
      return
    }

    const values = Object.fromEntries(
      Object.entries(data.prices).map(([code, fee]) => [code, String(fee)])
    )
    setSaved(values)
    setDraft(values)
    setMessage({ tone: "ok", text: "Saved. Checkout uses these prices now." })
  }

  return (
    <div className={`${PAGE_WIDTH.content} space-y-5 px-4 py-8 lg:px-6`}>
      <div>
        <h1 className="text-2xl font-bold text-ink">Delivery prices</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Type the delivery fee in naira for each country. A country with a fee is
          charged that amount at checkout. A country left blank is confirmed with
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
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a country"
              className="min-w-[200px] flex-1 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand/40"
            />
            <p className="text-xs text-muted">
              {pricedCount} priced · {COUNTRIES.length - pricedCount} to be confirmed
            </p>
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
