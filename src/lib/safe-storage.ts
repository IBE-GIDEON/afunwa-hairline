/**
 * localStorage and sessionStorage that never throw.
 *
 * Storage is not guaranteed in a browser. Safari with cookies blocked, a
 * WebView with storage off, or a full quota all make it throw, and a throw
 * during render used to take the whole site down. Reads come back null and
 * writes are skipped, so the app keeps working for that visit.
 */
function wrap(getStore: () => Storage | null) {
  return {
    getItem(key: string): string | null {
      try {
        return getStore()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    /** True when the value was actually saved. */
    setItem(key: string, value: string): boolean {
      try {
        const store = getStore()
        if (!store) return false
        store.setItem(key, value)
        return true
      } catch {
        return false
      }
    },
    removeItem(key: string) {
      try {
        getStore()?.removeItem(key)
      } catch {
        // Nothing to do: the value is unreadable anyway.
      }
    }
  }
}

// Reading window.localStorage itself can throw (a SecurityError when storage is
// blocked), so it is looked up inside the try, on every call.
export const safeLocalStorage = wrap(() =>
  typeof window === "undefined" ? null : window.localStorage
)

export const safeSessionStorage = wrap(() =>
  typeof window === "undefined" ? null : window.sessionStorage
)
