import type { ReactNode } from 'react'
import { useAccountsAvailable } from '@/account/availability'
import { navigate } from '@/lib/router'

/**
 * Wraps pages that only make sense with accounts (sign-in, account, people and reminders, invitations).
 * Without accounts, a direct visit gets a calm explanation and a way back, never an error.
 */
export function AccountsGate({ children }: { children: ReactNode }) {
  const { available, checking } = useAccountsAvailable()
  if (checking) return <div className="card mx-auto max-w-md" aria-busy="true"><p className="hint">One moment…</p></div>
  if (available) return <>{children}</>
  return (
    <div className="card mx-auto grid max-w-md gap-3 text-center">
      <h1 className="display text-2xl font-bold">Your wallet is all you need</h1>
      <p style={{ color: 'var(--ink-2)' }}>
        SplitPay works with your wallet alone: create groups, pay your share and see your groups. This page is not available here.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn-primary" onClick={() => navigate('/dashboard')}>My groups</button>
        <button type="button" className="btn-ghost" onClick={() => navigate('/')}>Home</button>
      </div>
    </div>
  )
}
