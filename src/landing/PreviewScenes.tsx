import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Check, Circle, Copy, Loader2, Minus, Plus, Receipt, Send, Wallet } from 'lucide-react'
import QRCode from 'qrcode'
import {
  ARRIVING,
  CUSTOM_SHARES,
  EQUAL_SHARES,
  PAID_AFTER,
  SAMPLE_DEADLINE,
  SAMPLE_LINK,
  SAMPLE_QR_TEXT,
  SAMPLE_RECIPIENT,
  SAMPLE_TITLE,
  SAMPLE_TOTAL,
  usdc,
} from './sample'

/**
 * The five scenes of the landing-page walkthrough. Pure markup and CSS animation (classes in src/index.css):
 * they use the real app's labels and layout, but no wallet, network or storage is ever touched.
 * Animation timing is expressed as CSS custom properties so each scene replays when it is re-mounted.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>
const at = (seconds: number, extra: Vars = {}): Vars => ({ '--d': `${seconds}s`, ...extra })
const between = (from: number, to: number): Vars => ({ '--a': `${from}s`, '--b': `${to}s` })
const muted = { color: 'var(--muted)' } as const
const border = { borderColor: 'var(--border)' } as const

function Scene({ children }: { children: ReactNode }) {
  return <div className="demo-scene grid content-start gap-3 p-4 sm:p-5">{children}</div>
}

function Title({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <h3 className="display demo-in text-lg font-bold sm:text-xl" style={at(delay)}>{children}</h3>
}

function Field({ label, children, delay = 0 }: { label: string; children: ReactNode; delay?: number }) {
  return (
    <div className="demo-in" style={at(delay)}>
      <p className="text-xs font-semibold">{label}</p>
      <div className="mt-1 flex min-h-[40px] items-center rounded-xl border bg-white px-3 text-sm" style={border}>
        {children}
      </div>
    </div>
  )
}

/** Characters appear one after another. */
function Typed({ text, start, per = 0.06, mono = false }: { text: string; start: number; per?: number; mono?: boolean }) {
  const end = start + text.length * per
  return (
    <span className={`inline-flex min-w-0 items-center ${mono ? 'mono text-xs' : ''}`}>
      {[...text].map((ch, i) => (
        <span key={i} className="demo-show" style={at(start + i * per)}>{ch === ' ' ? ' ' : ch}</span>
      ))}
      <span className="demo-flash ml-0.5 inline-block h-4 w-px bg-[var(--ink)]" style={between(start, end + 0.5)} />
    </span>
  )
}

/* ---------------------------------------------------------------- 1. Create a group */

export function CreateScene() {
  return (
    <Scene>
      <Title>Create a payment group</Title>
      <Field label="What is it for?" delay={0.2}>
        <Typed text={SAMPLE_TITLE} start={0.5} />
      </Field>
      <Field label="Total to collect (USDC)" delay={0.3}>
        <Typed text={usdc(SAMPLE_TOTAL)} start={1.9} per={0.12} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pay by" delay={3.4}>
          <span className="truncate">{SAMPLE_DEADLINE}</span>
        </Field>
        <Field label="Receiving wallet" delay={3.8}>
          <span className="mono truncate text-xs">{SAMPLE_RECIPIENT}</span>
        </Field>
      </div>
      <p className="demo-in text-xs" style={at(4.4, muted)}>
        The organiser fills in the details once. The receiving wallet is where every payment will go.
      </p>
    </Scene>
  )
}

/* ---------------------------------------------------------------- 2. Choose the split */

function Pill({ label, selectedAtStart }: { label: string; selectedAtStart: boolean }) {
  return (
    <div className="relative grid min-h-[40px] place-items-center rounded-xl border bg-white text-sm font-semibold" style={border}>
      {label}
      <span
        className={`${selectedAtStart ? 'demo-gone' : 'demo-show'} absolute inset-0 grid place-items-center rounded-xl text-white`}
        style={{ ...at(3.2), background: 'var(--navy)' }}
      >
        {label}
      </span>
    </div>
  )
}

export function SplitScene() {
  return (
    <Scene>
      <Title>How should it be split?</Title>
      <div className="demo-in grid grid-cols-2 gap-2" style={at(0.2)}>
        <Pill label="Split equally" selectedAtStart />
        <Pill label="Custom amounts" selectedAtStart={false} />
      </div>

      <div className="relative min-h-[236px]">
        <div className="demo-gone absolute inset-0 grid content-start gap-2" style={at(3.2)}>
          <div className="demo-in flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2" style={at(0.5)}>
            <span className="text-sm font-semibold">Number of people</span>
            <span className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg border bg-white" style={border}><Minus className="size-3.5" /></span>
              <span className="display w-5 text-center text-lg font-bold tabular-nums">4</span>
              <span className="grid size-7 place-items-center rounded-lg border bg-white" style={border}><Plus className="size-3.5" /></span>
            </span>
          </div>
          {EQUAL_SHARES.map((s, i) => (
            <div key={i} className="demo-in flex items-center justify-between rounded-xl border bg-white px-3 py-2 text-sm" style={{ ...at(0.9 + i * 0.35), ...border }}>
              <span>Person {i + 1}</span>
              <span className="font-semibold tabular-nums">{usdc(s)} USDC</span>
            </div>
          ))}
          <p className="demo-in text-xs" style={at(2.4, muted)}>Each person pays {usdc(EQUAL_SHARES[0])} USDC.</p>
        </div>

        <div className="demo-show absolute inset-0 grid content-start gap-2" style={at(3.3)}>
          {CUSTOM_SHARES.map((p, i) => (
            <div key={p.name} className="demo-in grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border bg-white px-3 py-2 text-sm" style={{ ...at(3.4 + i * 0.35), ...border }}>
              <span className="font-semibold">{p.name}</span>
              <span className="tabular-nums">{usdc(p.amount)} <span className="text-xs" style={muted}>USDC</span></span>
            </div>
          ))}
          <p className="demo-in flex items-center gap-1.5 text-sm font-medium" style={at(5.0, { color: 'var(--success)' })}>
            <Check className="size-4" aria-hidden="true" /> Adds up to {usdc(SAMPLE_TOTAL)} USDC
          </p>
          <p className="demo-in text-xs" style={at(5.3, muted)}>The shares must add up exactly to the total before the group can be created.</p>
        </div>
      </div>
    </Scene>
  )
}

/* ---------------------------------------------------------------- 3. Connect a wallet */

function StatusRow({ label, from, to, last = false }: { label: string; from: number; to: number; last?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)]" style={muted}>
        <Circle className="demo-gone size-2.5" style={at(from)} />
        {last ? null : <Loader2 className="demo-flash absolute size-3.5 animate-spin text-[var(--navy)]" style={between(from, to)} />}
        <span className="demo-show absolute inset-0 grid place-items-center rounded-full text-white" style={{ ...at(to), background: 'var(--success)' }}>
          <Check className="size-3.5" />
        </span>
      </span>
      <span className="relative text-sm font-semibold">
        <span className="demo-gone" style={{ ...at(from), ...muted }}>{label}</span>
        <span className="demo-show absolute left-0 top-0 whitespace-nowrap" style={at(from)}>{label}</span>
      </span>
    </li>
  )
}

export function ConnectScene() {
  return (
    <Scene>
      <div className="demo-in flex flex-wrap items-center justify-between gap-2" style={at(0)}>
        <Title>Your group</Title>
        <span className="chip" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>Demo: no wallet is connected</span>
      </div>

      <div className="relative grid gap-2">
        <div className="relative min-h-[44px]">
          <div className="demo-gone absolute inset-0" style={at(1.9)}>
            <div className="btn-primary pointer-events-none !min-h-[44px] !text-sm">Connect wallet to continue</div>
          </div>
          <div className="demo-show absolute inset-0" style={at(2.0)}>
            <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-2xl border bg-white px-4 text-sm font-semibold" style={border}>
              <span className="flex items-center gap-2"><Wallet className="size-4" /> 0x12…9f0a</span>
              <span className="chip" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>Connected (demo)</span>
            </div>
          </div>
        </div>
        <p className="demo-in text-xs" style={at(2.4, muted)}>
          Creating a group is one transaction from your own wallet. It moves no money.
        </p>

        {/* Overlays the two rows above while it is showing, so nothing shifts when it goes away. */}
        <div className="demo-flash absolute inset-x-0 top-0 z-10 rounded-2xl border bg-white p-3 shadow-sm" style={{ ...between(0.5, 1.9), ...border }}>
          <p className="text-xs font-semibold" style={muted}>Choose a wallet</p>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 text-sm font-semibold">
            <span className="flex items-center gap-2"><Wallet className="size-4" /> Your browser wallet</span>
            <span className="demo-show text-xs" style={at(1.2, { color: 'var(--teal-ink)' })}>Selected</span>
          </div>
        </div>
      </div>

      <ol className="demo-in card-inner grid gap-3" style={at(2.3)} aria-label="Group creation progress">
        <StatusRow label="Switch your wallet to the Arc network" from={2.6} to={3.4} />
        <StatusRow label="Confirm in your wallet" from={3.4} to={4.6} />
        <StatusRow label="Waiting for the network to confirm" from={4.6} to={5.6} />
        <StatusRow label="Your group is live" from={5.6} to={5.7} last />
      </ol>
    </Scene>
  )
}

/* ---------------------------------------------------------------- 4. Share the group */

function QrMark() {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(SAMPLE_QR_TEXT, { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    let d = ''
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!qr.modules.get(y, x)) continue
        let w = 1
        while (x + w < n && qr.modules.get(y, x + w)) w++
        d += `M${x + 1} ${y + 1}h${w}v1h-${w}z`
        x += w - 1
      }
    }
    return { size: n + 2, path: d }
  }, [])
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="size-28 rounded-xl border bg-white p-1" style={border} shapeRendering="crispEdges">
      <path d={path} fill="#0b1f3a" />
    </svg>
  )
}

export function ShareScene() {
  return (
    <Scene>
      <div className="demo-in flex items-center gap-2" style={at(0)}>
        <span className="grid size-7 place-items-center rounded-full text-white" style={{ background: 'var(--success)' }}><Check className="size-4" /></span>
        <h3 className="display text-lg font-bold sm:text-xl">Your group is live</h3>
      </div>

      <div className="demo-in rounded-2xl border bg-white p-3" style={{ ...at(0.4), ...border }}>
        <p className="display text-base font-bold">Share this link</p>
        <div className="mt-2 flex items-center gap-1 rounded-xl border pl-3" style={border}>
          <span className="mono min-w-0 flex-1 truncate py-2.5 text-xs">
            <Typed text={SAMPLE_LINK} start={0.9} per={0.03} mono />
          </span>
          <span className="relative grid size-10 shrink-0 place-items-center">
            <Copy className="demo-gone size-4" style={at(3.9)} />
            <Check className="demo-show absolute size-4 text-[var(--success)]" style={at(3.9)} />
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <span className="btn-primary pointer-events-none !min-h-[40px] !text-sm"><Send className="size-4" /> WhatsApp</span>
          <span className="btn-ghost pointer-events-none !min-h-[40px] !text-sm">Copy link</span>
        </div>
      </div>

      <div className="demo-pop flex items-center justify-center gap-4" style={at(2.4)}>
        <QrMark />
        <p className="max-w-[10rem] text-xs" style={muted}>Or show a QR code. Anyone can scan it to open the group.</p>
      </div>
      <p className="demo-in text-xs" style={at(4.6, muted)}>Sample link and QR code. They do not lead anywhere.</p>
    </Scene>
  )
}

/* ---------------------------------------------------------------- 5. Track payments */

/** One number replaced by the next, at the given times. */
function Counter({ values, times }: { values: string[]; times: number[] }) {
  return (
    <span className="inline-grid">
      {values.map((v, i) => {
        const appears = i === 0 ? undefined : times[i - 1]
        const leaves = i === values.length - 1 ? undefined : times[i]
        const cls = appears === undefined ? 'demo-gone' : leaves === undefined ? 'demo-show' : 'demo-flash'
        const vars = appears === undefined ? at(leaves ?? 0) : leaves === undefined ? at(appears) : between(appears, leaves)
        return <span key={v} className={`${cls} col-start-1 row-start-1`} style={vars}>{v}</span>
      })}
    </span>
  )
}

export function TrackScene() {
  const times = [1.3, 2.6, 3.8]
  const paid = ['0.00', ...PAID_AFTER.map(usdc)]
  const left = [usdc(SAMPLE_TOTAL), ...PAID_AFTER.map((p) => usdc(SAMPLE_TOTAL - p))]
  return (
    <Scene>
      <div className="demo-in flex flex-wrap items-center gap-2" style={at(0)}>
        <span className="chip" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>Open</span>
        <h3 className="display text-lg font-bold sm:text-xl">{SAMPLE_TITLE}</h3>
      </div>

      <div className="demo-in rounded-2xl border bg-white p-3" style={{ ...at(0.2), ...border }}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs" style={muted}>Paid so far</p>
            <p className="display text-xl font-bold tabular-nums"><Counter values={paid} times={times} /> <span className="text-xs font-medium" style={muted}>USDC</span></p>
          </div>
          <div>
            <p className="text-xs" style={muted}>Still to pay</p>
            <p className="text-base font-semibold tabular-nums"><Counter values={left} times={times} /> <span className="text-xs font-medium" style={muted}>USDC</span></p>
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: '#e3eaf3' }}>
          <div className="demo-track h-full w-full origin-left rounded-full" style={{ background: 'var(--teal)' }} />
        </div>
        <p className="mt-1.5 text-xs tabular-nums" style={muted}>Goal: {usdc(SAMPLE_TOTAL)} USDC</p>
      </div>

      <div className="rounded-2xl border bg-white p-3" style={border}>
        <p className="display text-base font-bold">Payments</p>
        <div className="relative mt-2">
        {/* Overlays the (still invisible) rows, so it leaves no gap when it goes away. */}
        <p className="demo-gone absolute inset-x-0 top-0 z-10 flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] p-2.5 text-xs" style={at(times[0])}>
          <Receipt className="size-4 shrink-0" /> No payments yet. The first confirmed payment will show up here.
        </p>
        <ul className="grid gap-1.5">
          {ARRIVING.map((p, i) => (
            <li key={p.name} className="demo-in rounded-xl bg-[var(--surface-muted)] px-3 py-1.5" style={at(times[i])}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="display text-base font-bold tabular-nums">{usdc(p.amount)} <span className="text-xs font-medium">USDC</span></span>
              </div>
              <p className="text-xs" style={muted}>{p.who} · confirmed (simulated)</p>
            </li>
          ))}
        </ul>
        </div>
      </div>
    </Scene>
  )
}

export const SCENES = [CreateScene, SplitScene, ConnectScene, ShareScene, TrackScene] as const
