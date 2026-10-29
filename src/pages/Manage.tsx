import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BellRing, MessageCircle, Trash2, UserPlus } from 'lucide-react'
import { api, ApiError, type IntentView, type ParticipantView } from '@/api/client'
import { useSession } from '@/account/SessionProvider'
import { useLinkWallet } from '@/account/useLinkWallet'
import { decodeMeta } from '@/lib/metadata'
import { fmtUsdc, fmtUsdcLabel } from '@/lib/money'
import { navigate, useLocation } from '@/lib/router'
import { parseUsdc } from '@/onchain-money'
import { getStoredGroups } from '@/lib/localGroups'
import { Chip, CopyButton, Notice, Spinner } from '@/components/ui'
import { getShareBase } from '@/lib/share'
import { openConnectChooser } from '@/wallet/walletUi'

interface GroupRes {
  group: { groupId: string; title: string; path: string }
  participants: ParticipantView[]
}

const statusChip = (p: ParticipantView) => {
  if (p.paid) return <Chip tone="success">Paid on Arc</Chip>
  if (p.status === 'joined' || p.status === 'reminded') return <Chip tone="teal">{p.status === 'reminded' ? 'Reminded' : 'Joined, not paid'}</Chip>
  if (p.status === 'viewed') return <Chip tone="muted">Viewed invite</Chip>
  return <Chip tone="muted">Invited</Chip>
}

const reminderText: Record<string, string> = {
  sent: 'Reminder sent',
  already_paid: 'Already paid',
  no_email: 'No email address',
  too_soon: 'Reminded in the last 24 hours',
  closed: 'Group is closed',
  unknown_balance: 'Could not check payment',
}

export function Manage({ id }: { id: string }) {
  const { user, loading } = useSession()
  const { search } = useLocation()
  const qc = useQueryClient()
  const { link, linked, busy: linking, error: linkError, address } = useLinkWallet()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [amountText, setAmountText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [lastInvite, setLastInvite] = useState<{ link: string; name: string; emailed: boolean } | null>(null)
  const [reminders, setReminders] = useState<{ participantId: number; result: string }[] | null>(null)

  const d = search.get('d')
  const b = search.get('b')
  const groupQ = useQuery({
    queryKey: ['group', id],
    queryFn: () => api.get<GroupRes>(`/groups/${id}`),
    enabled: Boolean(user),
    retry: false,
    refetchInterval: 15000,
  })
  const intents = useQuery({
    queryKey: ['group-intents', id],
    queryFn: () => api.get<{ intents: IntentView[] }>(`/groups/${id}/intents`),
    enabled: Boolean(groupQ.data),
  })

  const stored = useMemo(() => getStoredGroups()[id.toLowerCase()], [id])
  const metaText = (d ? decodeMeta(d)?.text : null) ?? stored?.text ?? null
  const block = b ?? stored?.block ?? null

  const save = useMutation({
    mutationFn: () => api.post('/groups', { groupId: id, metaText, block }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', id] }),
  })

  const addPerson = useMutation({
    mutationFn: async () => {
      const base = await getShareBase()
      return api.post<{ inviteLink: string; emailed: boolean }>(`/groups/${id}/participants`, {
        name,
        email: email || undefined,
        expectedAmount: parseUsdc(amountText).toString(),
        linkBase: base,
      })
    },
    onSuccess: async (r) => {
      setLastInvite({ link: r.inviteLink, name, emailed: r.emailed })
      setName(''); setEmail(''); setFormError(null)
      await qc.invalidateQueries({ queryKey: ['group', id] })
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Could not add that person.'),
  })
  const remove = useMutation({
    mutationFn: (pid: number) => api.del(`/groups/${id}/participants/${pid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', id] }),
  })
  const remind = useMutation({
    mutationFn: async () => api.post<{ results: { participantId: number; result: string }[] }>(`/groups/${id}/reminders`, { linkBase: await getShareBase() }),
    onSuccess: async (r) => {
      setReminders(r.results)
      await qc.invalidateQueries({ queryKey: ['group', id] })
    },
  })

  if (loading) return <div className="card text-center"><Spinner /></div>
  if (!user) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <h1 className="display text-2xl font-bold">Sign in to manage this group</h1>
        <button type="button" className="btn-primary mt-4" onClick={() => navigate(`/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>Sign in</button>
      </div>
    )
  }

  const back = (
    <button type="button" className="btn-ghost btn-sm w-fit" onClick={() => navigate(d && b ? `/g/${id}?d=${d}&b=${b}` : `/g/${id}`)}>
      <ArrowLeft className="size-4" aria-hidden="true" /> Back to the group
    </button>
  )

  if (groupQ.isError) {
    return (
      <div className="mx-auto grid max-w-lg gap-4">
        {back}
        <div className="card grid gap-3">
          <h1 className="display text-2xl font-bold">Save this group to your account</h1>
          <p className="hint">Saving lets you invite people, send reminders and see this group on every device. We check it on Arc first: your linked wallet must be the one that created it.</p>
          {!address ? <button type="button" className="btn-primary" onClick={openConnectChooser}>Connect the wallet that created the group</button> : null}
          {address && !linked ? <button type="button" className="btn-primary" disabled={linking} onClick={() => void link()}>{linking ? <Spinner /> : null} Link this wallet to my account</button> : null}
          {linkError ? <p className="error-text" role="alert">{linkError}</p> : null}
          {metaText && block ? (
            <button type="button" className="btn-primary" disabled={!linked || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner /> : null} Save this group</button>
          ) : (
            <Notice tone="warn">Open this page from the group's own link (with its details) so we can save it.</Notice>
          )}
          {save.isError ? <p className="error-text" role="alert">{save.error instanceof ApiError ? save.error.message : 'Could not save the group.'}</p> : null}
        </div>
      </div>
    )
  }
  if (!groupQ.data) return <div className="card text-center"><Spinner /></div>

  const { group, participants } = groupQ.data
  const unpaid = participants.filter((p) => !p.paid)
  const amountOk = (() => {
    try { return parseUsdc(amountText) > 0n } catch { return false }
  })()

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      {back}
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--teal-ink)' }}>People and reminders</p>
        <h1 className="display text-3xl font-bold text-balance">{group.title}</h1>
        <p className="hint">Payment status comes from Arc. Nobody is marked paid until their USDC payment is confirmed onchain.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <form className="card grid content-start gap-3" onSubmit={(e) => { e.preventDefault(); addPerson.mutate() }}>
          <h2 className="display text-xl font-bold">Invite someone</h2>
          <div>
            <label className="label" htmlFor="p-name">Name</label>
            <input id="p-name" className="input" maxLength={40} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-email">Email (optional)</label>
            <input id="p-email" type="email" className="input" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="hint">With an email we send the invitation and can remind them.</p>
          </div>
          <div>
            <label className="label" htmlFor="p-amount">Their share (USDC)</label>
            <input id="p-amount" className="input tabular-nums" inputMode="decimal" required placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-invalid={amountText !== '' && !amountOk} />
          </div>
          {formError ? <p className="error-text" role="alert">{formError}</p> : null}
          <button type="submit" className="btn-primary" disabled={addPerson.isPending || !name.trim() || !amountOk}>
            {addPerson.isPending ? <Spinner /> : <UserPlus className="size-4" aria-hidden="true" />} Create invitation
          </button>
          {lastInvite ? (
            <div className="card-inner grid gap-2" aria-live="polite">
              <p className="font-semibold">Invitation for {lastInvite.name}</p>
              <p className="hint">{lastInvite.emailed ? 'We emailed it. ' : ''}This link is shown once. Copy it now.</p>
              <div className="flex items-center gap-1">
                <input readOnly aria-label="Invitation link" className="mono min-h-[44px] min-w-0 flex-1 bg-transparent text-xs outline-none" value={lastInvite.link} />
                <CopyButton text={lastInvite.link} label="Copy invitation link" />
                <a className="btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`You're invited to pay your share of "${group.title}": ${lastInvite.link}`)}`} aria-label="Send on WhatsApp"><MessageCircle className="size-4" aria-hidden="true" /></a>
              </div>
            </div>
          ) : null}
        </form>

        <section className="card grid content-start gap-3" aria-labelledby="people">
          <div className="flex items-center justify-between gap-2">
            <h2 id="people" className="display text-xl font-bold">People ({participants.length})</h2>
            <button type="button" className="btn-ghost btn-sm" disabled={remind.isPending || unpaid.length === 0} onClick={() => remind.mutate()}>
              {remind.isPending ? <Spinner /> : <BellRing className="size-4" aria-hidden="true" />} Remind everyone unpaid
            </button>
          </div>
          {participants.length === 0 ? <p className="hint">Nobody invited yet.</p> : (
            <ul className="grid gap-2">
              {participants.map((p) => (
                <li key={p.id} className="card-inner flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                      {fmtUsdc(BigInt(p.expectedAmount))} USDC{p.contributed && p.contributed !== '0' ? ` · paid ${fmtUsdc(BigInt(p.contributed))}` : ''}
                    </p>
                    {reminders?.find((r) => r.participantId === p.id) ? <p className="text-xs" style={{ color: 'var(--muted)' }}>{reminderText[reminders.find((r) => r.participantId === p.id)!.result]}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    {statusChip(p)}
                    <button type="button" className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-slate-100" aria-label={`Remove ${p.name}`} onClick={() => remove.mutate(p.id)}><Trash2 className="size-4" aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Reminders go out by email, at most once a day per person, and never to people who have paid or after the deadline.</p>
        </section>
      </div>

      {intents.data && intents.data.intents.length > 0 ? (
        <section className="card grid gap-2" aria-labelledby="sandbox">
          <h2 id="sandbox" className="display text-xl font-bold">NGN sandbox requests</h2>
          <Notice tone="warn">These are demo requests. No money moved and none of this is counted in the group total.</Notice>
          <ul className="grid gap-2">
            {intents.data.intents.map((i) => (
              <li key={i.id} className="card-inner flex items-center justify-between gap-2 text-sm">
                <span className="tabular-nums">{fmtUsdcLabel(BigInt(i.usdcAmount))}</span>
                <Chip tone="warn">{i.status === 'completed_sandbox' ? 'Completed' : i.status.replace(/_/g, ' ')} (sandbox)</Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
