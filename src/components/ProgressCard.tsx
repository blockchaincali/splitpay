import { CalendarClock } from 'lucide-react'
import { fmtUsdc, percent } from '@/lib/money'
import { formatDeadline, timeLeft, useNow } from '@/lib/time'
import { Chip } from './ui'

function Ring({ pct }: { pct: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div
      className="relative size-36 shrink-0"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`${pct} percent collected`}
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e3eaf3" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--teal)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display text-3xl font-bold tabular-nums">{pct}%</span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>collected</span>
      </div>
    </div>
  )
}

export function ProgressCard({
  title,
  description,
  collected,
  target,
  deadline,
}: {
  title: string
  description?: string
  collected: bigint
  target: bigint
  deadline: bigint
}) {
  const now = useNow()
  const pct = percent(collected, target)
  const remaining = target > collected ? target - collected : 0n
  const full = collected >= target
  const closed = !full && Number(deadline) < now

  return (
    <section className="card" aria-labelledby="group-title">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {full ? <Chip tone="success">Fully paid</Chip> : closed ? <Chip tone="danger">Closed</Chip> : <Chip tone="teal">Open</Chip>}
        {!full && !closed ? <Chip tone="muted">{timeLeft(deadline, now)}</Chip> : null}
      </div>
      <h1 id="group-title" className="display text-balance text-3xl font-bold sm:text-4xl">{title}</h1>
      {description ? <p className="mt-2 max-w-prose text-pretty" style={{ color: 'var(--ink-2)' }}>{description}</p> : null}

      <div className="mt-6 flex items-center gap-5">
        <Ring pct={pct} />
        <dl className="grid flex-1 gap-3">
          <div>
            <dt className="text-sm" style={{ color: 'var(--muted)' }}>Paid so far</dt>
            <dd className="display text-2xl font-bold tabular-nums">{fmtUsdc(collected)} <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>USDC</span></dd>
          </div>
          <div>
            <dt className="text-sm" style={{ color: 'var(--muted)' }}>Still to pay</dt>
            <dd className="text-lg font-semibold tabular-nums">{fmtUsdc(remaining)} USDC</dd>
          </div>
        </dl>
      </div>
      <p className="mt-4 text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>
        Goal: <strong>{fmtUsdc(target)} USDC</strong>
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: 'var(--ink-2)' }}>
        <CalendarClock className="size-4" aria-hidden="true" />
        Pay by {formatDeadline(deadline)}
      </p>
    </section>
  )
}
