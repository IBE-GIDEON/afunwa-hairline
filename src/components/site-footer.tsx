import Link from "next/link"
import { FaFacebookF, FaInstagram, FaTiktok } from "react-icons/fa6"
import { FiCheck, FiMapPin } from "react-icons/fi"

import { BrandLockup } from "@/components/brand-logo"
import {
  COMPANY_ADDRESS,
  COMPANY_NAME,
  COMPANY_STATS,
  FOOTER_LINKS,
  LEGAL_LINKS,
  SOCIAL_LINKS
} from "@/lib/site"

const SOCIAL_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  tiktok: FaTiktok
} as const

export function SiteFooter() {
  const year = new Date().getFullYear()
  // A blank handle means the profile does not exist yet — skip it rather than
  // ship an icon that lands on "page not found".
  const socials = SOCIAL_LINKS.filter((social) => social.href.trim())

  return (
    <footer className="bg-plum text-white">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-8 lg:px-6 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLockup tone="light" className="h-8" />
            <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#25D366] text-[10px] text-white">
                <FiCheck strokeWidth={3} />
              </span>
              Verified
            </span>
          </div>

          {socials.length ? (
            <div className="flex items-center gap-2">
              {socials.map((social) => {
                const Icon = SOCIAL_ICONS[social.id]
                return (
                  <a
                    key={social.id}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${COMPANY_NAME} on ${social.label}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/85 transition hover:border-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <Icon aria-hidden="true" className="text-[15px]" />
                  </a>
                )
              })}
            </div>
          ) : null}
        </div>

        {/* The reason someone scrolls this far and still buys. */}
        {/* Flex rather than a fixed grid: the strip holds two stats today and
            should not leave dead columns if that changes. */}
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-5 border-y border-white/12 py-5">
          {COMPANY_STATS.map((stat) => (
            <div key={stat.label}>
              <dt className="text-[20px] font-bold leading-none tracking-[-0.02em] text-white lg:text-[24px]">
                {stat.value}
              </dt>
              <dd className="mt-1 text-[11px] leading-4 text-white/65">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>

        <nav
          aria-label="Footer"
          className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-white/75"
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* A link, not plain text: this is a market address someone will want
            to navigate to from their phone. */}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${COMPANY_ADDRESS}, Lagos, Nigeria`
          )}`}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-start gap-2 text-[12px] leading-5 text-white/70 transition hover:text-white"
        >
          <FiMapPin aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{COMPANY_ADDRESS}</span>
        </a>

        <nav
          aria-label="Policies"
          className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-white/60"
        >
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="mt-3 text-[11px] leading-5 text-white/45">
          © {year} {COMPANY_NAME}. Wigs, closures, frontals and bundles,
          factory-direct across Nigeria.
        </p>
      </div>
    </footer>
  )
}
