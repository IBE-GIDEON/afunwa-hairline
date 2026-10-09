export type LegalSection = {
  heading: string
  /** One string per paragraph. */
  body: string[]
}

/**
 * Shared layout for the policy pages (terms, privacy, delivery, refunds).
 * Each page only supplies its words; the look stays identical across all four.
 */
export function LegalPage({
  title,
  lastUpdated,
  intro,
  sections
}: {
  title: string
  lastUpdated: string
  intro?: string
  sections: LegalSection[]
}) {
  return (
    // Same as PAGE_WIDTH.content; that constant lives in a client module and
    // cannot be read from this server component.
    <article className="mx-auto w-full max-w-[880px] px-4 py-8 lg:px-6 lg:py-12">
      <header className="border-b border-border/70 pb-5">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink lg:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">
          Last updated {lastUpdated}
        </p>
        {intro ? (
          <p className="mt-4 text-sm leading-6 text-muted">{intro}</p>
        ) : null}
      </header>

      <div className="mt-6 space-y-7">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-semibold text-ink">{section.heading}</h2>
            <div className="mt-2 space-y-3">
              {section.body.map((paragraph, index) => (
                <p key={index} className="text-sm leading-6 text-muted">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
