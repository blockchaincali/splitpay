import { useEffect, type ReactNode } from 'react'
import { Activity, ArrowRight, ArrowRightLeft, CalendarClock, ExternalLink, FlaskConical, Link2, ShieldCheck, Split } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { NavAnchor } from '@/components/SiteHeader'
import { ProductPreview } from '@/landing/ProductPreview'
import { FAUCET_URL, IS_MAINNET, SPLITPAY_ADDRESS, TARGET_CHAIN, TARGET_CHAIN_ID } from '@/lib/deployment'
import { ROUTE, SECTION, scrollToSection, type SectionId } from '@/lib/siteLinks'
import { buildAddressExplorerUrl } from '@/onchain-facts'

const FEATURES = [
  {
    icon: Link2,
    title: 'One link, shared your way',
    text: 'The group’s details travel in the link and are checked against a fingerprint stored on the network. Copy it, send it on WhatsApp, or show a QR code.',
  },
  {
    icon: Split,
    title: 'Equal or custom splits',
    text: 'Split evenly, with the last cents shared out so the total is exact, or set each person’s amount. Custom shares must add up to the total.',
  },
  {
    icon: ArrowRightLeft,
    title: 'Straight to the receiver',
    text: 'Each payment goes from the payer’s wallet directly to the receiving wallet. SplitPay’s contract holds none of the money.',
  },
  {
    icon: ShieldCheck,
    title: 'Exact-amount approval',
    text: 'You allow only the amount you are paying, never an open-ended spend, and SplitPay never asks for your private keys.',
  },
  {
    icon: Activity,
    title: 'Live progress from the network',
    text: 'Progress, what is still to pay and every payment are read from the network. A payment shows as done only after it is confirmed.',
  },
  {
    icon: CalendarClock,
    title: 'Goal and deadline built in',
    text: 'The contract refuses payments after the deadline or above the goal, so a group cannot be overpaid.',
  },
] as const

const TRUST = [
  { icon: ArrowRightLeft, text: 'Money goes straight to the receiver' },
  { icon: ShieldCheck, text: 'You approve only the exact amount' },
  { icon: Activity, text: 'Done means confirmed on the network' },
] as const

const SECTION_IDS: readonly string[] = Object.values(SECTION)

function Section({ id, title, children, eyebrow }: { id: SectionId; title: string; eyebrow: string; children: ReactNode }) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="scroll-mt-24 outline-none">
      <p className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--teal-ink)' }}>{eyebrow}</p>
      <h2 id={`${id}-title`} className="display mt-1 max-w-2xl text-balance text-3xl font-bold sm:text-4xl">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function ExampleCard() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute inset-0 -z-10 rounded-[2rem] opacity-70 blur-2xl" style={{ background: 'radial-gradient(60% 60% at 70% 30%, var(--teal-soft), transparent)' }} />
      <div className="card">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>Example</p>
          <span className="chip" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>Open</span>
        </div>
        <p className="display mt-1 text-2xl font-bold">Weekend cabin</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full" style={{ background: '#e3eaf3' }}>
          <div className="h-full w-2/3 rounded-full" style={{ background: 'var(--teal)' }} />
        </div>
        <div className="mt-2 flex justify-between text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>
          <span>66% collected</span>
          <span>4 of 6 paid</span>
        </div>
        <ul className="mt-4 grid gap-2 text-sm">
          {['Alex', 'Sam', 'Jo'].map((n) => (
            <li key={n} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
              <span className="font-semibold">{n}</span>
              <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>paid</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>Illustrative example, not a real group.</p>
      </div>
    </div>
  )
}

export function Home() {
  // A link like /#features opened directly (or reloaded) should land on that section once the page has rendered.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (SECTION_IDS.includes(id)) scrollToSection(id as SectionId, { updateUrl: false })
  }, [])

  const explorerUrl = SPLITPAY_ADDRESS ? buildAddressExplorerUrl(TARGET_CHAIN_ID, SPLITPAY_ADDRESS) : null
  /** Link to the deployed contract on this network's explorer (explorer.arc.io on mainnet). Shown on both networks. */
  const contractLink = explorerUrl ? (
    <a className="btn-ghost btn-sm" href={explorerUrl} target="_blank" rel="noopener noreferrer">
      View the contract <ExternalLink className="size-4" aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : null

  return (
    <div className="grid gap-16 sm:gap-20">
      <section aria-labelledby="hero-title" className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="chip mb-4" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>
            <TokenUSDC variant="branded" size={16} /> USDC on {TARGET_CHAIN.name}
          </p>
          <h1 id="hero-title" className="display text-balance text-4xl font-bold sm:text-6xl">Split shared costs without chasing anyone.</h1>
          <p className="mt-4 max-w-prose text-pretty text-lg" style={{ color: 'var(--ink-2)' }}>
            SplitPay turns a shared expense into one link: everyone pays their share in USDC straight to the person who is owed, and you watch the group fill up live.
          </p>
          <div className="mt-7 grid gap-3 sm:max-w-md sm:grid-cols-2">
            <NavAnchor to={{ route: ROUTE.create }} className="btn-primary">
              Create a group <ArrowRight className="size-4" aria-hidden="true" />
            </NavAnchor>
            <NavAnchor to={{ section: SECTION.how }} className="btn-ghost">
              See how it works
            </NavAnchor>
          </div>
          {!IS_MAINNET ? (
            <p className="mt-4 flex items-start gap-2 text-sm" style={{ color: 'var(--muted)' }}>
              <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>You are on a test network. Everything here uses test USDC with no real value.</span>
            </p>
          ) : null}
        </div>
        <ExampleCard />
      </section>

      <ul aria-label="What SplitPay does with your money" className="grid gap-3 sm:grid-cols-3">
        {TRUST.map((t) => (
          <li key={t.text} className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>
              <t.icon className="size-5" aria-hidden="true" />
            </span>
            {t.text}
          </li>
        ))}
      </ul>

      <Section id={SECTION.how} eyebrow="How SplitPay works" title="From one expense to a filled-up group in five steps">
        <ProductPreview />
      </Section>

      <Section id={SECTION.features} eyebrow="Features" title="Built around how groups actually pay">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="card">
              <span className="grid size-10 place-items-center rounded-xl" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>
                <f.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="display mt-3 text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>{f.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id={SECTION.testnet} eyebrow={IS_MAINNET ? 'Network' : 'Testnet'} title={IS_MAINNET ? `You are on ${TARGET_CHAIN.name}` : `SplitPay runs on ${TARGET_CHAIN.name}`}>
        <div className="card" style={{ background: IS_MAINNET ? 'var(--warn-soft)' : 'var(--surface)' }}>
          {IS_MAINNET ? (
            <>
              <p style={{ color: 'var(--warn)' }}>
                Payments use real USDC and cannot be reversed. Check the amount and the receiving wallet before you pay.
              </p>
              {contractLink ? <div className="mt-5 flex flex-wrap gap-3">{contractLink}</div> : null}
            </>
          ) : (
            <>
              <p className="max-w-prose" style={{ color: 'var(--ink-2)' }}>
                {TARGET_CHAIN.name} is a public test network. The USDC here is <strong>test USDC with no real-world value</strong>: it cannot be exchanged for money, and nothing you do in SplitPay moves real funds. Network fees on Arc are paid in USDC too, so you need a little test USDC to try it.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a className="btn-ghost btn-sm" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">
                  Get test USDC <ExternalLink className="size-4" aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                {contractLink}
              </div>
            </>
          )}
        </div>
      </Section>

      <section aria-labelledby="cta-title" className="rounded-3xl px-6 py-10 text-center text-white sm:px-10" style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-2) 100%)' }}>
        <h2 id="cta-title" className="display text-balance text-3xl font-bold sm:text-4xl">Ready to split the next cost?</h2>
        <p className="mx-auto mt-2 max-w-md text-pretty" style={{ color: 'rgba(255,255,255,0.8)' }}>
          Set up a group in a minute, send the link, and watch the payments arrive.
        </p>
        <div className="mx-auto mt-6 max-w-xs">
          <NavAnchor to={{ route: ROUTE.create }} className="btn !bg-white !text-[var(--navy)] hover:!bg-[var(--teal-soft)]">
            Create a group <ArrowRight className="size-4" aria-hidden="true" />
          </NavAnchor>
        </div>
      </section>
    </div>
  )
}
