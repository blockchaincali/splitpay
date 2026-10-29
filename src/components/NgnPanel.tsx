import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Hex } from 'viem'
import { Landmark } from 'lucide-react'
import { api, ApiError, type IntentView, type QuoteView } from '@/api/client'
import { useSession } from '@/account/SessionProvider'
import { fmtUsdcLabel } from '@/lib/money'
import { navigate } from '@/lib/router'
import { Chip, CopyButton, Notice, Spinner } from './ui'

const naira = (kobo: string) => (Number(BigInt(kobo)) / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })

const steps = [
  { key: 'awaiting_payment', label: 'Waiting for your bank transfer' },
  { key: 'processing', label: 'Provider is processing it' },
  { key: 'completed_sandbox', label: 'Completed in the sandbox' },
]

function Timeline({ status }: { status: string }) {
  const idx = steps.findIndex((s) => s.key === status)
  if (status === 'failed' || status === 'expired') return <Notice tone="danger">This sandbox payment {status === 'failed' ? 'failed' : 'expired'}. Nothing was charged.</Notice>
  return (
    <ol className="grid gap-1" aria-label="Sandbox payment progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex min-h-[32px] items-center gap-2 text-sm" aria-current={i === idx ? 'step' : undefined}>
          <span className="inline-block size-2.5 rounded-full" style={{ background: i <= idx ? 'var(--teal)' : 'var(--border-strong)' }} aria-hidden="true" />
          <span style={{ fontWeight: i === idx ? 600 : 400 }}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * NGN bank transfer. SANDBOX ONLY in this release: no bank is contacted, no money moves,
 * and nothing here is ever added to the group's collected total. Only a USDC payment on Arc counts.
 */
export function NgnPanel({ groupId, amount }: { groupId: Hex; amount: bigint | null }) {
  const { user } = useSession()
  const qc = useQueryClient()
  const [quote, setQuote] = useState<QuoteView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const intents = useQuery({
    queryKey: ['intents', groupId],
    queryFn: () => api.get<{ intents: IntentView[] }>(`/payments/intents?groupId=${groupId}`),
    enabled: Boolean(user),
  })
  const latest = intents.data?.intents[0] ?? null

  const getQuote = useMutation({
    mutationFn: (usdc: bigint) => api.post<{ quote: QuoteView }>('/quotes', { side: 'collect_ngn', usdcAmount: usdc.toString() }),
    onSuccess: (r) => { setQuote(r.quote); setError(null) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not get a quote.'),
  })
  const createIntent = useMutation({
    mutationFn: (q: QuoteView) => api.post<{ intent: IntentView }>('/payments/intents', { groupId, quoteId: q.id }),
    onSuccess: async () => { setQuote(null); await qc.invalidateQueries({ queryKey: ['intents', groupId] }) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not create the request.'),
  })
  const advance = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => api.post(`/payments/intents/${id}/sandbox`, { to }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intents', groupId] }),
  })

  const banner = (
    <Notice tone="warn" title="Sandbox demo: no money moves">
      NGN payments are not live yet. This shows how a bank-transfer payment will look. It does not charge you and it does not add anything to the group. Only a USDC payment on Arc counts.
    </Notice>
  )

  if (!user) {
    return (
      <div className="grid gap-3">
        {banner}
        <button type="button" className="btn-primary" onClick={() => navigate(`/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>
          Sign in to try the NGN sandbox
        </button>
      </div>
    )
  }

  const open = latest && !['completed_sandbox', 'failed', 'expired'].includes(latest.status)
  const secondsLeft = quote ? Math.max(0, quote.expiresAt - now) : 0

  return (
    <div className="grid gap-3">
      {banner}
      {quote && !open ? (
        <div className="card-inner grid gap-2" aria-live="polite">
          <div className="flex items-center justify-between">
            <h3 className="display text-lg font-bold">Your quote</h3>
            <Chip tone="warn">Sandbox demo rate</Chip>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
            <dt>Group receives</dt><dd className="text-right font-semibold">{fmtUsdcLabel(BigInt(quote.recipientReceivesUsdc))}</dd>
            <dt>Rate (demo)</dt><dd className="text-right">{naira(quote.ngnRate)} per USDC</dd>
            <dt>Provider fee</dt><dd className="text-right">{naira(quote.providerFee)}</dd>
            <dt>SplitPay fee</dt><dd className="text-right">{naira('0')}</dd>
            <dt className="font-semibold">You would pay</dt><dd className="text-right text-lg font-bold">{naira(quote.ngnAmount)}</dd>
          </dl>
          <p className="hint">{quote.rateNote} {secondsLeft > 0 ? `Quote valid for ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}.` : 'This quote expired.'}</p>
          <button type="button" className="btn-primary" disabled={secondsLeft === 0 || createIntent.isPending} onClick={() => createIntent.mutate(quote)}>
            {createIntent.isPending ? <Spinner /> : <Landmark className="size-4" aria-hidden="true" />} Create sandbox payment request
          </button>
        </div>
      ) : null}

      {latest && (open || latest.status === 'completed_sandbox') ? (
        <div className="card-inner grid gap-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <h3 className="display text-lg font-bold">Bank transfer request</h3>
            <Chip tone="warn">Sandbox</Chip>
          </div>
          {latest.instructions ? (
            <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
              <dt>Bank</dt><dd>{latest.instructions.bankName}</dd><dd />
              <dt>Account</dt><dd className="mono tabular-nums">{latest.instructions.accountNumber}</dd><dd><CopyButton text={latest.instructions.accountNumber} label="Copy sandbox account number" /></dd>
              <dt>Name</dt><dd>{latest.instructions.accountName}</dd><dd />
              <dt>Reference</dt><dd className="mono">{latest.instructions.reference}</dd><dd><CopyButton text={latest.instructions.reference} label="Copy reference" /></dd>
            </dl>
          ) : null}
          <p className="error-text" style={{ color: 'var(--danger)' }}>Do not send real money to these details. They are a demo.</p>
          <Timeline status={latest.status} />
          {latest.status === 'completed_sandbox' ? (
            <Notice tone="teal" title="This did not pay the group">
              The sandbox finished, but no USDC reached the group. The group's progress only changes when USDC arrives on Arc, which you can confirm on the group page.
            </Notice>
          ) : null}
          {open ? (
            <div className="grid gap-2 rounded-2xl border border-dashed p-3" style={{ borderColor: 'var(--border-strong)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Sandbox controls (stand-in for the provider)</p>
              <div className="flex flex-wrap gap-2">
                {latest.status === 'awaiting_payment' ? <button type="button" className="btn-ghost btn-sm" disabled={advance.isPending} onClick={() => advance.mutate({ id: latest.id, to: 'processing' })}>Simulate: transfer received</button> : null}
                {latest.status === 'processing' ? <button type="button" className="btn-ghost btn-sm" disabled={advance.isPending} onClick={() => advance.mutate({ id: latest.id, to: 'completed_sandbox' })}>Simulate: completed</button> : null}
                <button type="button" className="btn-ghost btn-sm" disabled={advance.isPending} onClick={() => advance.mutate({ id: latest.id, to: 'failed' })}>Simulate: failed</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!open && !quote ? (
        <button type="button" className="btn-primary" disabled={amount === null || amount <= 0n || getQuote.isPending} onClick={() => amount && getQuote.mutate(amount)}>
          {getQuote.isPending ? <Spinner /> : null} {amount && amount > 0n ? 'Get an NGN quote' : 'Enter an amount'}
        </button>
      ) : null}
    </div>
  )
}
