import type { SplitSlot } from './metadata'

/**
 * Equal split in raw 6-decimal USDC units. The remainder is handed out one unit at a time
 * so the shares always add up to exactly the target (never above it).
 */
export function equalShares(target: bigint, people: number): bigint[] {
  if (people < 1 || target <= 0n) return []
  const n = BigInt(people)
  const base = target / n
  const extra = Number(target % n)
  return Array.from({ length: people }, (_, i) => base + (i < extra ? 1n : 0n))
}

export interface CustomSlotInput {
  label: string
  /** raw units, or null when the field is empty or invalid */
  amount: bigint | null
}

export interface CustomValidation {
  ok: boolean
  total: bigint
  difference: bigint
  message: string | null
}

/** Custom amounts must be positive and add up to exactly the target. */
export function validateCustom(slots: CustomSlotInput[], target: bigint): CustomValidation {
  const total = slots.reduce((sum, s) => sum + (s.amount ?? 0n), 0n)
  const difference = target - total
  if (slots.length < 1) return { ok: false, total, difference, message: 'Add at least one person.' }
  if (slots.some((s) => s.amount === null || s.amount <= 0n))
    return { ok: false, total, difference, message: 'Every person needs an amount above zero.' }
  if (slots.some((s) => s.label.trim().length === 0))
    return { ok: false, total, difference, message: 'Give each person a name or label.' }
  if (difference !== 0n) return { ok: false, total, difference, message: null }
  return { ok: true, total, difference, message: null }
}

export function toSlots(slots: CustomSlotInput[]): SplitSlot[] {
  return slots.map((s) => ({ l: s.label.trim(), a: (s.amount ?? 0n).toString() }))
}
