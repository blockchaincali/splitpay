import type { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'
import { Wallet } from 'lucide-react'
import { useSession } from '@/account/SessionProvider'
import { useAccountsAvailable } from '@/account/availability'
import { EMBEDDED_RDNS } from '@/wallet/embedded'
import { openConnectChooser, openDialog } from '@/wallet/walletUi'
import { WalletDialogs } from '@/wallet/WalletUI'
import { IS_MAINNET } from '@/lib/deployment'
import { shortAddress } from '@/lib/money'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

function WalletButton({ compact = false }: { compact?: boolean }) {
  const { isConnected, isConnecting, address, connector } = useAccount()
  const { setOpen } = useModal()
  const connected = isConnected && address
  const label = connected ? shortAddress(address) : isConnecting ? 'Connecting…' : 'Connect wallet'
  return (
    <button
      type="button"
      onClick={() => {
        if (!connected) openConnectChooser()
        else if (connector?.id === EMBEDDED_RDNS) openDialog({ kind: 'manage' })
        else setOpen(true)
      }}
      className={compact ? 'btn-ghost inline-flex size-11 min-h-0 items-center justify-center !rounded-xl !px-0' : 'btn-ghost btn-sm'}
      aria-label={connected ? `Wallet ${shortAddress(address)} connected. Open wallet menu` : 'Connect wallet'}
    >
      <Wallet className="size-4" aria-hidden="true" />
      {compact ? null : label}
    </button>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  const { available } = useAccountsAvailable()
  const extraItem = !available || loading ? undefined : { route: user ? '/account' : '/signin', label: user ? 'Account' : 'Sign in' }
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
      <SiteHeader wallet={<WalletButton />} walletCompact={<WalletButton compact />} extraItem={extraItem} />
      <WalletDialogs />
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6 outline-none sm:py-10">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
