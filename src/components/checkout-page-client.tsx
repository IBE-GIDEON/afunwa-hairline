"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import toast from "react-hot-toast"
import { FiCheck, FiChevronRight, FiMapPin, FiTruck } from "react-icons/fi"

import { useAuth } from "@/components/providers/auth-provider"
import { useCart } from "@/components/providers/cart-provider"
import { useLocale } from "@/components/providers/locale-provider"
import { PlaceAutocomplete } from "@/components/place-autocomplete"
import { Button, Card, Input, PAGE_WIDTH } from "@/components/ui"
import { PAYMENT_METHOD_META } from "@/lib/constants"
import { PAYMENT_METHODS } from "@/lib/payment-methods"
import { amountToFreeDelivery } from "@/lib/delivery"
import {
  DEFAULT_SHIPPING_METHOD,
  isMethodAvailableFor,
  preferredShippingMethodFor,
  resolveShippingFee,
  shippingMethodsFor,
  type ShippingMethod
} from "@/lib/shipping"
import {
  EMPTY_CHECKOUT_ADDRESS,
  addressSummary,
  getFullName,
  normalizeAddressPhone,
  composeDeliveryAddress,
  loadSavedAddress,
  persistAddress,
  validateAddress,
  type CheckoutAddress
} from "@/lib/checkout-address"
import {
  loadBuyerDeliveryAddress,
  loadVendorDetail,
  placeOrder,
  saveBuyerDeliveryAddress,
  saveUserProfile,
  startCardCheckout
} from "@/lib/marketplace"
import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "@/lib/countries"
import { queueOfflineOrder } from "@/lib/offline-orders"
import { type PaymentMethod, type VendorDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

type Step = 1 | 2 | 3

export function CheckoutPageClient() {
  const router = useRouter()
  const { profile, refreshProfile } = useAuth()
  const { money } = useLocale()
  const { vendorId, items, itemCount, subtotal, clearCart } = useCart()

  const [vendorData, setVendorData] = useState<VendorDetail | null>(null)
  const [address, setAddress] = useState<CheckoutAddress>(EMPTY_CHECKOUT_ADDRESS)
  const [savedAddress, setSavedAddress] = useState<CheckoutAddress | null>(null)
  const [step, setStep] = useState<Step>(1)
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0])
  const [shippingMethod, setShippingMethod] =
    useState<ShippingMethod>(DEFAULT_SHIPPING_METHOD)
  // A courier's own price for this parcel, once we know where it is going.
  // Null means we are still on the seller's flat rate.
  const [carrierQuote, setCarrierQuote] = useState<{
    method: ShippingMethod
    fee: number
    serviceName: string | null
  } | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // A returning buyer should land on delivery, not retype an address they have
  // already given us. Their profile seeds the blank form on a first visit.
  useEffect(() => {
    const stored = loadSavedAddress()
    if (stored) {
      setAddress(stored)
      setSavedAddress(stored)
      setStep(2)
    } else if (profile) {
      // Nothing on this device — but the account may remember it from another.
      loadBuyerDeliveryAddress(profile.id)
        .then((remote) => {
          if (!remote || typeof remote !== "object") return
          const merged = { ...EMPTY_CHECKOUT_ADDRESS, ...(remote as CheckoutAddress) }
          if (validateAddress(merged) !== null) return
          persistAddress(merged)
          setAddress(merged)
          setSavedAddress(merged)
          setStep(2)
        })
        .catch(() => undefined)

      const [firstName = "", ...rest] = (profile.fullName ?? "").trim().split(/\s+/)
      setAddress((current) => ({
        ...current,
        firstName: current.firstName || firstName,
        lastName: current.lastName || rest.join(" "),
        phone: current.phone || (profile.phone ?? "")
      }))
    }
    setHydrated(true)
  }, [profile])

  useEffect(() => {
    if (!vendorId) return
    loadVendorDetail(vendorId).then(setVendorData)
  }, [vendorId])

  const productMap = useMemo(
    () =>
      new Map(
        (vendorData?.products ?? []).map((product) => [product.id, product] as const)
      ),
    [vendorData?.products]
  )

  // Same rule as the cart: the price on a line is whatever the product costs
  // now, not what it cost when it was added.
  const liveSubtotal = useMemo(() => {
    if (productMap.size === 0) return subtotal
    return items.reduce((total, item) => {
      const product = productMap.get(item.productId)
      return total + (product?.price ?? item.price) * item.quantity
    }, 0)
  }, [items, productMap, subtotal])

  const deliveryTerms = {
    fee: vendorData?.vendor.deliveryFee,
    freeOver: vendorData?.vendor.freeDeliveryOver,
    note: vendorData?.vendor.deliveryNote
  }
  const availableMethods = shippingMethodsFor(savedAddress?.country)

  const shippingRates = vendorData?.vendor.shippingRates as
    | Record<ShippingMethod, number>
    | undefined
  // resolveShippingFee is the same function priceCart runs on the server, so
  // the price on the button is the price charged.
  const flatShippingFee = resolveShippingFee(
    shippingMethod,
    liveSubtotal,
    deliveryTerms,
    shippingRates
  )
  const deliveryFee =
    carrierQuote?.method === shippingMethod ? carrierQuote.fee : flatShippingFee
  const selectedLiveCourier =
    shippingMethod !== "pickup" && shippingMethod !== "local"
  const selectedShippingPending = selectedLiveCourier && quoting
  const selectedShippingUnavailable =
    selectedLiveCourier && !quoting && !carrierQuote && deliveryFee <= 0
  const missingForFreeShipping = amountToFreeDelivery(liveSubtotal, deliveryTerms)
  const orderTotal = Math.round((liveSubtotal + deliveryFee) * 100) / 100

  // Changing country can take the chosen method off the list: local is for
  // Nigeria, courier is for outside Nigeria. Leaving the old one selected
  // would price and charge the wrong route.
  useEffect(() => {
    if (isMethodAvailableFor(shippingMethod, savedAddress?.country)) return
    setShippingMethod(preferredShippingMethodFor(savedAddress?.country))
  }, [savedAddress?.country, shippingMethod])

  // Ask the server for the courier's own price once we know the destination.
  // Only for couriers: pickup and local are the seller's own arrangement.
  useEffect(() => {
    const asksLiveRate =
      shippingMethod !== "pickup" && shippingMethod !== "local"
    if (!asksLiveRate || !savedAddress || items.length === 0) {
      setCarrierQuote(null)
      return
    }

    let ignore = false
    setQuoting(true)

    fetch("/api/shipping/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        shippingMethod,
        destination: {
          countryCode: savedAddress.country,
          city: savedAddress.city,
          region: savedAddress.region,
          addressLine: savedAddress.address,
          name: getFullName(savedAddress) || profile?.fullName,
          email: profile?.email,
          phone: savedAddress.phone || profile?.phone
        }
      })
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { fee?: number; source?: string; serviceName?: string } | null) => {
        if (ignore) return
        // Only a real carrier answer replaces the flat rate. "flat" coming
        // back means the courier could not price it, and the seller's own
        // rate already covers that case.
        if (data?.source === "carrier" && Number.isFinite(data.fee)) {
          setCarrierQuote({
            method: shippingMethod,
            fee: Number(data.fee),
            serviceName: data.serviceName ?? null
          })
        } else {
          setCarrierQuote(null)
        }
      })
      .catch(() => {
        if (!ignore) setCarrierQuote(null)
      })
      .finally(() => {
        if (!ignore) setQuoting(false)
      })

    return () => {
      ignore = true
    }
  }, [
    shippingMethod,
    savedAddress,
    items,
    profile?.email,
    profile?.fullName,
    profile?.phone
  ])

  const vendorTransferReady = Boolean(
    vendorData?.vendor.bankName &&
      vendorData?.vendor.accountName &&
      vendorData?.vendor.accountNumber
  )

  const canConfirm =
    Boolean(savedAddress) &&
    deliveryConfirmed &&
    !selectedShippingPending &&
    !selectedShippingUnavailable &&
    !submitting

  if (hydrated && (!vendorId || itemCount === 0)) {
    return (
      <div className={`${PAGE_WIDTH.content} px-4 py-16 text-center lg:px-6`}>
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-ink">
          Your cart is empty
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
          Add something you like and it will show up here, ready to check out.
        </p>
        <Link
          href="/search"
          className="mt-6 inline-flex rounded-full bg-chrome px-5 py-3 text-sm font-semibold text-white"
        >
          Start shopping
        </Link>
      </div>
    )
  }

  const saveAddressStep = () => {
    const problem = validateAddress(address)
    if (problem) {
      toast.error(problem)
      return
    }

    const normalized: CheckoutAddress = {
      ...address,
      phone: normalizeAddressPhone(address.phone, address.country),
      additionalPhone: address.additionalPhone.trim()
        ? normalizeAddressPhone(address.additionalPhone, address.country)
        : ""
    }

    persistAddress(normalized)
    // Onto the account too, so the next device already knows it. Best effort:
    // the local copy and the order itself both carry it regardless.
    if (profile) void saveBuyerDeliveryAddress(profile.id, normalized)
    setAddress(normalized)
    setSavedAddress(normalized)
    setStep(2)
  }

  const confirmOrder = async () => {
    if (!savedAddress) {
      toast.error("Save your delivery address first.")
      setStep(1)
      return
    }

    if (!profile) {
      toast.error("Sign in to place your order.")
      router.push("/login?next=/checkout")
      return
    }

    // The seller reaches the buyer on this number, so keep the profile in step
    // with whatever they just typed into the address form.
    if (savedAddress.phone && profile.phone?.trim() !== savedAddress.phone) {
      try {
        await saveUserProfile({ ...profile, phone: savedAddress.phone })
        await refreshProfile(profile.id)
      } catch {
        // Not worth blocking the order: the number is in the address line too.
      }
    }

    const payload = {
      buyerId: profile.id,
      vendorId: vendorId as string,
      items,
      // The server re-prices this and ignores the figure; send the live one so
      // an order sitting in the offline queue holds something honest.
      totalAmount: orderTotal,
      deliveryAddress: composeDeliveryAddress(savedAddress),
      shippingMethod,
      // In parts as well as in prose, so the carrier can be asked again when
      // the order is written rather than trusting the figure on screen.
      shippingDestination: {
        countryCode: savedAddress.country,
        city: savedAddress.city,
        region: savedAddress.region,
        addressLine: savedAddress.address,
        name: getFullName(savedAddress) || profile.fullName,
        email: profile.email,
        phone: savedAddress.phone || profile.phone
      },
      paymentMethod
    }

    const isHostedCheckout =
      paymentMethod === "flutterwave" || paymentMethod === "paypal"

    if (!navigator.onLine && isHostedCheckout) {
      toast.error("Card checkout needs a connection. Pick bank transfer to queue this order.")
      return
    }

    if (!navigator.onLine) {
      await queueOfflineOrder(payload)
      clearCart()
      toast.success("Order queued. We'll sync it once you're back online.")
      router.push("/orders")
      return
    }

    setSubmitting(true)
    try {
      if (isHostedCheckout) {
        const { checkoutUrl } = await startCardCheckout(payload, paymentMethod)
        // Cart deliberately left alone: an abandoned card page should not cost
        // the buyer their basket.
        window.location.href = checkoutUrl
        return
      }

      const response = await placeOrder(payload)
      clearCart()
      router.push(`/order-confirmation/${response.orderId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not place order.")
    } finally {
      setSubmitting(false)
    }
  }

  const summary = savedAddress ? addressSummary(savedAddress) : null

  return (
    <div className={`${PAGE_WIDTH.wide} px-4 pb-16 pt-4 lg:px-6`}>
      <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink lg:text-[32px]">
        Checkout
      </h1>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <StepCard
            index={1}
            title="Customer address"
            note="For faster and smoother delivery, use a phone number that is active on WhatsApp"
            done={Boolean(savedAddress) && step !== 1}
            onChange={savedAddress && step !== 1 ? () => setStep(1) : undefined}
          >
            {step === 1 ? (
              <AddressForm
                address={address}
                onChange={setAddress}
                onSave={saveAddressStep}
                onCancel={savedAddress ? () => setStep(2) : undefined}
              />
            ) : summary ? (
              <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
                <FiMapPin className="mt-0.5 shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{summary.name}</p>
                  <p className="mt-1 break-words text-sm leading-6 text-muted">
                    {summary.detail}
                  </p>
                </div>
              </div>
            ) : null}
          </StepCard>

          <StepCard
            index={2}
            title="Shipping method"
            done={deliveryConfirmed && step !== 2}
            locked={!savedAddress}
            onChange={
              deliveryConfirmed && step !== 2 ? () => setStep(2) : undefined
            }
          >
            {step === 2 && savedAddress ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  {availableMethods.map((method) => {
                    const flat = resolveShippingFee(
                      method.id,
                      liveSubtotal,
                      deliveryTerms,
                      shippingRates
                    )
                    const quoted =
                      carrierQuote?.method === method.id ? carrierQuote.fee : null
                    const fee = quoted ?? flat
                    const liveCourier =
                      method.id === "courier" || Boolean(method.brand)
                    const waitingForRate =
                      quoting && shippingMethod === method.id && liveCourier
                    const priceUnavailable =
                      liveCourier && !waitingForRate && fee <= 0 && quoted === null
                    const chosen = shippingMethod === method.id
                    // Local shipping is the one that reads out a country,
                    // because it is one price for the whole of it.
                    const label =
                      method.id === "local" ? `${method.label} — Nigeria` : method.label

                    return (
                      <button
                        key={method.id}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => {
                          setShippingMethod(method.id)
                          setDeliveryConfirmed(false)
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
                          chosen
                            ? "border-brand/40 bg-brand/5"
                            : "border-border bg-surface hover:border-brand/40"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 rounded-full",
                            chosen ? "border-4 border-brand" : "border border-border"
                          )}
                        />

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">
                              {label}
                            </span>
                            <span
                              className={cn(
                                "text-sm font-semibold",
                                priceUnavailable
                                  ? "text-amber-700"
                                  : fee > 0
                                    ? "text-brand"
                                    : "text-success"
                              )}
                            >
                              {waitingForRate
                                ? "Checking rate..."
                                : priceUnavailable
                                  ? "Price unavailable"
                                  : fee > 0
                                    ? money(fee).text
                                    : "Free"}
                            </span>
                            {quoted !== null ? (
                              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                                Live rate
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-muted">
                            {method.id === "local" && deliveryTerms.note
                              ? deliveryTerms.note
                              : quoted !== null && carrierQuote?.serviceName
                                ? carrierQuote.serviceName
                                : method.helper}
                          </span>
                          {method.id === "local" && missingForFreeShipping > 0 ? (
                            <span className="mt-1 block text-xs leading-5 text-success">
                              Add {money(missingForFreeShipping).text} more for free
                              shipping.
                            </span>
                          ) : null}
                          {priceUnavailable ? (
                            <span className="mt-1 block text-xs leading-5 text-muted">
                              Courier price is not ready yet. Try again shortly.
                            </span>
                          ) : null}
                        </span>

                        <CarrierMark method={method} />
                      </button>
                    )
                  })}
                </div>

                <div className="flex justify-end">
                  <Button
                    disabled={
                      selectedShippingPending || selectedShippingUnavailable
                    }
                    onClick={() => {
                      setDeliveryConfirmed(true)
                      setStep(3)
                    }}
                  >
                    Confirm shipping method
                  </Button>
                </div>
              </div>
            ) : null}
          </StepCard>

          <StepCard
            index={3}
            title="Payment method"
            locked={!deliveryConfirmed}
            done={false}
          >
            {step === 3 ? (
              <div className="space-y-3">
                {PAYMENT_METHODS.map((method) => {
                  const meta = PAYMENT_METHOD_META[method]
                  const needsSellerDetails =
                    method === "vendor_transfer" && !vendorTransferReady

                  return (
                    <button
                      key={method}
                      type="button"
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        paymentMethod === method
                          ? "border-brand/40 bg-brand/5"
                          : "border-border bg-surface hover:border-brand/40"
                      )}
                      onClick={() => setPaymentMethod(method)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">{meta.label}</p>
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                            paymentMethod === method
                              ? "border-4 border-brand"
                              : "border border-border"
                          )}
                        />
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        {needsSellerDetails
                          ? "Place the order now. The seller can share payment details after confirming."
                          : meta.helper}
                      </p>
                    </button>
                  )
                })}

                {paymentMethod === "vendor_transfer" && vendorTransferReady ? (
                  <div className="rounded-2xl border border-border bg-canvas p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Send payment to
                    </p>
                    <dl className="mt-3 space-y-2 text-sm">
                      {(
                        [
                          ["Bank", vendorData?.vendor.bankName],
                          ["Account name", vendorData?.vendor.accountName],
                          ["Account number", vendorData?.vendor.accountNumber]
                        ] as const
                      ).map(([label, value]) => (
                        <div
                          key={label}
                          className="flex items-center justify-between gap-3"
                        >
                          <dt className="text-muted">{label}</dt>
                          <dd
                            className={
                              label === "Account number"
                                ? "select-all font-mono text-base font-bold tracking-wide text-ink"
                                : "font-semibold text-ink"
                            }
                          >
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {vendorData?.vendor.paymentNote ? (
                      <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted">
                        {vendorData.vendor.paymentNote}
                      </p>
                    ) : null}
                    {/* baseText: a naira account at a Nigerian bank takes the
                        naira figure, whatever currency the shopper browses in. */}
                    <p className="mt-3 text-xs leading-5 text-muted">
                      Transfer{" "}
                      <span className="font-semibold text-ink">
                        {money(orderTotal).baseText}
                      </span>
                      , then confirm the order so the seller can match it.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </StepCard>
        </div>

        <OrderSummary
          itemCount={itemCount}
          itemsTotal={liveSubtotal}
          deliveryFee={deliveryFee}
          shippingPending={selectedShippingPending}
          shippingUnavailable={selectedShippingUnavailable}
          total={orderTotal}
          money={money}
          canConfirm={canConfirm}
          submitting={submitting}
          onConfirm={confirmOrder}
        />
      </div>
    </div>
  )
}

function StepCard({
  index,
  title,
  note,
  done = false,
  locked = false,
  onChange,
  children
}: {
  index: number
  title: string
  note?: string
  done?: boolean
  locked?: boolean
  onChange?: () => void
  children: ReactNode
}) {
  return (
    <Card className={cn("overflow-hidden p-0", locked && "opacity-60")}>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
            done
              ? "bg-success text-white"
              : locked
                ? "border border-border text-muted"
                : "bg-chrome text-white"
          )}
        >
          {done ? <FiCheck aria-hidden="true" /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-[0.04em] text-ink">
            {index}. {title}
          </p>
          {note ? (
            <p className="mt-1 text-xs leading-5 text-muted">{note}</p>
          ) : null}
        </div>
        {onChange ? (
          <button
            type="button"
            onClick={onChange}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand"
          >
            Change
            <FiChevronRight aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {children ? <div className="border-t border-border p-4">{children}</div> : null}
    </Card>
  )
}

/** Matches Input, which is a styled <input> and cannot dress a <select>. */
const selectClass =
  "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/10"

function Field({
  label,
  children
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

function AddressForm({
  address,
  onChange,
  onSave,
  onCancel
}: {
  address: CheckoutAddress
  onChange: (next: CheckoutAddress) => void
  onSave: () => void
  onCancel?: () => void
}) {
  const set = <K extends keyof CheckoutAddress>(key: K, value: CheckoutAddress[K]) =>
    onChange({ ...address, [key]: value })

  const isNigeria = address.country === DEFAULT_COUNTRY_CODE

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country">
          <select
            className={selectClass}
            value={address.country}
            onChange={(event) =>
              // The state list below only applies to Nigeria, so a country
              // change clears whatever state was picked for the old one.
              onChange({ ...address, country: event.target.value, region: "" })
            }
          >
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={isNigeria ? "State" : "State or province"}>
          <PlaceAutocomplete
            value={address.region}
            // A city belongs to a state, so changing the state clears a city
            // that no longer sits in it.
            onChange={(next) =>
              onChange({
                ...address,
                region: next,
                city: next === address.region ? address.city : ""
              })
            }
            country={address.country}
            kind="region"
            placeholder={isNigeria ? "Start typing a state" : "State or province"}
          />
        </Field>

        <Field label="City">
          <PlaceAutocomplete
            value={address.city}
            onChange={(next) => set("city", next)}
            country={address.country}
            kind="city"
            // Narrows the list to the state above. Without a state chosen it
            // offers the whole country, so nobody is stuck behind that field.
            state={address.region}
            placeholder={
              address.region
                ? `Start typing a city in ${address.region}`
                : "Start typing a city"
            }
            // Where a city shares its state's name — Lagos, Kano, Enugu — the
            // suggestion carries it, so picking the city fills the field above.
            onSelect={(suggestion) => {
              if (!suggestion.secondary) return
              onChange({
                ...address,
                city: suggestion.text,
                region: suggestion.secondary
              })
            }}
          />
        </Field>

        <Field label="First name">
          <Input
            value={address.firstName}
            autoComplete="given-name"
            onChange={(event) => set("firstName", event.target.value)}
          />
        </Field>

        <Field label="Last name">
          <Input
            value={address.lastName}
            autoComplete="family-name"
            onChange={(event) => set("lastName", event.target.value)}
          />
        </Field>

        {/* The +234 chip is Nigeria's alone. Showing it beside a Ghanaian
            number would say we are about to dial the wrong country. */}
        <Field label="Phone number">
          <div className="flex items-center gap-2">
            {isNigeria ? (
              <span className="shrink-0 rounded-2xl border border-border bg-canvas px-3 py-3 text-sm text-muted">
                +234
              </span>
            ) : null}
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={isNigeria ? "803 000 0000" : "+233 20 000 0000"}
              value={address.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
          </div>
        </Field>

        <Field label="Additional phone number (optional)">
          <div className="flex items-center gap-2">
            {isNigeria ? (
              <span className="shrink-0 rounded-2xl border border-border bg-canvas px-3 py-3 text-sm text-muted">
                +234
              </span>
            ) : null}
            <Input
              type="tel"
              inputMode="tel"
              placeholder={isNigeria ? "803 000 0000" : "+233 20 000 0000"}
              value={address.additionalPhone}
              onChange={(event) => set("additionalPhone", event.target.value)}
            />
          </div>
        </Field>
      </div>

      <Field label="Delivery address">
        <Input
          value={address.address}
          autoComplete="street-address"
          placeholder="House number and street"
          onChange={(event) => set("address", event.target.value)}
        />
      </Field>

      <Field label="Landmark (optional)">
        <Input
          value={address.landmark}
          placeholder="A place nearby the rider will know"
          onChange={(event) => set("landmark", event.target.value)}
        />
      </Field>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit">Save address</Button>
      </div>
    </form>
  )
}

function OrderSummary({
  itemCount,
  itemsTotal,
  deliveryFee,
  shippingPending,
  shippingUnavailable,
  total,
  money,
  canConfirm,
  submitting,
  onConfirm
}: {
  itemCount: number
  itemsTotal: number
  deliveryFee: number
  shippingPending: boolean
  shippingUnavailable: boolean
  total: number
  money: (amount: number) => { text: string }
  canConfirm: boolean
  submitting: boolean
  onConfirm: () => void
}) {
  return (
    <Card className="p-0 lg:sticky lg:top-[88px]">
      <p className="border-b border-border px-4 py-3 text-sm font-bold text-ink">
        Order summary
      </p>

      <div className="space-y-2.5 px-4 py-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">Item&apos;s total ({itemCount})</span>
          <span className="font-semibold text-ink">{money(itemsTotal).text}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">Shipping fee</span>
          <span
            className={cn(
              "font-semibold",
              shippingUnavailable
                ? "text-amber-700"
                : deliveryFee > 0
                  ? "text-ink"
                  : "text-success"
            )}
          >
            {shippingPending
              ? "Checking"
              : shippingUnavailable
                ? "Unavailable"
                : deliveryFee > 0
                  ? money(deliveryFee).text
                  : "Free"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="font-bold text-ink">Total</span>
          <span className="text-lg font-bold text-brand">{money(total).text}</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <Button
          className="w-full"
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          {submitting ? "Placing order..." : "Confirm order"}
        </Button>
        {!canConfirm && !submitting ? (
          <p className="mt-2 text-center text-xs text-muted">
            Complete the steps above to continue
          </p>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * The courier's badge on its own colours.
 *
 * A real logo file at /public/carriers/<id>.svg is used when one is there, and
 * a coloured wordmark stands in when it is not. Drawn this way on purpose:
 * shipping a carrier's artwork we have no licence for is their decision to
 * grant, not ours to assume, and the wordmark is honest in the meantime.
 */
function CarrierMark({
  method
}: {
  method: ReturnType<typeof shippingMethodsFor>[number]
}) {
  const [logoFailed, setLogoFailed] = useState(false)

  if (!method.brand) {
    return <FiTruck aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
  }

  if (!logoFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/carriers/${method.id}.svg`}
        alt=""
        aria-hidden="true"
        className="mt-0.5 h-6 w-auto max-w-[72px] shrink-0 object-contain"
        onError={() => setLogoFailed(true)}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className="mt-0.5 shrink-0 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide"
      style={{
        backgroundColor: method.brand.background,
        color: method.brand.foreground
      }}
    >
      {method.label.toUpperCase()}
    </span>
  )
}
