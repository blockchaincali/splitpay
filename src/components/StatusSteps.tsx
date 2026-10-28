import { Check, Circle } from 'lucide-react'
import type { PayStep } from '@/lib/usePayShare'
import { Spinner } from './ui'

type State = 'todo' | 'active' | 'done'

function Row({ state, label, detail }: { state: State; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3" aria-current={state === 'active' ? 'step' : undefined}>
      <span
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
        style={{
          background: state === 'done' ? 'var(--success)' : state === 'active' ? 'var(--navy)' : 'var(--surface-muted)',
          color: state === 'todo' ? 'var(--muted)' : '#fff',
        }}
      >
        {state === 'done' ? <Check className="size-3.5" aria-hidden="true" /> : state === 'active' ? <Spinner className="size-3.5" /> : <Circle className="size-2.5" aria-hidden="true" />}
      </span>
      <span>
        <span className="block text-sm font-semibold" style={{ color: state === 'todo' ? 'var(--muted)' : 'var(--ink)' }}>
          {label}
          <span className="sr-only">{state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : ' (waiting)'}</span>
        </span>
        {detail && state === 'active' ? <span className="block text-sm" style={{ color: 'var(--muted)' }}>{detail}</span> : null}
      </span>
    </li>
  )
}

/** Each row reflects a real wallet or network state. Nothing here moves on a timer. */
export function StatusSteps({ step, amountLabel, chainName }: { step: PayStep; amountLabel: string; chainName: string }) {
  const allow: State =
    step === 'allow-wallet' || step === 'allow-confirming' || step === 'switching'
      ? 'active'
      : step === 'pay-wallet' || step === 'pay-confirming' || step === 'done'
        ? 'done'
        : 'todo'
  const send: State = step === 'pay-wallet' || step === 'pay-confirming' ? 'active' : step === 'done' ? 'done' : 'todo'
  const confirmed: State = step === 'done' ? 'done' : step === 'pay-confirming' ? 'active' : 'todo'
  return (
    <ol className="card-inner grid gap-3" aria-label="Payment progress">
      <Row
        state={allow}
        label={`Allow exactly ${amountLabel}`}
        detail={step === 'switching' ? `Switch your wallet to ${chainName}.` : step === 'allow-wallet' ? 'Approve the request in your wallet.' : 'Waiting for the network to confirm.'}
      />
      <Row state={send} label="Send your payment" detail="Approve the payment in your wallet." />
      <Row state={confirmed} label={`Confirmed on ${chainName}`} detail="Waiting for the network to confirm." />
    </ol>
  )
}
