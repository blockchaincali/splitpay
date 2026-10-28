import type { ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Plus, LayoutDashboard, Wallet } from 'lucide-react'
import { navigate, useLocation } from '@/lib/router'
import { IS_MAINNET, TARGET_CHAIN } from '@/lib/deployment'
import { shortAddress } from '@/lib/money'

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0b1f3a" />
      <path d="M16 6a10 10 0 1 0 10 10H16V6Z" fill="#fff" />
      <path d="M19 6.4A10 10 0 0 1 25.6 13H19V6.4Z" fill="#12b3a4" />
    </svg>
  )
}

function WalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, address }) => (
        <button
          type="button"
          onClick={show}
          className="btn-ghost btn-sm"
          aria-label={isConnected && address ? `Wallet ${shortAddress(address)} connected. Open wallet menu` : 'Connect wallet'}
        >
          <Wallet className="size-4" aria-hidden="true" />
          {isConnecting ? 'Connecting…' : isConnected && address ? shortAddress(address) : 'Connect wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

function NavLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  const { path } = useLocation()
  const active = path === to
  return (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
      }}
      aria-current={active ? 'page' : undefined}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold"
      style={{ background: active ? 'var(--surface-muted)' : 'transparent', color: 'var(--ink)' }}
    >
      {icon}
      {children}
    </a>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100dvh-80px)] pb-6">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      {IS_MAINNET ? (
        <div className="px-4 py-2 text-center text-sm font-semibold" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }} role="note">
          Arc mainnet: payments use real USDC and cannot be reversed.
        </div>
      ) : null}
      <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(245,248,252,0.88)' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2.5">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
            className="flex min-h-[44px] items-center gap-2"
            aria-label="SplitPay home"
          >
            <Logo />
            <span className="display text-xl font-bold">SplitPay</span>
          </a>
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            <NavLink to="/new" icon={<Plus className="size-4" aria-hidden="true" />}>New group</NavLink>
            <NavLink to="/dashboard" icon={<LayoutDashboard className="size-4" aria-hidden="true" />}>My groups</NavLink>
          </nav>
          <WalletButton />
        </div>
        <nav aria-label="Main mobile" className="mx-auto flex max-w-5xl gap-1 px-3 pb-2 sm:hidden">
          <NavLink to="/new" icon={<Plus className="size-4" aria-hidden="true" />}>New group</NavLink>
          <NavLink to="/dashboard" icon={<LayoutDashboard className="size-4" aria-hidden="true" />}>My groups</NavLink>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        {children}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-sm" style={{ color: 'var(--muted)' }}>
        <p>
          Running on {TARGET_CHAIN.name}.{' '}
          {IS_MAINNET
            ? 'Payments use real USDC and cannot be reversed.'
            : 'This is a test network: the money is test USDC with no real value.'}{' '}
          Your payment goes straight to the receiving wallet. SplitPay never holds your money.
        </p>
      </footer>
    </div>
  )
}
