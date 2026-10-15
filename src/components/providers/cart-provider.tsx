"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"

import { CART_KEY } from "@/lib/constants"
import { type OrderItem, type Product } from "@/lib/types"

interface CartState {
  vendorId: string | null
  items: OrderItem[]
}

interface CartContextValue extends CartState {
  addItem: (vendorId: string, product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  subtotal: number
  itemCount: number
}

const EMPTY_CART: CartState = { vendorId: null, items: [] }

const CartContext = createContext<CartContextValue | null>(null)

/**
 * The saved cart, or an empty one.
 *
 * Valid JSON is not the same as a valid cart: a stored null, {} or an item
 * with no price used to reach the totals below and throw on every page.
 */
function readSavedCart(): CartState {
  try {
    const raw = window.localStorage.getItem(CART_KEY)
    if (!raw) return EMPTY_CART

    const parsed = JSON.parse(raw) as Partial<CartState> | null
    if (!parsed || !Array.isArray(parsed.items)) return EMPTY_CART

    const items = parsed.items.filter(
      (item): item is OrderItem =>
        Boolean(item) &&
        typeof item.productId === "string" &&
        typeof item.name === "string" &&
        Number.isFinite(item.price) &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
    )

    return {
      vendorId: items.length && typeof parsed.vendorId === "string" ? parsed.vendorId : null,
      items
    }
  } catch {
    // Storage blocked (private browsing) or a corrupt entry: start empty
    // rather than trapping the buyer on a basket that throws on every load.
    return EMPTY_CART
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>(EMPTY_CART)
  // The saved cart cannot be read during render without breaking hydration —
  // the server has no localStorage — so it arrives one pass later. Until it
  // does, writing would persist the empty state we started with and destroy
  // the very cart we are about to load. That is not theoretical: it emptied
  // the basket on every refresh.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setState(readSavedCart())
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(state))
    } catch {
      // Full or blocked storage: the cart still works for this visit.
    }
  }, [state, loaded])

  // Built once. Every action works from the current state it is handed, so
  // none of them needs to change identity when the cart does, and a page can
  // depend on them in an effect without looping.
  const actions = useMemo(
    () => ({
      addItem(vendorId: string, product: Product) {
        setState((current) => {
          const base =
            current.vendorId && current.vendorId !== vendorId
              ? { vendorId, items: [] }
              : { ...current, vendorId }

          const existing = base.items.find((item) => item.productId === product.id)
          if (existing) {
            return {
              ...base,
              items: base.items.map((item) =>
                item.productId === product.id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item
              )
            }
          }

          return {
            ...base,
            items: [
              ...base.items,
              {
                productId: product.id,
                name: product.name,
                price: product.price,
                quantity: 1
              }
            ]
          }
        })
      },
      removeItem(productId: string) {
        setState((current) => {
          const nextItems = current.items.filter((item) => item.productId !== productId)
          return {
            vendorId: nextItems.length ? current.vendorId : null,
            items: nextItems
          }
        })
      },
      updateQuantity(productId: string, quantity: number) {
        const safeQuantity = Number.isFinite(quantity) ? Math.floor(quantity) : 0
        setState((current) => {
          const nextItems = current.items
            .map((item) =>
              item.productId === productId ? { ...item, quantity: safeQuantity } : item
            )
            .filter((item) => item.quantity > 0)

          return {
            vendorId: nextItems.length ? current.vendorId : null,
            items: nextItems
          }
        })
      },
      clearCart() {
        // Already empty: keep the same state, so nothing re-renders.
        setState((current) =>
          current.items.length === 0 && current.vendorId === null ? current : EMPTY_CART
        )
      }
    }),
    []
  )

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      ...actions,
      subtotal: state.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      itemCount: state.items.reduce((sum, item) => sum + item.quantity, 0)
    }),
    [state, actions]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) {
    throw new Error("useCart must be used within CartProvider")
  }
  return value
}
