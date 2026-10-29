import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi'
import { useModal } from 'connectkit'
import { erc20Abi, type Address } from 'viem'
import { KeyRound, Lock, ShieldCheck, Wallet, X } from 'lucide-react'
import { FAUCET_URL, TARGET_CHAIN, TARGET_CHAIN_ID, USDC } from '@/lib/deployment'
import { fmtUsdcLabel } from '@/lib/money'
import { CopyButton, Notice, Spinner } from '@/components/ui'
import {
  EMBEDDED_RDNS, createVault, deleteVault, embeddedAvailable, exportKey, hasVault, lock, setConfirmHandler, setUnlockHandler, unlock, validPin, vaultAddress,
} from './embedded'
import { askConfirm, closeDialog, openDialog, requestUnlockUi, unlockDone, useConfirm, useDialog } from './walletUi'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="display text-2xl font-bold">{title}</h2>
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-slate-100" aria-label="Close" onClick={onClose}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function useEmbeddedConnect() {
  const { connectAsync, connectors } = useConnect()
  return async () => {
    const connector = connectors.find((c) => c.id === EMBEDDED_RDNS)
    if (!connector) throw new Error('The SplitPay wallet is not available in this browser.')
    await connectAsync({ connector, chainId: TARGET_CHAIN_ID })
  }
}

function Chooser() {
  const { setOpen } = useModal()
  return (
    <Modal title="Connect a wallet" onClose={closeDialog}>
      <p className="hint mb-4">Your wallet holds your USDC. SplitPay never has your keys.</p>
      <div className="grid gap-3">
        <button type="button" className="btn-ghost justify-start" onClick={() => { closeDialog(); setOpen(true) }}>
          <Wallet className="size-5" aria-hidden="true" /> Browser wallet (MetaMask, Coinbase, others)
        </button>
        {embeddedAvailable() ? (
          <button type="button" className="btn-primary justify-start" onClick={() => openDialog({ kind: hasVault() ? 'unlock' : 'create' })}>
            <KeyRound className="size-5" aria-hidden="true" /> {hasVault() ? 'Unlock my SplitPay testnet wallet' : 'Create a SplitPay testnet wallet'}
          </button>
        ) : null}
      </div>
      {embeddedAvailable() ? <p className="hint">No extension? The SplitPay testnet wallet works in this browser. It is for test USDC only.</p> : null}
    </Modal>
  )
}

function PinForm({ mode }: { mode: 'create' | 'unlock' }) {
  const connect = useEmbeddedConnect()
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creating = mode === 'create'
  const ok = validPin(pin) && (!creating || (pin === pin2 && ack))
  return (
    <Modal title={creating ? 'Create your testnet wallet' : 'Unlock your wallet'} onClose={closeDialog}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          void (async () => {
            try {
              if (creating) await createVault(pin)
              else await unlock(pin)
              await connect()
              unlockDone()
              if (creating) openDialog({ kind: 'manage' })
              else closeDialog()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Something went wrong.')
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        {creating ? (
          <Notice tone="warn" title="Test wallet only">
            This wallet lives in this browser and is protected by your PIN. Use it only with free test USDC, never real money. If you clear your browser data without a recovery key, it is gone.
          </Notice>
        ) : (
          <p className="hint">Wallet {vaultAddress()?.slice(0, 6)}…{vaultAddress()?.slice(-4)}</p>
        )}
        <div>
          <label className="label" htmlFor="pin">{creating ? 'Choose a 6-digit PIN' : '6-digit PIN'}</label>
          <input id="pin" type="password" className="input tabular-nums tracking-widest" inputMode="numeric" autoComplete={creating ? 'new-password' : 'current-password'} maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        {creating ? (
          <>
            <div>
              <label className="label" htmlFor="pin2">Repeat the PIN</label>
              <input id="pin2" type="password" className="input tabular-nums tracking-widest" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} aria-invalid={pin2.length === 6 && pin !== pin2} />
              {pin2.length === 6 && pin !== pin2 ? <p className="error-text" role="alert">The PINs do not match.</p> : null}
            </div>
            <label className="flex min-h-[44px] items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I understand this is a test wallet for free test USDC only.</span>
            </label>
          </>
        ) : null}
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={!ok || busy}>{busy ? <Spinner /> : null} {creating ? 'Create wallet' : 'Unlock'}</button>
        {!creating ? <p className="hint">Forgot your PIN? The wallet cannot be recovered without it. You can delete it from this device and create a new one.</p> : null}
        {!creating ? <button type="button" className="btn-ghost" onClick={() => { if (confirm('Delete this wallet from this device? This cannot be undone.')) { deleteVault(); openDialog({ kind: 'create' }) } }}>Delete wallet from this device</button> : null}
      </form>
    </Modal>
  )
}

function Manage() {
  const { address, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const [pin, setPin] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data: balance } = useReadContract({
    address: USDC?.address as Address | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address && USDC), refetchInterval: 8000 },
  })
  const mine = connector?.id === EMBEDDED_RDNS && address
  if (!mine) return <Modal title="SplitPay wallet" onClose={closeDialog}><p className="hint">Connect your SplitPay testnet wallet first.</p></Modal>
  return (
    <Modal title="Your testnet wallet" onClose={closeDialog}>
      <div className="grid gap-4">
        <div className="card-inner">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>USDC balance on {TARGET_CHAIN.name}</p>
          <p className="display text-3xl font-bold tabular-nums">{balance === undefined ? '…' : fmtUsdcLabel(balance)}</p>
          <div className="mt-2 flex items-center gap-1">
            <code className="mono min-w-0 flex-1 break-all text-xs">{address}</code>
            <CopyButton text={address} label="Copy wallet address" />
          </div>
        </div>
        <Notice tone="teal" title="Add free test USDC">
          Copy your address, then request free test USDC from the{' '}
          <a className="underline" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Circle faucet</a> (choose Arc Testnet). Network fees on Arc are paid in USDC too, so keep a little extra.
        </Notice>
        <div className="card-inner grid gap-2">
          <label className="label" htmlFor="pin-export">Recovery key (enter your PIN)</label>
          <input id="pin-export" type="password" className="input tabular-nums tracking-widest" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <button type="button" className="btn-ghost btn-sm" disabled={!validPin(pin)} onClick={() => { setError(null); exportKey(pin).then(setRevealed).catch((e: Error) => setError(e.message)) }}>Show recovery key</button>
          {revealed ? <div className="flex items-center gap-1"><code className="mono min-w-0 flex-1 break-all text-xs">{revealed}</code><CopyButton text={revealed} label="Copy recovery key" /></div> : null}
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <p className="hint">Anyone with this key controls the wallet. It only holds test money.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => { lock(); disconnect(); closeDialog() }}><Lock className="size-4" aria-hidden="true" /> Lock and disconnect</button>
      </div>
    </Modal>
  )
}

function ConfirmDialog() {
  const pending = useConfirm()
  if (!pending) return null
  return (
    <Modal title={pending.req.title} onClose={() => pending.resolve(false)}>
      <div className="grid gap-3">
        <div className="flex items-start gap-2 text-sm" style={{ color: 'var(--teal-ink)' }}>
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Check this before you approve.
        </div>
        {pending.req.lines.map((l, i) => <p key={i} className="text-pretty">{l}</p>)}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost" onClick={() => pending.resolve(false)}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => pending.resolve(true)}>Approve</button>
        </div>
      </div>
    </Modal>
  )
}

/** Mounted once. Registers the wallet's prompts and renders the dialogs. */
export function WalletDialogs() {
  const d = useDialog()
  useEffect(() => {
    setConfirmHandler(askConfirm)
    setUnlockHandler(() => requestUnlockUi(hasVault()))
    return () => {
      setConfirmHandler(null)
      setUnlockHandler(null)
    }
  }, [])
  return (
    <>
      {d.kind === 'chooser' ? <Chooser /> : null}
      {d.kind === 'create' ? <PinForm mode="create" /> : null}
      {d.kind === 'unlock' ? <PinForm mode="unlock" /> : null}
      {d.kind === 'manage' ? <Manage /> : null}
      <ConfirmDialog />
    </>
  )
}
