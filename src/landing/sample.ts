import { fmtUsdc } from '@/lib/money'
import { equalShares } from '@/lib/splits'

/**
 * Sample data for the landing-page walkthrough. Nothing here is real: the names, addresses and amounts are invented,
 * and nothing in src/landing ever talks to a wallet or the network.
 */
export const SAMPLE_TOTAL = 120_000_000n // 120.00 USDC (6 decimals)
export const SAMPLE_TITLE = 'Weekend cabin'
export const SAMPLE_DEADLINE = '15 Nov, 6:00 PM'
export const SAMPLE_RECIPIENT = '0xA1b2…C3d4'

/** The same equal-split code the real app uses, so the numbers shown are the numbers it would produce. */
export const EQUAL_SHARES = equalShares(SAMPLE_TOTAL, 4)

export const CUSTOM_SHARES = [
  { name: 'Alex', amount: 50_000_000n, who: '0x3f9c…81d2' },
  { name: 'Sam', amount: 30_000_000n, who: '0x9ab4…0c17' },
  { name: 'Jo', amount: 25_000_000n, who: '0x52e1…d3a9' },
  { name: 'Kim', amount: 15_000_000n, who: '0xc7d0…4be6' },
] as const

/** Payments that "arrive" in the last scene: the first three of the custom shares. Kim has not paid yet. */
export const ARRIVING = CUSTOM_SHARES.slice(0, 3)
export const PAID_AFTER = [50_000_000n, 80_000_000n, 105_000_000n] as const

export const usdc = (raw: bigint) => fmtUsdc(raw)

export const SAMPLE_LINK = '…/g/0x8a38…c4f2?d=eyJ2IjoxLCJ0Ijoi…'
export const SAMPLE_QR_TEXT = 'SplitPay walkthrough: sample QR code, not a real link'
