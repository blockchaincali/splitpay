import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { openConnectChooser } from '@/wallet/walletUi'
import { Plus } from 'lucide-react'
import { splitPayAbi } from '@/lib/splitpayAbi'
import { SPLITPAY_ADDRESS, TARGET_CHAIN_ID } from '@/lib/deployment'
import { syncMyGroups } from '@/lib/groupData'
import { normAddress } from '@/lib/address'
import { getKnownIds, getStoredGroups, groupPath, type StoredGroupRef } from '@/lib/localGroups'
import { decodeMeta, encodeMetaText } from '@/lib/metadata'
import { fmtUsdc, percent } from '@/lib/money'
import { navigate } from '@/lib/router'
import { timeLeft, useNow } from '@/lib/time'
import { Chip, CopyButton, Notice, Spinner } from '@/components/ui'
import { buildShareLink } from '@/lib/share'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useSession } from '@/account/SessionProvider'
import { useAccountsAvailable } from '@/account/availability'

export function Dashboard() {
  const { address, isConnected } = useAccount()
  // Groups already saved on this device (including one created a moment ago) are listed at once, with no scan.
  const [tick, setTick] = useState(0)
  // `tick` changes whenever the background scan saves something new, so the list re-reads local storage.
  const refs = useMemo(() => (tick >= 0 && address ? getKnownIds(address) : []), [address, tick])
  const now = useNow(30000)

  // Look for other groups of this wallet in the background: several block windows at a time, the cursor and any groups found
  // are saved after every chunk, failed windows are retried on another endpoint, and the whole thing retries by itself.
  const sync = useQuery({
    queryKey: ['my-groups', TARGET_CHAIN_ID, normAddress(address)],
    enabled: Boolean(address && SPLITPAY_ADDRESS),
    retry: 8,
    retryDelay: (n) => Math.min(15_000, 800 * 2 ** n),
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (q.state.status === 'error' ? 20_000 : false),
    queryFn: async () => {
      await syncMyGroups(address!, () => setTick((t) => t + 1))
      return true
    },
  })
  const syncing = sync.isFetching || sync.failureCount > 0
  const nothingLoaded = refs.length === 0 && sync.isError

  const reads = useReadContracts({
    contracts: refs.map((r) => ({
      address: SPLITPAY_ADDRESS!,
      abi: splitPayAbi,
      functionName: 'getGroup' as const,
      args: [r.groupId] as const,
      chainId: TARGET_CHAIN_ID,
    })),
    query: { enabled: refs.length > 0 && Boolean(SPLITPAY_ADDRESS), refetchInterval: 8000 },
  })

  const stored = useMemo(() => getStoredGroups(), [])
  const rows = useMemo(
    () =>
      refs.map((r, i) => {
        const res = reads.data?.[i]
        const data = res?.status === 'success' ? res.result : null
        const st = stored[r.groupId.toLowerCase()]
        const decoded = st ? decodeMeta(encodeMetaText(st.text)) : null
        return {
          ref: r,
          title: decoded?.meta.t ?? 'Untitled group',
          text: st?.text,
          target: data?.[2] ?? null,
          deadline: data ? BigInt(data[3]) : null,
          collected: data?.[4] ?? null,
        }
      }),
    [refs, reads.data, stored],
  )

  const totalCollected = rows.reduce((s, r) => s + (r.collected ?? 0n), 0n)
  const openCount = rows.filter((r) => r.target !== null && r.collected !== null && r.deadline !== null && r.collected < r.target && Number(r.deadline) >= now).length

  if (!SPLITPAY_ADDRESS) return <Notice tone="danger" title="Not configured">The SplitPay contract address is missing from this build.</Notice>

  if (!isConnected)
    return (
      <div className="grid gap-6">
        <ServerGroups />
        <div className="card mx-auto max-w-md text-center">
          <h1 className="display text-2xl font-bold">Your groups</h1>
          <p className="mt-2" style={{ color: 'var(--ink-2)' }}>Connect the wallet you used to create groups to see them here.</p>
          <button type="button" className="btn-primary mt-4" onClick={openConnectChooser}>Connect wallet</button>
        </div>
      </div>
    )

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl font-bold sm:text-4xl">Your groups</h1>
          <p className="hint" role="status">
            {syncing ? <><Spinner className="mr-1 inline size-3.5" /> Still syncing. Your newest groups are already shown.</> : 'Live from the network.'}
          </p>
        </div>
        <button type="button" className="btn-primary btn-sm" onClick={() => navigate('/new')}>
          <Plus className="size-4" aria-hidden="true" /> New group
        </button>
      </div>

      {nothingLoaded ? <Notice tone="warn">We could not look up your groups right now. We will keep trying.</Notice> : null}
      <ServerGroups />

      <dl className="grid grid-cols-3 gap-3">
        {[
          ['Groups', String(rows.length)],
          ['Open now', String(openCount)],
          ['Collected', `${fmtUsdc(totalCollected)}`],
        ].map(([k, v]) => (
          <div key={k} className="card !p-4">
            <dt className="text-sm" style={{ color: 'var(--muted)' }}>{k}</dt>
            <dd className="display text-xl font-bold tabular-nums sm:text-3xl">{v}{k === 'Collected' ? <span className="ml-1 text-sm font-medium">USDC</span> : null}</dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 && !syncing && !nothingLoaded ? (
        <div className="card text-center">
          <p className="display text-xl font-bold">No groups yet</p>
          <p className="mt-1" style={{ color: 'var(--ink-2)' }}>Create your first group and share the link.</p>
          <button type="button" className="btn-primary mx-auto mt-4 max-w-xs" onClick={() => navigate('/new')}>Create a group</button>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <GroupRow key={r.ref.groupId} row={r} now={now} />
          ))}
        </ul>
      )}
    </div>
  )
}

interface Row {
  ref: StoredGroupRef
  title: string
  text?: string
  target: bigint | null
  deadline: bigint | null
  collected: bigint | null
}

function GroupRow({ row, now }: { row: Row; now: number }) {
  const [link, setLink] = useState<string | null>(null)
  const path = groupPath(row.ref.groupId, row.text, row.ref.block)
  useEffect(() => {
    let live = true
    void buildShareLink(path).then((l) => {
      if (live) setLink(l)
    })
    return () => {
      live = false
    }
  }, [path])

  const ready = row.target !== null && row.collected !== null && row.deadline !== null
  const pct = ready ? percent(row.collected!, row.target!) : 0
  const full = ready && row.collected! >= row.target!
  const closed = ready && !full && Number(row.deadline) < now

  return (
    <li className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="display text-xl font-bold">{row.title}</h2>
        {ready ? full ? <Chip tone="success">Fully paid</Chip> : closed ? <Chip tone="danger">Closed</Chip> : <Chip tone="teal">Open</Chip> : null}
      </div>
      {ready ? (
        <>
          <div
            className="h-3 overflow-hidden rounded-full"
            style={{ background: '#e3eaf3' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`${row.title}: ${pct} percent collected`}
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--teal)', transition: 'width 600ms ease' }} />
          </div>
          <p className="flex flex-wrap justify-between gap-x-3 text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>
            <span><strong>{fmtUsdc(row.collected!)}</strong> of {fmtUsdc(row.target!)} USDC</span>
            <span>{full ? 'Complete' : timeLeft(row.deadline!, now)}</span>
          </p>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--muted)' }} role="status">Loading…</p>
      )}
      <div className="mt-auto flex items-center gap-2">
        <button type="button" className="btn-primary btn-sm flex-1" onClick={() => navigate(path)}>View payments</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => navigate(`/g/${row.ref.groupId}/manage${path.slice(path.indexOf('?'))}`)}>People</button>
        {link ? <CopyButton text={link} label={`Copy share link for ${row.title}`} className="border" /> : null}
      </div>
      {!row.text ? <p className="hint">Details for this group were saved on another device. The link still works and shows the amounts from the network.</p> : null}
    </li>
  )
}

interface ServerGroupsRes {
  owned: { groupId: string; title: string; path: string; participantCount: number }[]
  joined: { groupId: string; title: string; path: string; expectedAmount: string; status: string }[]
}

/** Groups saved to the signed-in account. Available on any device after signing in. */
function ServerGroups() {
  const { available } = useAccountsAvailable()
  const { user } = useSession()
  const q = useQuery({ queryKey: ['server-groups'], queryFn: () => api.get<ServerGroupsRes>('/groups'), enabled: available && Boolean(user), retry: 1 })
  if (!available) return null
  if (!user) {
    return (
      <Notice tone="teal" title="Keep your groups on every device">
        <button type="button" className="underline" onClick={() => navigate('/signin?next=/dashboard')}>Sign in</button> to save groups, invite people and send reminders. Your payments still settle on Arc.
      </Notice>
    )
  }
  if (!q.data || (q.data.owned.length === 0 && q.data.joined.length === 0)) return null
  return (
    <section className="card grid gap-3" aria-labelledby="saved">
      <h2 id="saved" className="display text-xl font-bold">Saved to your account</h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {q.data.owned.map((g) => (
          <li key={g.groupId} className="card-inner flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{g.title}</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{g.participantCount} {g.participantCount === 1 ? 'person' : 'people'} invited</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => navigate(g.path)}>Open</button>
              <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`/g/${g.groupId}/manage${g.path.slice(g.path.indexOf('?'))}`)}>People</button>
            </div>
          </li>
        ))}
        {q.data.joined.map((g) => (
          <li key={`j-${g.groupId}`} className="card-inner flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{g.title}</p>
              <p className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>Your share {fmtUsdc(BigInt(g.expectedAmount))} USDC</p>
            </div>
            <button type="button" className="btn-primary btn-sm" onClick={() => navigate(g.path)}>Pay</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
