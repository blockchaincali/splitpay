import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { Receipt } from 'lucide-react'
import type { Contribution } from '@/lib/groupData'
import { TARGET_CHAIN_ID } from '@/lib/deployment'
import { sameAddress } from '@/lib/address'
import { fmtUsdc, shortAddress } from '@/lib/money'
import { formatTimestamp } from '@/lib/time'
import { TxLink } from './ui'

function BlockTime({ block }: { block: bigint }) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID })
  const { data } = useQuery({
    queryKey: ['block-time', TARGET_CHAIN_ID, block.toString()],
    queryFn: async () => (await client!.getBlock({ blockNumber: block })).timestamp,
    enabled: Boolean(client),
    staleTime: Infinity,
  })
  return <>{data ? formatTimestamp(data) : `Block ${block.toString()}`}</>
}

export function ReceiptList({
  items,
  me,
  syncing,
  error,
}: {
  items: Contribution[]
  me?: string
  syncing: boolean
  error: string | null
}) {
  const sorted = [...items].sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1))
  return (
    <section className="card" aria-labelledby="receipts-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="receipts-title" className="display text-xl font-bold">Payments</h2>
      </div>
      <p className="hint">Every payment below is confirmed on the network. Nicknames are public.</p>
      {error ? <p className="error-text" role="status">{error}</p> : null}

      {sorted.length === 0 && !syncing ? (
        <div className="card-inner mt-3 flex items-center gap-3 text-sm" style={{ color: 'var(--ink-2)' }}>
          <Receipt className="size-5 shrink-0" aria-hidden="true" />
          No payments yet. The first confirmed payment will show up here.
        </div>
      ) : sorted.length === 0 ? null : (
        <ul className="mt-3 grid gap-2">
          {sorted.map((c) => {
            const mine = sameAddress(me, c.contributor)
            return (
              <li key={`${c.txHash}:${c.logIndex}`} className="card-inner" style={mine ? { outline: '2px solid var(--teal)' } : undefined}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-semibold">
                    {c.name || shortAddress(c.contributor)}
                    {mine ? <span className="ml-2 text-xs font-semibold" style={{ color: 'var(--teal-ink)' }}>You</span> : null}
                  </p>
                  <p className="display shrink-0 text-lg font-bold tabular-nums">{fmtUsdc(c.amount)} <span className="text-sm font-medium">USDC</span></p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm" style={{ color: 'var(--muted)' }}>
                  <span>
                    {c.name ? `${shortAddress(c.contributor)} · ` : ''}
                    <BlockTime block={c.blockNumber} />
                  </span>
                  <TxLink hash={c.txHash} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {syncing ? (
        <p className="hint mt-3" role="status" data-testid="history-loading">Loading payment history...</p>
      ) : null}
    </section>
  )
}
