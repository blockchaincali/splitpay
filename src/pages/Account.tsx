import { useQuery } from '@tanstack/react-query'
import { Link2, LogOut } from 'lucide-react'
import { api, type Integration } from '@/api/client'
import { useSession } from '@/account/SessionProvider'
import { useLinkWallet } from '@/account/useLinkWallet'
import { navigate } from '@/lib/router'
import { shortAddress } from '@/lib/money'
import { Chip, Notice, Spinner } from '@/components/ui'
import { StatusBadge } from '@/components/StatusBadge'
import { openConnectChooser } from '@/wallet/walletUi'

export function Account() {
  const { user, wallets, loading, signOut, offline } = useSession()
  const { link, linked, busy, error, address } = useLinkWallet()
  const status = useQuery({ queryKey: ['integrations'], queryFn: () => api.get<{ integrations: Integration[] }>('/integrations/status') })

  if (loading) return <div className="card text-center"><Spinner /></div>
  if (!user) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <h1 className="display text-2xl font-bold">{offline ? 'Accounts are unavailable right now' : 'Sign in to see your account'}</h1>
        {offline ? <p className="hint">The payment features still work without an account.</p> : null}
        <button type="button" className="btn-primary mt-4" onClick={() => navigate('/signin?next=/account')}>Sign in</button>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <h1 className="display text-3xl font-bold">Your account</h1>
      <section className="card grid gap-3" aria-labelledby="profile">
        <h2 id="profile" className="display text-xl font-bold">Profile</h2>
        <p>{user.email}</p>
        <button type="button" className="btn-ghost btn-sm w-fit" onClick={() => void signOut().then(() => navigate('/'))}><LogOut className="size-4" aria-hidden="true" /> Sign out</button>
      </section>

      <section className="card grid gap-3" aria-labelledby="wallets">
        <h2 id="wallets" className="display text-xl font-bold">Wallets</h2>
        <p className="hint">Linking proves a wallet is yours so your groups and invitations follow you. You sign a message once. It costs nothing and sends no transaction.</p>
        {wallets.length === 0 ? <p className="hint">No wallets linked yet.</p> : (
          <ul className="grid gap-2">
            {wallets.map((w) => (
              <li key={w.address} className="card-inner flex items-center justify-between gap-2">
                <span className="mono text-sm">{shortAddress(w.address)}</span>
                <Chip tone="success">{w.kind === 'embedded' ? 'SplitPay testnet wallet' : 'Linked'}</Chip>
              </li>
            ))}
          </ul>
        )}
        {!address ? (
          <button type="button" className="btn-primary" onClick={openConnectChooser}>Connect a wallet</button>
        ) : linked ? (
          <Notice tone="teal">The connected wallet ({shortAddress(address)}) is linked to your account.</Notice>
        ) : (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void link()}>
            {busy ? <Spinner /> : <Link2 className="size-4" aria-hidden="true" />} Link {shortAddress(address)} to my account
          </button>
        )}
        {error ? <p className="error-text" role="alert">{error}</p> : null}
      </section>

      <section className="card grid gap-3" aria-labelledby="status">
        <h2 id="status" className="display text-xl font-bold">What is live and what is a demo</h2>
        <ul className="grid gap-2">
          {(status.data?.integrations ?? []).map((i) => (
            <li key={i.id} className="card-inner">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{i.name}</span>
                <StatusBadge status={i.status} />
              </div>
              <p className="hint">{i.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
