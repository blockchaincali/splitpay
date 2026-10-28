/** Honest provider status. Anything not `live` must be labelled in the UI. */
export type ProviderStatus = 'live' | 'sandbox' | 'needs-credentials' | 'planned'

export type QuoteSide = 'collect_ngn' | 'payout_ngn'

export interface Quote {
  id: string
  provider: string
  isSandbox: boolean
  side: QuoteSide
  /** USDC amount in 6-decimal ERC-20 units (string, to survive JSON) */
  usdcAmount: string
  /** NGN in kobo (2 decimals) */
  ngnRate: string
  rateNote: string
  /** collect_ngn: what the payer sends, in kobo. payout_ngn: what the recipient gets, in kobo. */
  ngnAmount: string
  /** Provider fee in kobo */
  providerFee: string
  splitpayFee: '0'
  /** USDC the group is credited or the recipient is debited, raw units (the same as usdcAmount) */
  recipientReceivesUsdc: string
  expiresAt: number
  disclaimer: string
}

export interface CollectionInstructions {
  providerRef: string
  bankName: string
  accountNumber: string
  accountName: string
  reference: string
  expiresAt: number
}

export interface PaymentProvider {
  id: string
  name: string
  status: ProviderStatus
  quote(input: { side: QuoteSide; usdcAmount: bigint }): Promise<Omit<Quote, 'id' | 'expiresAt'>>
  createCollection(input: { sequenceId: string; ngnAmountKobo: bigint }): Promise<CollectionInstructions>
}
