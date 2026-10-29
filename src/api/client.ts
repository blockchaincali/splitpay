export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    })
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.')
  }
  const text = await res.text()
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!res.ok) throw new ApiError(res.status, typeof data.error === 'string' ? data.error : 'error', typeof data.message === 'string' ? data.message : 'Something went wrong.')
  return data as T
}

export const api = {
  get: <T>(p: string) => call<T>('GET', p),
  post: <T>(p: string, b?: unknown) => call<T>('POST', p, b),
  del: <T>(p: string) => call<T>('DELETE', p),
}

export type IntegrationStatusValue = 'live' | 'sandbox' | 'needs-credentials' | 'planned'
export interface Integration {
  id: string
  name: string
  status: IntegrationStatusValue
  note: string
}

export interface ParticipantView {
  id: number
  name: string
  email: string | null
  expectedAmount: string
  status: string
  walletLinked: boolean
  lastReminderAt: number | null
  contributed: string | null
  paid: boolean
}

export interface QuoteView {
  id: string
  provider: string
  isSandbox: boolean
  side: string
  usdcAmount: string
  ngnRate: string
  rateNote: string
  ngnAmount: string
  providerFee: string
  splitpayFee: string
  recipientReceivesUsdc: string
  expiresAt: number
  disclaimer: string
}

export interface IntentView {
  id: string
  groupId: string
  status: string
  isSandbox: boolean
  usdcAmount: string
  ngnAmount: string | null
  quote: QuoteView | null
  instructions: { bankName: string; accountNumber: string; accountName: string; reference: string; expiresAt: number } | null
  settledOnArc: boolean
  countsTowardCollected: boolean
  label: string
  createdAt: number
  updatedAt: number
}
