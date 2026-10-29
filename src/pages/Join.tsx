import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useSession } from '@/account/SessionProvider'
import { embeddedAvailable } from '@/wallet/embedded'
import { useLinkWallet } from '@/account/useLinkWallet'
import { fmtUsdcLabel } from '@/lib/money'
import { navigate } from '@/lib/router'
import { Notice, Spinner } from '@/components/ui'
import { openConnectChooser } from '@/wallet/walletUi'

interface InviteInfo {
  participantName: string
  expectedAmount: string
  groupTitle: string
  groupPath: string
  claimed: boolean
}

export function Join({ token }: { token: string }) {
  const { user } = useSession()
  const { link, linked, busy: linking, error: linkError, address } = useLinkWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<InviteInfo>(`/invites/${token}`), retry: false })

  if (invite.isLoading) return <div className="card text-center"><Spinner /></div>
  if (invite.isError || !invite.data) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <h1 className="display text-2xl font-bold">This invitation cannot be used</h1>
        <p className="hint">It may have expired or been replaced. Ask the organiser for a new link.</p>
      </div>
    )
  }
  const info = invite.data
  const here = `/join/${token}`

  const claim = async () => {
    if (!address) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<{ groupPath: string }>(`/invites/${token}/claim`, { walletAddress: address })
      navigate(r.groupPath)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <div className="card">
        <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--teal-ink)' }}>You are invited</p>
        <h1 className="display mt-1 text-3xl font-bold text-balance">{info.groupTitle}</h1>
        <p className="mt-2" style={{ color: 'var(--ink-2)' }}>Hi {info.participantName}, your share is <strong className="tabular-nums">{fmtUsdcLabel(BigInt(info.expectedAmount))}</strong>.</p>
      </div>
      {info.claimed && !user ? <Notice tone="warn">This invitation has already been used. Sign in with the account that used it to continue.</Notice> : null}
      <ol className="card grid gap-4">
        <li className="grid gap-2">
          <p className="font-semibold">1. Sign in {user ? <span className="text-sm font-normal" style={{ color: 'var(--success)' }}>(done)</span> : null}</p>
          {!user ? <button type="button" className="btn-primary" onClick={() => navigate(`/signin?next=${encodeURIComponent(here)}`)}>Sign in with email</button> : null}
        </li>
        <li className="grid gap-2" aria-disabled={!user}>
          <p className="font-semibold">2. Connect and link your wallet {linked ? <span className="text-sm font-normal" style={{ color: 'var(--success)' }}>(done)</span> : null}</p>
          {user && !address ? <button type="button" className="btn-primary" onClick={openConnectChooser}>Connect a wallet</button> : null}
          {user && address && !linked ? <button type="button" className="btn-primary" disabled={linking} onClick={() => void link()}>{linking ? <Spinner /> : null} Link this wallet</button> : null}
          {linkError ? <p className="error-text" role="alert">{linkError}</p> : null}
          {embeddedAvailable() ? <p className="hint">No wallet yet? Choose the SplitPay testnet wallet when connecting. It needs no extension.</p> : null}
        </li>
        <li className="grid gap-2" aria-disabled={!linked}>
          <p className="font-semibold">3. Join and pay</p>
          <button type="button" className="btn-primary" disabled={!user || !linked || busy} onClick={() => void claim()}>{busy ? <Spinner /> : null} Join and go to payment</button>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
        </li>
      </ol>
    </div>
  )
}
