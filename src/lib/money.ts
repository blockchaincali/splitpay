import { formatUnitsExact } from '@/onchain-money'
import { USDC_DECIMALS_ONCHAIN } from './deployment'

/** USDC ERC-20 amount (6-decimal view) to a plain string, at least 2 decimals, e.g. "12.50". */
export function fmtUsdc(raw: bigint): string {
  const exact = formatUnitsExact(raw, USDC_DECIMALS_ONCHAIN)
  const [whole, frac = ''] = exact.split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas}.${frac.padEnd(2, '0')}`
}

export function fmtUsdcLabel(raw: bigint): string {
  return `${fmtUsdc(raw)} USDC`
}

/** Percent funded, 0..100, whole number. Never reaches 100 until fully funded. */
export function percent(collected: bigint, target: bigint): number {
  if (target <= 0n) return 0
  if (collected >= target) return 100
  const p = Number((collected * 10000n) / target) / 100
  return Math.min(99, Math.floor(p))
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}
