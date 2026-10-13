"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { FiBell, FiCheck, FiEdit3, FiKey, FiLogOut, FiMail, FiShoppingBag, FiUser } from "react-icons/fi"

import { AuthPanel } from "@/components/auth-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Avatar,
  Badge,
  Button,
  Card,
  Input,
  PAGE_WIDTH,
  SectionHeading
} from "@/components/ui"
import { canOpenStore } from "@/lib/feature-flags"
import { uploadImage } from "@/lib/image"
import { loadStoreAnalytics, saveUserProfile } from "@/lib/marketplace"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { type StoreAnalytics } from "@/lib/types"
import { cn } from "@/lib/utils"
import { VIEW_MODE_KEY } from "@/lib/constants"
type PushStatus =
  | "checking"
  | "unsupported"
  | "install-required"
  | "ready"
  | "enabling"
  | "enabled"
  | "blocked"
  | "unconfigured"

export function ProfilePageClient() {
  const {
    loading,
    profile,
    vendorProfile,
    signOut,
    updatePassword,
    updateEmailAddress,
    upgradeAccountType,
    refreshProfile
  } = useAuth()
  const [savingProfile, setSavingProfile] = useState(false)
  const [editName, setEditName] = useState("")
  const [photoPreview, setPhotoPreview] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("+234")
  const [newPassword, setNewPassword] = useState("")
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("")
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null)
  const [viewMode, setViewMode] = useState<"buyer" | "seller">("buyer")
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking")

  useEffect(() => {
    if (!profile) return
    setEditName(profile.fullName)
    setPhotoPreview(profile.profilePhotoUrl ?? "")
    setEmailAddress(profile.email)
    setPhoneNumber(profile.phone)
  }, [profile])

  useEffect(() => {
    if (!profile || !vendorProfile) {
      setAnalytics(null)
      return
    }

    loadStoreAnalytics(profile.id).then(setAnalytics)
  }, [profile, vendorProfile])

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_KEY)
    if (saved === "buyer" || saved === "seller") {
      setViewMode(saved)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function syncPushStatus() {
      if (!profile) {
        setPushStatus("checking")
        return
      }

      const status = await getPushStatus({ syncExistingSubscription: true })
      if (!cancelled) {
        setPushStatus(status)
      }
    }

    syncPushStatus().catch(() => {
      if (!cancelled) {
        setPushStatus("ready")
      }
    })

    return () => {
      cancelled = true
    }
  }, [profile])

  const requestPushAccess = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushStatus("unsupported")
      toast.error("Push notifications are not supported on this device.")
      return
    }

    if (isIos() && !isStandaloneWebApp()) {
      setPushStatus("install-required")
      toast.error(
        "On iPhone, install Afunwa to your Home Screen and open it from the app icon before enabling notifications."
      )
      return
    }

    setPushStatus("enabling")

    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "blocked" : "ready")
        toast.error("Notification permission was not granted.")
        return
      }

      const publicKeyResponse = await fetch("/api/push/public-key")
      const { publicKey } = (await publicKeyResponse.json()) as {
        publicKey?: string
      }

      if (!publicKey) {
        setPushStatus("unconfigured")
        toast.error("Push notifications are not configured yet.")
        return
      }

      const registration = await navigator.serviceWorker.ready
      const existingSubscription = await registration.pushManager.getSubscription()
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }))

      await syncPushSubscription(subscription)

      setPushStatus("enabled")
      toast.success(
        existingSubscription
          ? "Push notifications re-synced."
          : "Push notifications enabled."
      )
    } catch (error) {
      const status = await getPushStatus()
      setPushStatus(status)
      toast.error(
        error instanceof Error ? error.message : "Could not enable push notifications."
      )
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted">Loading profile...</div>
  }

  if (!profile) {
    return (
      <div className={cn(PAGE_WIDTH.form, "space-y-4 p-4 pb-safe-nav lg:py-8")}>
        <SectionHeading title="Profile" action={<ThemeToggle />} />
        <AuthPanel showLinks={false} />
      </div>
    )
  }

  const showSellerSection =
    viewMode === "seller" &&
    (profile.accountType === "seller" || profile.accountType === "both")
  const pushButtonDisabled = !["ready", "enabled"].includes(pushStatus)
  // Everyone else is a buyer for now — no store card, no seller upgrade.
  const canSell = canOpenStore({
    email: profile.email,
    hasStore: Boolean(vendorProfile)
  })

  return (
    <div className={cn(PAGE_WIDTH.form, "space-y-4 p-4 pb-safe-nav lg:py-8")}>
      <SectionHeading title="Profile" />

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <label className="relative cursor-pointer">
            <Avatar
              src={photoPreview}
              alt={profile.fullName}
              className="h-20 w-20"
            />
            <input
              className="hidden"
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                if (!profile) return

                setSavingProfile(true)
                try {
                  const url = await uploadImage(file, "profile-photos")
                  setPhotoPreview(url)
                  await saveUserProfile({
                    ...profile,
                    profilePhotoUrl: url
                  })
                  await refreshProfile(profile.id)
                  toast.success("Profile photo updated.")
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Could not upload photo."
                  )
                } finally {
                  setSavingProfile(false)
                }
              }}
            />
          </label>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-brand/5 text-brand">
                {profile.accountType.toUpperCase()}
              </Badge>
              <Badge>{viewMode === "buyer" ? "Buyer View" : "Seller View"}</Badge>
            </div>
            <div className="mt-3 space-y-3">
              <Input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
              <Input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
              />
              <Button
                variant="secondary"
                className="w-full"
                disabled={savingProfile}
                onClick={async () => {
                  setSavingProfile(true)
                  try {
                    await saveUserProfile({
                      ...profile,
                      fullName: editName,
                      phone: phoneNumber,
                      profilePhotoUrl: photoPreview
                    })
                    await refreshProfile(profile.id)
                    toast.success("Profile updated.")
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not update profile."
                    )
                  } finally {
                    setSavingProfile(false)
                  }
                }}
              >
                <FiEdit3 />
                Edit profile
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Appearance</p>
            <p className="mt-1 text-sm text-muted">
              Switch between light and dark mode anytime.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <FiMail className="mt-1 text-brand" />
          <div>
            <p className="text-sm font-semibold text-ink">Email address</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              This is your sign-in and forgot-password email.
            </p>
          </div>
        </div>
        <Input
          type="email"
          placeholder="Email address"
          value={emailAddress}
          onChange={(event) => setEmailAddress(event.target.value)}
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            try {
              await updateEmailAddress(emailAddress)
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Could not update email."
              )
            }
          }}
        >
          Save email
        </Button>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <FiKey className="mt-1 text-brand" />
          <div>
            <p className="text-sm font-semibold text-ink">Password</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Change your password anytime from inside the app.
            </p>
          </div>
        </div>
        <Input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={newPasswordConfirm}
          onChange={(event) => setNewPasswordConfirm(event.target.value)}
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            if (newPassword.length < 6) {
              toast.error("Use at least 6 characters for your password.")
              return
            }

            if (newPassword !== newPasswordConfirm) {
              toast.error("Passwords do not match.")
              return
            }

            try {
              await updatePassword(newPassword)
              setNewPassword("")
              setNewPasswordConfirm("")
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Could not update password."
              )
            }
          }}
        >
          Update password
        </Button>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Notification settings</p>
            <p className="mt-1 text-sm text-muted">
              {getPushStatusDescription(pushStatus)}
            </p>
          </div>
          {pushStatus === "enabled" ? (
            <Badge className="bg-emerald-100 text-success">
              <FiCheck className="mr-1" />
              Enabled
            </Badge>
          ) : (
            <FiBell className="text-brand" />
          )}
        </div>
        <Button
          variant={pushStatus === "enabled" ? "primary" : "outline"}
          disabled={pushButtonDisabled}
          aria-disabled={pushButtonDisabled}
          className={
            pushStatus === "enabled"
              ? "mt-4 w-full bg-success text-white hover:brightness-95"
              : "mt-4 w-full"
          }
          onClick={requestPushAccess}
        >
          {getPushButtonLabel(pushStatus)}
        </Button>
      </Card>

      {canSell && profile.accountType === "buyer" && !vendorProfile ? (
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <FiShoppingBag className="text-brand" />
            <div>
              <p className="text-base font-semibold text-ink">Open My Store</p>
              <p className="mt-1 text-sm text-muted">
                Become a seller anytime without creating a new account.
              </p>
            </div>
          </div>
          <Link
            href="/onboarding/seller"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white"
          >
            Start seller onboarding
          </Link>
        </Card>
      ) : null}

      {canSell &&
      (profile.accountType === "seller" || profile.accountType === "both") ? (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-ink">Switch view</p>
                <p className="mt-1 text-sm text-muted">
                  Use one account for both shopping and selling.
                </p>
              </div>

              <div className="grid w-full grid-cols-2 gap-1 rounded-full bg-canvas p-1">
                {(["buyer", "seller"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-3 text-center text-sm font-semibold transition ${
                      viewMode === mode ? "bg-chrome text-white" : "text-muted"
                    }`}
                    onClick={() => {
                      setViewMode(mode)
                      window.localStorage.setItem(VIEW_MODE_KEY, mode)
                    }}
                  >
                    {mode === "buyer" ? "Buyer" : "Seller"}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {showSellerSection ? (
            <>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-ink">
                      {vendorProfile?.storeName ?? "My Store"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {vendorProfile?.bio ?? "Complete your store profile."}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {vendorProfile?.bankName &&
                      vendorProfile?.accountName &&
                      vendorProfile?.accountNumber
                        ? "Direct vendor payment is ready for buyers."
                        : "Add bank details in Edit Store if you want buyers to pay you directly."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{vendorProfile?.category ?? "Category"}</Badge>
                      <Badge>{vendorProfile?.city ?? "City"}</Badge>
                    </div>
                  </div>
                  <FiUser className="text-brand" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Link
                    href="/onboarding/seller"
                    className="inline-flex items-center justify-center rounded-full bg-chrome px-4 py-3 text-sm font-semibold text-white"
                  >
                    Edit Store
                  </Link>
                  <Link
                    href="/seller/products"
                    className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink"
                  >
                    Manage Products
                  </Link>
                </div>
              </Card>

              <Card className="grid grid-cols-3 gap-3 p-5 text-center">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Orders
                  </p>
                  <p className="mt-2 text-xl font-bold text-ink">
                    {analytics?.totalOrders ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Revenue
                  </p>
                  <p className="mt-2 text-xl font-bold text-ink">
                    {new Intl.NumberFormat("en-NG", {
                      style: "currency",
                      currency: "NGN",
                      maximumFractionDigits: 0
                    }).format(analytics?.totalRevenue ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    Rating
                  </p>
                  <p className="mt-2 text-xl font-bold text-ink">
                    {(analytics?.averageRating ?? 0).toFixed(1)}
                  </p>
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-5">
              <p className="text-base font-semibold text-ink">
                Buyer view is active
              </p>
              <p className="mt-2 text-sm text-muted">
                Switch back to seller view anytime to manage your store, products,
                and store orders.
              </p>
            </Card>
          )}
        </div>
      ) : null}

      {canSell && profile.accountType === "buyer" ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            await upgradeAccountType("both")
            toast.success("Your account can now shop and sell.")
          }}
        >
          Upgrade to Buyer + Seller
        </Button>
      ) : null}

      <Button variant="secondary" className="w-full" onClick={signOut}>
        <FiLogOut />
        Logout
      </Button>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

async function syncPushSubscription(subscription: PushSubscription) {
  const supabaseClient = getSupabaseBrowserClient()
  const { data: { session } } = supabaseClient
    ? await supabaseClient.auth.getSession()
    : { data: { session: null } }
  const token = session?.access_token

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ subscription })
  })

  if (!response.ok) {
    throw new Error("Could not save your notification subscription.")
  }
}

function isIos() {
  if (typeof navigator === "undefined") {
    return false
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandaloneWebApp() {
  if (typeof window === "undefined") {
    return false
  }

  return window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
}

async function getPushStatus(
  options: { syncExistingSubscription?: boolean } = {}
): Promise<PushStatus> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported"
  }

  if (isIos() && !isStandaloneWebApp()) {
    return "install-required"
  }

  if (Notification.permission === "denied") {
    return "blocked"
  }

  try {
    const response = await fetch("/api/push/public-key")
    const { publicKey } = (await response.json()) as { publicKey?: string }

    if (!publicKey) {
      return "unconfigured"
    }

    if (Notification.permission !== "granted") {
      return "ready"
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription && options.syncExistingSubscription) {
      try {
        await syncPushSubscription(subscription)
      } catch (error) {
        console.warn("[push] Could not re-sync browser subscription", error)
        return "ready"
      }
    }

    return subscription ? "enabled" : "ready"
  } catch (error) {
    return Notification.permission === "granted" ? "ready" : "ready"
  }
}

function getPushButtonLabel(status: PushStatus) {
  switch (status) {
    case "checking":
      return "Checking notification status..."
    case "enabled":
      return "Notifications enabled - tap to re-sync"
    case "enabling":
      return "Enabling notifications..."
    case "blocked":
      return "Notifications blocked"
    case "unsupported":
      return "Notifications not supported"
    case "install-required":
      return "Install app to enable notifications"
    case "unconfigured":
      return "Notifications not configured"
    default:
      return "Enable push notifications"
  }
}

function getPushStatusDescription(status: PushStatus) {
  switch (status) {
    case "enabled":
      return "This device will receive order alerts, confirmations, and delivery updates."
    case "enabling":
      return "We are connecting this device for order alerts now."
    case "blocked":
      return "Notifications are blocked for Afunwa on this device. Allow them in your browser or iPhone settings."
    case "unsupported":
      return "This device or browser does not support web push notifications."
    case "install-required":
      return "On iPhone, add Afunwa to your Home Screen and open it from the app icon before enabling notifications."
    case "unconfigured":
      return "Push notifications are not configured on the server yet."
    case "checking":
      return "Checking this device for notification support."
    default:
      return "Get order alerts, confirmations, and delivery updates."
  }
}
