import { useCallback, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react'
import type { Hex } from 'viem'
import { useGroup, useContributions } from '@/lib/groupData'
import { decodeMeta, verifyMeta } from '@/lib/metadata'
import { groupPath } from '@/lib/localGroups'
import { SPLITPAY_ADDRESS } from '@/lib/deployment'
import { navigate, useLocation } from '@/lib/router'
import { AddressChip, Notice, Spinner } from '@/components/ui'
import { ProgressCard } from '@/components/ProgressCard'
import { PayPanel } from '@/components/PayPanel'
import { ReceiptList } from '@/components/ReceiptList'
import { ShareLinkCard } from '@/components/ShareLinkCard'

const ID_RE = /^0x[0-9a-fA-F]{64}$/

export function GroupPage({ id }: { id: string }) {
  const { search } = useLocation()
  const { address } = useAccount()
  const valid = ID_RE.test(id)
  const groupId = valid ? (id as Hex) : undefined
  const decoded = useMemo(() => decodeMeta(search.get('d')), [search])
  const hintParam = search.get('b')
  const hint = hintParam && /^\d+$/.test(hintParam) ? BigInt(hintParam) : null

  const { status, group, refetch } = useGroup(groupId)
  const { items, syncing, progress, error, resync } = useContributions(groupId, group?.collected, hint)
  const onPaid = useCallback(() => {
    void refetch()
    void resync()
  }, [refetch, resync])

  if (!SPLITPAY_ADDRESS)
    return <Notice tone="danger" title="Not configured">The SplitPay contract address is missing from this build.</Notice>
  if (!valid) return <NotFound text="This link does not look right. Ask the organiser to send it again." />
  if (status === 'loading')
    return (
      <p className="flex items-center gap-2 py-10" role="status"><Spinner /> Loading group from the network…</p>
    )
  if (status === 'notfound') return <NotFound text="We could not find this group on the network. Check the link or ask the organiser to resend it." />
  if (status === 'error' || !group)
    return <Notice tone="danger" title="Could not load this group">The network did not answer. Check your connection and refresh the page.</Notice>

  const verify = verifyMeta(decoded, group)
  const meta = verify === 'verified' ? decoded!.meta : null
  const isCreator = address?.toLowerCase() === group.creator.toLowerCase()

  return (
    <div className="grid gap-5">
      {isCreator ? (
        <button type="button" className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-semibold" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="size-4" aria-hidden="true" /> My groups
        </button>
      ) : null}

      {verify === 'mismatch' ? (
        <Notice tone="danger" title="These details do not match the network record">
          <span className="inline-flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            The title and split in this link were changed or copied. Only trust the amounts, deadline and receiving wallet shown below, and only pay if you know who sent you this.</span>
        </Notice>
      ) : verify === 'missing' ? (
        <Notice tone="warn" title="Group details not in this link">
          The title and description are not part of this link, but the amount, deadline and receiving wallet below come straight from the network.
        </Notice>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="grid gap-5">
          <ProgressCard
            title={meta?.t ?? 'Payment group'}
            description={meta?.d}
            collected={group.collected}
            target={group.target}
            deadline={group.deadline}
          />
          <section className="card" aria-labelledby="who-title">
            <h2 id="who-title" className="display text-xl font-bold">Where the money goes</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt style={{ color: 'var(--muted)' }}>Receiving wallet</dt>
                <dd><AddressChip address={group.recipient} /></dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt style={{ color: 'var(--muted)' }}>Organised by</dt>
                <dd><AddressChip address={group.creator} /></dd>
              </div>
            </dl>
            {verify === 'verified' ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
                <ShieldCheck className="size-4" aria-hidden="true" /> Details verified against the network record
              </p>
            ) : null}
            <p className="hint">Payments go straight to the receiving wallet. SplitPay never holds the money.</p>
          </section>
        </div>

        <div className="grid gap-5">
          <PayPanel groupId={groupId!} group={group} meta={meta} onPaid={onPaid} />
          {isCreator ? (
            <button type="button" className="btn-ghost" onClick={() => navigate(`/g/${groupId}/manage${window.location.search}`)}>People and reminders</button>
          ) : null}
          {isCreator ? (
            <ShareLinkCard path={groupPath(groupId!, decoded && verify === 'verified' ? decoded.text : undefined, hint ?? undefined)} title={meta?.t ?? 'Payment group'} />
          ) : null}
        </div>
      </div>

      <ReceiptList items={items} me={address} syncing={syncing} progress={progress} error={error} />
    </div>
  )
}

function NotFound({ text }: { text: string }) {
  return (
    <div className="card mx-auto max-w-md text-center">
      <h1 className="display text-2xl font-bold">Group not found</h1>
      <p className="mt-2" style={{ color: 'var(--ink-2)' }}>{text}</p>
      <button type="button" className="btn-primary mt-4" onClick={() => navigate('/')}>Back to home</button>
    </div>
  )
}
