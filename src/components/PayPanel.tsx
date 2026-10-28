import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi, type Address, type Hex } from 'viem'
import { CheckCircle2 } from 'lucide-react'
import { parseUsdc } from '@/onchain-money'
import type { Group } from '@/lib/groupData'
import type { GroupMeta } from '@/lib/metadata'
import { equalShares } from '@/lib/splits'
import { FAUCET_URL, IS_MAINNET, TARGET_CHAIN, TARGET_CHAIN_ID, USDC } from '@/lib/deployment'
import { fmtUsdc, fmtUsdcLabel, utf8Bytes } from '@/lib/money'
import { usePayShare } from '@/lib/usePayShare'
import { useNow } from '@/lib/time'
import { Notice, Spinner, TxLink } from './ui'
import { StatusSteps } from './StatusSteps'

const MAX_NAME_BYTES = 24
const LOW_FEE_BUFFER = 50_000n // 0.05 USDC (6-decimal view), a soft warning only

interface Props {
  groupId: Hex
  group: Group
  meta: GroupMeta | null
  onPaid: () => void
}

function parseAmount(text: string): bigint | null {
  if (!text || text === '.') return null
  try {
    const v = parseUsdc(text)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

export function PayPanel({ groupId, group, meta, onPaid }: Props) {
  const { address, isConnected, chainId } = useAccount()
  const now = useNow(5000)
  const { step, error, payHash, allowHash, receipt, pay, reset } = usePayShare(groupId)
  const remaining = group.target > group.collected ? group.target - group.collected : 0n
  const full = remaining === 0n
  const closed = !full && Number(group.deadline) < now
  const isRecipient = Boolean(address && address.toLowerCase() === group.recipient.toLowerCase())

  const options = useMemo(() => {
    if (!meta) return [] as { label: string; amount: bigint }[]
    if (meta.m === 'equal') {
      const shares = equalShares(group.target, meta.n ?? 1)
      return shares.length ? [{ label: 'One share', amount: shares[0] }] : []
    }
    return (meta.s ?? []).map((s) => ({ label: s.l, amount: BigInt(s.a) }))
  }, [meta, group.target])

  const [amountText, setAmountText] = useState('')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const prefilled = useRef(false)

  // Pre-fill once with the first option (never more than what is still needed).
  useEffect(() => {
    // Custom lists never guess a person: they choose who they are.
    if (prefilled.current || meta?.m !== 'equal' || options.length === 0 || remaining === 0n) return
    prefilled.current = true
    const first = options[0].amount > remaining ? remaining : options[0].amount
    setAmountText(fmtUsdc(first).replace(/,/g, ''))
  }, [options, remaining, meta])

  const { data: balance } = useReadContract({
    address: USDC?.address as Address | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(address && USDC), refetchInterval: 8000 },
  })

  const amount = parseAmount(amountText)
  const nameBytes = utf8Bytes(name)
  const busy = step !== 'idle' && step !== 'failed' && step !== 'done'

  let problem: string | null = null
  if (amountText !== '' && amount === null) problem = 'Enter an amount above zero, with up to 6 decimals.'
  else if (amount !== null && amount > remaining) problem = `Only ${fmtUsdcLabel(remaining)} is still needed.`
  else if (amount !== null && balance !== undefined && balance < amount)
    problem = `Your wallet has ${fmtUsdcLabel(balance)}, which is not enough.`

  const lowFees = amount !== null && balance !== undefined && balance >= amount && balance - amount < LOW_FEE_BUFFER

  useEffect(() => {
    if (step === 'done') onPaid()
  }, [step, onPaid])

  if (step === 'done' && receipt) {
    return (
      <section className="card" aria-labelledby="pay-title" style={{ borderColor: 'var(--teal)' }}>
        <div role="status" className="grid gap-3">
          <CheckCircle2 className="size-10" style={{ color: 'var(--success)' }} aria-hidden="true" />
          <h2 id="pay-title" className="display text-2xl font-bold">Payment confirmed</h2>
          <p style={{ color: 'var(--ink-2)' }}>
            <strong className="tabular-nums">{fmtUsdcLabel(receipt.amount)}</strong> was sent straight to the receiving wallet
            {receipt.name ? <> as <strong>{receipt.name}</strong></> : null}. The network has confirmed it.
          </p>
          <TxLink hash={receipt.txHash}>View receipt on the explorer</TxLink>
        </div>
        <button type="button" className="btn-ghost mt-4" onClick={reset}>Make another payment</button>
      </section>
    )
  }

  const statusText =
    step === 'switching' ? `Switch your wallet to ${TARGET_CHAIN.name}`
    : step === 'allow-wallet' ? 'Approve the allowance in your wallet'
    : step === 'allow-confirming' ? 'Confirming your allowance'
    : step === 'pay-wallet' ? 'Approve the payment in your wallet'
    : step === 'pay-confirming' ? 'Waiting for the network to confirm your payment'
    : ''

  let blocked: string | null = null
  if (full) blocked = 'This group is fully paid. Thank you!'
  else if (closed) blocked = 'The deadline has passed, so this group no longer accepts payments.'
  else if (isRecipient) blocked = 'This wallet receives the money, so it cannot pay into its own group. Open the link with a different wallet.'

  return (
    <section className="card" aria-labelledby="pay-title">
      <h2 id="pay-title" className="display text-2xl font-bold">Pay your share</h2>

      {blocked ? (
        <div className="mt-3"><Notice tone={full ? 'teal' : 'warn'}>{blocked}</Notice></div>
      ) : (
        <form
          className="mt-4 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (amount !== null && !problem && nameBytes <= MAX_NAME_BYTES) void pay(amount, name.trim())
          }}
        >
          {options.length > 1 || (meta?.m === 'custom' && options.length > 0) ? (
            <fieldset>
              <legend className="label">Who are you?</legend>
              <div className="grid gap-2">
                {options.map((o, i) => (
                  <button
                    key={`${o.label}-${i}`}
                    type="button"
                    disabled={busy}
                    aria-pressed={picked === i}
                    onClick={() => {
                      setPicked(i)
                      setAmountText(fmtUsdc(o.amount > remaining ? remaining : o.amount).replace(/,/g, ''))
                      if (!name) setName(o.label)
                    }}
                    className="flex min-h-[48px] items-center justify-between rounded-2xl border px-4 text-left"
                    style={{
                      borderColor: picked === i ? 'var(--teal)' : 'var(--border)',
                      background: picked === i ? 'var(--teal-soft)' : '#fff',
                    }}
                  >
                    <span className="font-semibold">{o.label}</span>
                    <span className="tabular-nums">{fmtUsdc(o.amount)} USDC</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div>
            <label className="label" htmlFor="pay-amount">Amount (USDC)</label>
            <input
              id="pay-amount"
              className="input display text-2xl font-bold tabular-nums"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amountText}
              disabled={busy}
              aria-invalid={Boolean(problem)}
              aria-describedby="pay-amount-hint"
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (/^\d*\.?\d{0,6}$/.test(v)) {
                  setAmountText(v)
                  setPicked(null)
                }
              }}
            />
            <div id="pay-amount-hint" className="hint flex flex-wrap items-center gap-x-3 gap-y-0 tabular-nums">
              {options.length === 1 && meta?.m === 'equal' ? (
                <button type="button" className="min-h-[44px] font-semibold underline underline-offset-4" onClick={() => setAmountText(fmtUsdc(options[0].amount > remaining ? remaining : options[0].amount).replace(/,/g, ''))}>
                  Use one equal share ({fmtUsdc(options[0].amount)})
                </button>
              ) : null}
              {remaining > 0n ? <span>Still needed: {fmtUsdcLabel(remaining)}</span> : null}
              {balance !== undefined ? <span>Your balance: {fmtUsdcLabel(balance)}</span> : null}
            </div>
            {problem ? <p className="error-text" role="alert">{problem}</p> : null}
            {balance !== undefined && balance === 0n && !IS_MAINNET ? (
              <p className="hint">
                Need test USDC? Use the <strong>Get test USDC</strong> button in the Arc Studio sidebar, or the{' '}
                <a className="underline underline-offset-4" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Circle faucet</a>.
              </p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="pay-name">Nickname (optional)</label>
            <input
              id="pay-name"
              className="input"
              autoComplete="off"
              placeholder="e.g. Amina"
              value={name}
              disabled={busy}
              aria-describedby="pay-name-hint"
              onChange={(e) => {
                if (utf8Bytes(e.target.value) <= MAX_NAME_BYTES) setName(e.target.value)
              }}
            />
            <p id="pay-name-hint" className="hint">
              <span className="tabular-nums">{nameBytes}/{MAX_NAME_BYTES} bytes</span> (emoji and accents use more than one).
            </p>
            <div className="mt-2">
              <Notice tone="warn" title="Nicknames are public">
                Your nickname is written to the blockchain with your wallet address. Anyone can see it, and it can never be deleted. Leave it blank to show only your wallet address.
              </Notice>
            </div>
          </div>

          {step !== 'idle' && step !== 'failed' ? (
            <StatusSteps step={step} amountLabel={amount ? fmtUsdcLabel(amount) : 'this amount'} chainName={TARGET_CHAIN.name} />
          ) : null}
          <p className="sr-only" role="status" aria-live="polite">{statusText}</p>
          {payHash && step === 'pay-confirming' ? <TxLink hash={payHash}>Payment submitted. Track it on the explorer</TxLink> : null}
          {allowHash && step === 'allow-confirming' ? <TxLink hash={allowHash}>Allowance submitted. Track it on the explorer</TxLink> : null}

          {lowFees ? (
            <Notice tone="warn">After this payment you may not have enough USDC left for network fees (fees are paid in USDC too).</Notice>
          ) : null}
          {error ? <Notice tone={step === 'failed' ? 'danger' : 'muted'}>{error}</Notice> : null}

          {!isConnected ? (
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button type="button" className="btn-primary" onClick={show}>Connect wallet to pay</button>
              )}
            </ConnectKitButton.Custom>
          ) : (
            <button type="submit" className="btn-primary" disabled={busy || amount === null || Boolean(problem) || nameBytes > MAX_NAME_BYTES}>
              {busy ? (
                <><Spinner /> {statusText || 'Working…'}</>
              ) : amount ? (
                `Pay ${fmtUsdcLabel(amount)}`
              ) : (
                'Enter an amount'
              )}
            </button>
          )}
          {isConnected && chainId !== TARGET_CHAIN_ID ? (
            <p className="hint">Your wallet will ask to switch to {TARGET_CHAIN.name} first.</p>
          ) : null}
          <p className="hint">
            You allow exactly this amount (never unlimited). It goes directly to the receiving wallet: SplitPay never holds your money.
          </p>
        </form>
      )}
    </section>
  )
}
