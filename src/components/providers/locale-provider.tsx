"use client"

import { safeLocalStorage } from "@/lib/safe-storage"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"

import {
  CURRENCY_KEY,
  LANGUAGE_KEY,
  RATES_CACHE_KEY
} from "@/lib/constants"
import {
  BASE_CURRENCY,
  detectCurrencyCode,
  formatMoney,
  SUPPORTED_CURRENCY_CODES,
  type Rates
} from "@/lib/currency"
import {
  getLanguageDir,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
  translate,
  type TranslationKey
} from "@/lib/i18n"

// Cached rates are shown instantly on load, then replaced by a live fetch.
// Only genuinely stale ones are withheld, so a shopper never sees a price
// built from yesterday's number.
const RATES_TTL_MS = 60 * 1000

type Money = {
  /** Price in the shopper's currency, or naira when no rate applies. */
  text: string
  /** True when the figure was converted and is therefore approximate. */
  converted: boolean
  /** Always the exact naira figure — what actually gets charged. */
  baseText: string
}

interface LocaleContextValue {
  /** BCP 47 tag used for all Intl formatting, e.g. "fr-CA". */
  locale: string
  language: string
  currency: string
  rates: Rates | null
  ready: boolean
  setLanguage: (language: string) => void
  setCurrency: (currency: string) => void
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
  money: (amountNgn: number) => Money
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

type CachedRates = { rates: Rates | null; fetchedAt: number }

function readCachedRates(): CachedRates | null {
  if (typeof window === "undefined") return null

  try {
    const raw = safeLocalStorage.getItem(RATES_CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachedRates
    if (typeof parsed?.fetchedAt !== "number") return null

    return parsed
  } catch {
    return null
  }
}

/**
 * Detects the shopper's language and currency from their browser, lets them
 * override either, and exposes the formatting helpers.
 *
 * Detection runs in an effect rather than during render: the server has no idea
 * what locale the browser will report, so committing to one during SSR would
 * guarantee a hydration mismatch. First paint is English/naira, then it
 * switches — one frame later on a warm cache.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState("en-NG")
  const [language, setLanguageState] = useState("en")
  const [currency, setCurrencyState] = useState(BASE_CURRENCY)
  const [rates, setRates] = useState<Rates | null>(
    () => readCachedRates()?.rates ?? null
  )
  const [ready, setReady] = useState(false)

  // Detect once on mount, honouring any saved preference.
  useEffect(() => {
    const browserLocale =
      typeof navigator !== "undefined"
        ? navigator.language || navigator.languages?.[0]
        : undefined

    let timeZone: string | undefined
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      timeZone = undefined
    }

    if (browserLocale) {
      setLocale(browserLocale)
    }

    const savedLanguage = safeLocalStorage.getItem(LANGUAGE_KEY)
    setLanguageState(
      savedLanguage && SUPPORTED_LANGUAGES.has(savedLanguage)
        ? savedLanguage
        : resolveLanguage(browserLocale)
    )

    const savedCurrency = safeLocalStorage.getItem(CURRENCY_KEY)
    setCurrencyState(
      savedCurrency && SUPPORTED_CURRENCY_CODES.has(savedCurrency)
        ? savedCurrency
        : detectCurrencyCode(browserLocale, timeZone)
    )

    setReady(true)
  }, [])

  // Keep <html lang/dir> honest — screen readers and RTL depend on it.
  useEffect(() => {
    if (typeof document === "undefined") return

    document.documentElement.lang = language
    document.documentElement.dir = getLanguageDir(language)
  }, [language])

  // Rates: cached in localStorage for 6h, refreshed in the background.
  useEffect(() => {
    if (!ready || currency === BASE_CURRENCY) return

    const cached = readCachedRates()
    if (cached?.rates && Date.now() - cached.fetchedAt < RATES_TTL_MS) {
      setRates(cached.rates)
      return
    }

    let cancelled = false

    // no-store: always ask our route for the current rate. The route itself is
    // cached for 60s, so this is one upstream call a minute, not one per view.
    fetch("/api/rates", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { rates?: Rates | null } | null) => {
        if (cancelled || !payload) return

        const nextRates = payload.rates ?? null
        setRates(nextRates)
        safeLocalStorage.setItem(
          RATES_CACHE_KEY,
          JSON.stringify({ rates: nextRates, fetchedAt: Date.now() })
        )
      })
      .catch(() => {
        // Offline or upstream down: prices stay in naira, which is correct.
      })

    return () => {
      cancelled = true
    }
  }, [currency, ready])

  const setLanguage = useCallback((next: string) => {
    if (!SUPPORTED_LANGUAGES.has(next)) return
    setLanguageState(next)
    safeLocalStorage.setItem(LANGUAGE_KEY, next)
  }, [])

  const setCurrency = useCallback((next: string) => {
    if (!SUPPORTED_CURRENCY_CODES.has(next)) return
    setCurrencyState(next)
    safeLocalStorage.setItem(CURRENCY_KEY, next)
  }, [])

  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) =>
      translate(language, key, values),
    [language]
  )

  const money = useCallback(
    (amountNgn: number): Money => {
      const formatted = formatMoney({ amountNgn, currency, rates, locale })

      return {
        text: formatted.text,
        converted: formatted.converted,
        baseText: formatMoney({
          amountNgn,
          currency: BASE_CURRENCY,
          rates: null,
          locale
        }).text
      }
    },
    [currency, locale, rates]
  )

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      language,
      currency,
      rates,
      ready,
      setLanguage,
      setCurrency,
      t,
      money
    }),
    [
      currency,
      language,
      locale,
      money,
      rates,
      ready,
      setCurrency,
      setLanguage,
      t
    ]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const value = useContext(LocaleContext)
  if (!value) {
    throw new Error("useLocale must be used within LocaleProvider")
  }
  return value
}
