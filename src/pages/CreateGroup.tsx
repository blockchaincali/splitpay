import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { useAccountsAvailable } from '@/account/availability'
import { openConnectChooser } from '@/wallet/walletUi'
import { isAddress } from 'viem'
import { CheckCircle2 } from 'lucide-react'
import { parseUsdc } from '@/onchain-money'
import { SplitEditor, type SlotDraft, type SplitMode } from '@/components/SplitEditor'
import { ShareLinkCard } from '@/components/ShareLinkCard'
import { Notice, Spinner, TxLink } from '@/components/ui'
import { MAX_DESCRIPTION, MAX_ENCODED_LENGTH, MAX_TITLE, encodeMetaText, serializeMeta, type GroupMeta } from '@/lib/metadata'
import { toSlots, validateCustom } from '@/lib/splits'
import { useCreateGroup } from '@/lib/useCreateGroup'
import { SPLITPAY_ADDRESS, TARGET_CHAIN, TARGET_CHAIN_ID, USDC } from '@/lib/deployment'
import { groupPath } from '@/lib/localGroups'
import { navigate } from '@/lib/router'
import { fmtUsdc } from '@/lib/money'
import { toLocalInput, useNow } from '@/lib/time'

const MIN_LEAD_SECONDS = 10 * 60

function parseAmt(text: string): bigint | null {
  if (!text || text === '.') return null
  try {
    const v = parseUsdc(text)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

export function CreateGroup() {
  const { address, isConnected, chainId } = useAccount()
  const { available: accountsOn } = useAccountsAvailable()
  const { step, error, txHash, result, create, reset } = useCreateGroup()
  const now = useNow(30000)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [deadlineText, setDeadlineText] = useState(() => toLocalInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)))
  const [recipient, setRecipient] = useState('')
  const [checked, setChecked] = useState(false)
  const [mode, setMode] = useState<SplitMode>('equal')
  const [people, setPeople] = useState(4)
  const [slots, setSlots] = useState<SlotDraft[]>([
    { id: 1, label: '', amount: '' },
    { id: 2, label: '', amount: '' },
  ])
  const [touched, setTouched] = useState(false)

  const target = parseAmt(goal)
  const deadlineSec = Math.floor(new Date(deadlineText).getTime() / 1000)
  const recipientOk =
    isAddress(recipient) &&
    recipient.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
    recipient.toLowerCase() !== USDC?.address.toLowerCase() &&
    recipient.toLowerCase() !== SPLITPAY_ADDRESS?.toLowerCase()
  const customValidation = useMemo(
    () => (target ? validateCustom(slots.map((s) => ({ label: s.label, amount: parseAmt(s.amount) })), target) : null),
    [slots, target],
  )

  const errors: Record<string, string> = {}
  if (title.trim().length === 0) errors.title = 'Give your group a name.'
  if (!target) errors.goal = 'Enter the total amount to collect, above zero.'
  if (!Number.isFinite(deadlineSec) || deadlineSec < now + MIN_LEAD_SECONDS)
    errors.deadline = 'Pick a deadline at least 10 minutes from now.'
  if (!recipientOk) errors.recipient = 'Enter a valid wallet address (starts with 0x, 42 characters).'
  if (mode === 'custom' && target && !customValidation?.ok) errors.split = customValidation?.message ?? 'Custom amounts must add up to your goal.'

  const meta: GroupMeta | null =
    target && recipientOk
      ? {
          v: 1,
          t: title.trim(),
          d: description.trim(),
          r: recipient.toLowerCase(),
          g: target.toString(),
          e: deadlineSec,
          m: mode,
          ...(mode === 'equal' ? { n: people } : { s: toSlots(slots.map((s) => ({ label: s.label, amount: parseAmt(s.amount) }))) }),
        }
      : null
  const metaText = meta ? serializeMeta(meta) : null
  if (metaText && encodeMetaText(metaText).length > MAX_ENCODED_LENGTH)
    errors.title = 'There is too much text for a share link. Shorten the title, description or names.'

  const busy = step === 'switching' || step === 'wallet' || step === 'confirming'
  const canSubmit = Object.keys(errors).length === 0 && checked && Boolean(metaText)

  if (!SPLITPAY_ADDRESS) return <Notice tone="danger" title="Not configured">The SplitPay contract address is missing from this build.</Notice>

  if (step === 'done' && result) {
    return (
      <div className="mx-auto grid max-w-xl gap-5">
        <section className="card" role="status" style={{ borderColor: 'var(--teal)' }}>
          <CheckCircle2 className="size-10" style={{ color: 'var(--success)' }} aria-hidden="true" />
          <h1 className="display mt-2 text-3xl font-bold">Your group is live</h1>
          <p className="mt-1" style={{ color: 'var(--ink-2)' }}>It is registered on {TARGET_CHAIN.name}. Share the link below so people can pay.</p>
          <div className="mt-2"><TxLink hash={result.txHash}>View creation receipt</TxLink></div>
        </section>
        <ShareLinkCard path={groupPath(result.groupId, result.text, result.blockNumber)} title={title.trim()} />
        {accountsOn ? (
        <div className="card-inner grid gap-2">
          <p className="font-semibold">Want invitations and reminders?</p>
          <p className="hint">Save this group to your SplitPay account to invite people by email and remind anyone who has not paid. This is optional. Payments work without an account.</p>
          <button type="button" className="btn-ghost" onClick={() => navigate(groupPath(result.groupId, result.text, result.blockNumber).replace('?', '/manage?'))}>Invite people and set reminders</button>
        </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" onClick={() => navigate(groupPath(result.groupId, result.text, result.blockNumber))}>Open group page</button>
          <button type="button" className="btn-ghost" onClick={() => navigate('/dashboard')}>Go to my groups</button>
        </div>
      </div>
    )
  }

  const show = (k: string) => (touched ? errors[k] : undefined)

  return (
    <form
      className="mx-auto grid max-w-xl gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTouched(true)
        if (!canSubmit || !metaText || !target || !recipientOk) return
        void create({ recipient: recipient, target, deadline: deadlineSec, metaText })
      }}
    >
      <div>
        <h1 className="display text-3xl font-bold sm:text-4xl">Create a payment group</h1>
        <p className="hint">Takes about a minute. You will confirm one transaction in your wallet.</p>
      </div>

      <section className="card grid gap-4">
        <div>
          <label className="label" htmlFor="title">What is it for?</label>
          <input id="title" className="input" maxLength={MAX_TITLE} placeholder="e.g. Weekend cabin" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(show('title'))} aria-describedby="title-err" />
          <p id="title-err" className="error-text" role="alert">{show('title')}</p>
        </div>
        <div>
          <label className="label" htmlFor="desc">Details (optional)</label>
          <textarea id="desc" className="input" rows={3} maxLength={MAX_DESCRIPTION} placeholder="Dates, what the money covers, who to ask…" value={description} onChange={(e) => setDescription(e.target.value)} />
          <p className="hint tabular-nums">{description.length}/{MAX_DESCRIPTION}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="goal">Total to collect (USDC)</label>
            <input id="goal" className="input tabular-nums" inputMode="decimal" placeholder="0.00" value={goal}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,6}$/.test(v)) setGoal(v) }}
              aria-invalid={Boolean(show('goal'))} aria-describedby="goal-err" />
            <p id="goal-err" className="error-text" role="alert">{show('goal')}</p>
          </div>
          <div>
            <label className="label" htmlFor="deadline">Pay by</label>
            <input id="deadline" type="datetime-local" className="input" value={deadlineText} onChange={(e) => setDeadlineText(e.target.value)} aria-invalid={Boolean(show('deadline'))} aria-describedby="deadline-err" />
            <p id="deadline-err" className="error-text" role="alert">{show('deadline')}</p>
          </div>
        </div>
      </section>

      <section className="card grid gap-4">
        <div>
          <label className="label" htmlFor="recipient">Who receives the money? (wallet address)</label>
          <input id="recipient" className="input mono text-sm" autoComplete="off" spellCheck={false} placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} aria-invalid={Boolean(show('recipient'))} aria-describedby="recipient-err" />
          <p id="recipient-err" className="error-text" role="alert">{show('recipient')}</p>
          {address ? (
            <button type="button" className="mt-1 min-h-[44px] text-sm font-semibold underline underline-offset-4" onClick={() => setRecipient(address)}>
              Use my connected wallet
            </button>
          ) : null}
        </div>
        <Notice tone="warn" title="Check this address carefully">
          Payments go directly to this wallet and cannot be reversed. It must be a wallet that can receive USDC on {TARGET_CHAIN.name}. It cannot be changed after you create the group.
        </Notice>
        <label className="flex min-h-[44px] items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>I have checked that this receiving wallet address is correct.</span>
        </label>
      </section>

      <section className="card">
        <SplitEditor target={target} mode={mode} onMode={setMode} people={people} onPeople={setPeople} slots={slots} onSlots={setSlots} validation={customValidation} />
        {show('split') && mode === 'custom' ? <p className="error-text" role="alert">{errors.split}</p> : null}
        <p className="hint">Splits are a guide shown to your group. The total can never go above {target ? `${fmtUsdc(target)} USDC` : 'your goal'}.</p>
      </section>

      {busy ? (
        <div className="card-inner flex items-center gap-3 text-sm" role="status">
          <Spinner />
          <span>
            {step === 'switching' ? `Switch your wallet to ${TARGET_CHAIN.name}.` : step === 'wallet' ? 'Confirm in your wallet…' : 'Waiting for the network to confirm…'}
            {txHash ? <> <TxLink hash={txHash}>Track it</TxLink></> : null}
          </span>
        </div>
      ) : null}
      {error ? <Notice tone={step === 'failed' ? 'danger' : 'muted'}>{error}</Notice> : null}

      {!isConnected ? (
        <button type="button" className="btn-primary" onClick={openConnectChooser}>Connect wallet to continue</button>
      ) : (
        <button type="submit" className="btn-primary" disabled={busy || (touched && !canSubmit)}>
          {busy ? <><Spinner /> Creating…</> : 'Create group'}
        </button>
      )}
      {isConnected && chainId !== TARGET_CHAIN_ID ? <p className="hint">Your wallet will ask to switch to {TARGET_CHAIN.name}.</p> : null}
      {step === 'failed' ? <button type="button" className="btn-ghost" onClick={reset}>Dismiss</button> : null}
    </form>
  )
}
