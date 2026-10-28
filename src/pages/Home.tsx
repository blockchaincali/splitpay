import { ArrowRight, Link2, ShieldCheck, Users, Wallet } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { navigate } from '@/lib/router'
import { IS_MAINNET, TARGET_CHAIN } from '@/lib/deployment'

const steps = [
  { icon: Users, title: 'Create a group', text: 'Name the expense, set the total, a deadline, and who receives the money.' },
  { icon: Link2, title: 'Share one link', text: 'Send it on WhatsApp. Friends open it on their phone, no account needed.' },
  { icon: Wallet, title: 'Everyone pays their share', text: 'Each person pays in USDC from their own wallet. You watch it fill up live.' },
]

export function Home() {
  return (
    <div className="grid gap-10">
      <section className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="chip mb-4" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>
            <TokenUSDC variant="branded" size={16} /> USDC on {TARGET_CHAIN.name}
          </p>
          <h1 className="display text-balance text-4xl font-bold sm:text-6xl">Split shared costs without chasing anyone.</h1>
          <p className="mt-4 max-w-prose text-pretty text-lg" style={{ color: 'var(--ink-2)' }}>
            Make a payment link, send it to your group, and watch the contributions arrive. Money goes straight to the receiver, never through us.
          </p>
          <div className="mt-6 grid gap-3 sm:max-w-md sm:grid-cols-2">
            <button type="button" className="btn-primary" onClick={() => navigate('/new')}>
              Create a group <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            <button type="button" className="btn-ghost" onClick={() => navigate('/dashboard')}>My groups</button>
          </div>
          {!IS_MAINNET ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
              You are on a test network. Everything here uses test USDC with no real value.
            </p>
          ) : null}
        </div>
        <div className="card" aria-hidden="true">
          <p className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>Example</p>
          <p className="display mt-1 text-2xl font-bold">Weekend cabin</p>
          <div className="mt-4 h-3 overflow-hidden rounded-full" style={{ background: '#e3eaf3' }}>
            <div className="h-full w-2/3 rounded-full" style={{ background: 'var(--teal)' }} />
          </div>
          <div className="mt-2 flex justify-between text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>
            <span>66% collected</span>
            <span>4 of 6 paid</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title" className="display text-2xl font-bold">How it works</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="card">
              <span className="flex size-10 items-center justify-center rounded-xl" style={{ background: 'var(--teal-soft)', color: 'var(--teal-ink)' }}>
                <s.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="display mt-3 text-lg font-bold"><span className="sr-only">Step {i + 1}: </span>{s.title}</h3>
              <p className="mt-1" style={{ color: 'var(--ink-2)' }}>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-6 shrink-0" style={{ color: 'var(--teal-ink)' }} aria-hidden="true" />
        <div>
          <h2 className="display text-lg font-bold">You stay in control</h2>
          <p style={{ color: 'var(--ink-2)' }}>
            SplitPay never holds funds and never asks for your private keys. You allow only the exact amount you are paying, and a payment is shown as done only after the network confirms it.
          </p>
        </div>
      </section>
    </div>
  )
}
