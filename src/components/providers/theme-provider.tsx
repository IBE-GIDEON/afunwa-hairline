"use client"

import { safeLocalStorage } from "@/lib/safe-storage"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"

import { THEME_KEY } from "@/lib/constants"

type Theme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

let themeAnimTimer: number | undefined

/**
 * The colour cross-fade is opt-in per switch: `theme-anim` turns the universal
 * transition on just long enough to cover the repaint, then takes it back off
 * so it never taxes scrolling.
 */
function applyTheme(theme: Theme, animate = false) {
  const root = document.documentElement

  if (animate) {
    root.classList.add("theme-anim")
    window.clearTimeout(themeAnimTimer)
    themeAnimTimer = window.setTimeout(
      () => root.classList.remove("theme-anim"),
      220
    )
  }

  root.classList.toggle("dark", theme === "dark")
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light")

  useEffect(() => {
    const stored = safeLocalStorage.getItem(THEME_KEY)
    const nextTheme =
      stored === "dark" || stored === "light"
        ? stored
        : "light"

    setThemeState(nextTheme)
    applyTheme(nextTheme)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme(nextTheme) {
        setThemeState(nextTheme)
        safeLocalStorage.setItem(THEME_KEY, nextTheme)
        applyTheme(nextTheme, true)
      },
      toggleTheme() {
        const nextTheme = theme === "dark" ? "light" : "dark"
        setThemeState(nextTheme)
        safeLocalStorage.setItem(THEME_KEY, nextTheme)
        applyTheme(nextTheme, true)
      }
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return value
}
