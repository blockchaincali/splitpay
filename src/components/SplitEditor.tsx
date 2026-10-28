import { Minus, Plus, Trash2 } from 'lucide-react'
import { equalShares, type CustomValidation } from '@/lib/splits'
import { MAX_CUSTOM_SLOTS, MAX_LABEL } from '@/lib/metadata'
import { fmtUsdc } from '@/lib/money'

export interface SlotDraft {
  id: number
  label: string
  amount: string
}

export type SplitMode = 'equal' | 'custom'

interface Props {
  target: bigint | null
  mode: SplitMode
  onMode: (m: SplitMode) => void
  people: number
  onPeople: (n: number) => void
  slots: SlotDraft[]
  onSlots: (s: SlotDraft[]) => void
  validation: CustomValidation | null
}

export function SplitEditor({ target, mode, onMode, people, onPeople, slots, onSlots, validation }: Props) {
  const shares = target ? equalShares(target, people) : []
  const distinct = Array.from(new Set(shares.map((s) => s.toString())))
  let nextId = slots.reduce((m, s) => Math.max(m, s.id), 0) + 1

  return (
    <fieldset className="grid gap-4">
      <legend className="label">How should it be split?</legend>
      <div role="radiogroup" aria-label="Split type" className="grid grid-cols-2 gap-2">
        {(['equal', 'custom'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onMode(m)}
            className="min-h-[48px] rounded-2xl border px-3 text-sm font-semibold"
            style={{
              borderColor: mode === m ? 'var(--navy)' : 'var(--border)',
              background: mode === m ? 'var(--navy)' : '#fff',
              color: mode === m ? '#fff' : 'var(--ink)',
            }}
          >
            {m === 'equal' ? 'Split equally' : 'Custom amounts'}
          </button>
        ))}
      </div>

      {mode === 'equal' ? (
        <div className="card-inner">
          <div className="flex items-center justify-between gap-3">
            <span id="people-label" className="text-sm font-semibold">Number of people</span>
            <div className="flex items-center gap-2" role="group" aria-labelledby="people-label">
              <button type="button" className="btn-ghost btn-sm !px-3" aria-label="Fewer people" disabled={people <= 1} onClick={() => onPeople(people - 1)}>
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <output className="display w-10 text-center text-2xl font-bold tabular-nums" aria-live="polite">{people}</output>
              <button type="button" className="btn-ghost btn-sm !px-3" aria-label="More people" disabled={people >= 200} onClick={() => onPeople(people + 1)}>
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm" style={{ color: 'var(--ink-2)' }} aria-live="polite">
            {target && shares.length
              ? distinct.length === 1
                ? `Each person pays ${fmtUsdc(shares[0])} USDC.`
                : `Each person pays about ${fmtUsdc(shares[shares.length - 1])} to ${fmtUsdc(shares[0])} USDC. The last cents are shared out so the total is exact.`
              : 'Enter a goal amount to see each share.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {slots.map((s, i) => (
            <div key={s.id} className="card-inner grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor={`slot-name-${s.id}`}>Person {i + 1}</label>
                <input
                  id={`slot-name-${s.id}`}
                  className="input"
                  value={s.label}
                  maxLength={MAX_LABEL}
                  placeholder="Name"
                  onChange={(e) => onSlots(slots.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)))}
                />
              </div>
              <div>
                <label className="label" htmlFor={`slot-amt-${s.id}`}>USDC</label>
                <input
                  id={`slot-amt-${s.id}`}
                  className="input tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={s.amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, '')
                    if (/^\d*\.?\d{0,6}$/.test(v)) onSlots(slots.map((x) => (x.id === s.id ? { ...x, amount: v } : x)))
                  }}
                />
              </div>
              <button
                type="button"
                className="btn-ghost btn-sm !px-3"
                aria-label={`Remove person ${i + 1}`}
                disabled={slots.length <= 1}
                onClick={() => onSlots(slots.filter((x) => x.id !== s.id))}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={slots.length >= MAX_CUSTOM_SLOTS}
            onClick={() => onSlots([...slots, { id: nextId++, label: '', amount: '' }])}
          >
            <Plus className="size-4" aria-hidden="true" /> Add person
          </button>
          <p className="text-sm font-medium" aria-live="polite" style={{ color: validation?.ok ? 'var(--success)' : 'var(--ink-2)' }}>
            {validation
              ? validation.message ??
                (validation.ok
                  ? 'The amounts add up to your goal.'
                  : validation.difference > 0n
                    ? `${fmtUsdc(validation.difference)} USDC still to assign.`
                    : `${fmtUsdc(-validation.difference)} USDC over your goal.`)
              : null}
          </p>
        </div>
      )}
    </fieldset>
  )
}
