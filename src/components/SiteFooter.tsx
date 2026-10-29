import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { navigate } from '@/lib/router'
import { FAUCET_URL, IS_MAINNET, SPLITPAY_ADDRESS, TARGET_CHAIN, TARGET_CHAIN_ID } from '@/lib/deployment'
import { DOCS_URL, REPO_URL, ROUTE, SECTION, SECURITY_REVIEW_URL } from '@/lib/siteLinks'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { Logo } from './Brand'
import { NavAnchor } from './SiteHeader'

const linkClass = 'inline-flex min-h-[32px] items-center rounded-lg py-0.5 text-sm hover:underline'

function External({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${linkClass} gap-1`}>
      {children}
      <ExternalLink className="size-3" aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
      <ul className="mt-2 grid gap-0.5" style={{ color: 'var(--ink-2)' }}>
        {children}
      </ul>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-12 max-w-5xl px-4 pb-8" style={{ color: 'var(--muted)' }}>
      <div className="border-t pt-8" style={{ borderColor: 'var(--border)' }}>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <a
              href={ROUTE.home}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
                e.preventDefault()
                navigate(ROUTE.home)
              }}
              className="inline-flex min-h-[44px] items-center gap-2"
              aria-label="SplitPay home"
            >
              <Logo />
              <span className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>SplitPay</span>
            </a>
            <p className="mt-2 max-w-xs text-sm">
              Collect shared costs with one link. Everyone pays their share in USDC straight to the receiving wallet, and SplitPay never holds the money.
            </p>
          </div>

          <Column title="Product">
            <li><NavAnchor to={{ route: ROUTE.create }} className={linkClass}>Create a group</NavAnchor></li>
            <li><NavAnchor to={{ route: ROUTE.groups }} className={linkClass}>My groups</NavAnchor></li>
            <li><NavAnchor to={{ section: SECTION.how }} className={linkClass}>How it works</NavAnchor></li>
            <li><NavAnchor to={{ section: SECTION.features }} className={linkClass}>Features</NavAnchor></li>
          </Column>

          <Column title={TARGET_CHAIN.name}>
            <li><NavAnchor to={{ section: SECTION.testnet }} className={linkClass}>{IS_MAINNET ? 'Network notice' : 'Testnet notice'}</NavAnchor></li>
            {IS_MAINNET ? null : <li><External href={FAUCET_URL}>Get test USDC</External></li>}
            {SPLITPAY_ADDRESS ? <li><External href={buildAddressExplorerUrl(TARGET_CHAIN_ID, SPLITPAY_ADDRESS)}>View the contract</External></li> : null}
          </Column>

          <Column title="Project">
            <li><External href={REPO_URL}>Source code</External></li>
            <li><External href={DOCS_URL}>Documentation</External></li>
            <li><External href={SECURITY_REVIEW_URL}>Security review notes</External></li>
          </Column>
        </div>

        <p className="mt-8 border-t pt-4 text-sm" style={{ borderColor: 'var(--border)' }}>
          Running on {TARGET_CHAIN.name}.{' '}
          {IS_MAINNET
            ? 'Payments use real USDC and cannot be reversed.'
            : 'This is a test network: the money is test USDC with no real value.'}{' '}
          Your payment goes straight to the receiving wallet. SplitPay never holds your money.
        </p>
      </div>
    </footer>
  )
}
