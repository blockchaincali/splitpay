import { config } from '../config'
import { token, now } from '../util'
import type { PaymentProvider, QuoteSide } from './types'

const USDC_UNIT = 1_000_000n

/**
 * Sandbox provider. No money moves, no bank is contacted, and the rate is a configurable DEMO number.
 * It exists so the full user journey and the status model can be built and tested honestly.
 */
export function quoteMath(side: QuoteSide, usdcRaw: bigint, ngnPerUsdc: number, feeBps: number) {
  const rateKobo = BigInt(Math.round(ngnPerUsdc * 100))
  const gross = (usdcRaw * rateKobo) / USDC_UNIT // kobo, rounded down
  const bps = BigInt(feeBps)
  if (side === 'collect_ngn') {
    // Payer covers the fee: round up so the group is never short.
    const fee = (gross * bps + 9999n) / 10000n
    return { rateKobo, ngnAmount: gross + fee, providerFee: fee }
  }
  // Recipient bears the fee: round the fee up, so the payout is never overstated.
  const fee = (gross * bps + 9999n) / 10000n
  return { rateKobo, ngnAmount: gross - fee, providerFee: fee }
}

export const sandboxProvider: PaymentProvider = {
  id: 'sandbox',
  name: 'Sandbox (demo)',
  status: 'sandbox',
  async quote({ side, usdcAmount }) {
    const m = quoteMath(side, usdcAmount, config.sandbox.ngnPerUsdc, config.sandbox.providerFeeBps)
    return {
      provider: 'sandbox',
      isSandbox: true,
      side,
      usdcAmount: usdcAmount.toString(),
      ngnRate: m.rateKobo.toString(),
      rateNote: 'Demo rate for testing only. It is not a market price.',
      ngnAmount: m.ngnAmount.toString(),
      providerFee: m.providerFee.toString(),
      splitpayFee: '0',
      recipientReceivesUsdc: usdcAmount.toString(),
      disclaimer: 'Sandbox: no money moves and nothing is credited to the group.',
    }
  },
  async createCollection({ sequenceId }) {
    return {
      providerRef: `sbx_${sequenceId}`,
      bankName: 'SANDBOX BANK (not real)',
      accountNumber: '0000000000',
      accountName: 'SANDBOX ONLY - DO NOT PAY',
      reference: `SPLIT-${token(4).toUpperCase()}`,
      expiresAt: now() + 3600,
    }
  },
}
