import { createHash, createHmac } from 'node:crypto'
import { config } from '../config'
import type { PaymentProvider } from './types'
import { safeEqual } from '../util'

/**
 * Yellow Card adapter.
 *
 * Built from Yellow Card's published documentation (docs.yellowcard.engineering):
 *  - Authorization: `YcHmacV1 {apiKey}:{signature}` plus `X-YC-Timestamp` (ISO 8601)
 *  - message = timestamp + path (including /business) + METHOD + (POST/PUT only) base64(sha256(body))
 *  - signature = base64(HMAC-SHA256(secretKey, message))
 *  - webhooks: `X-YC-Signature` = base64(HMAC-SHA256(secretKey, rawBody))
 *
 * STATUS: needs-credentials. The signing and webhook checks are unit tested against the documented
 * format. Nothing here has been run against Yellow Card. Production use also needs Yellow Card KYB
 * onboarding, static IP allowlisting, and per-transaction KYC metadata for the payer.
 */
export function signRequest(args: { secretKey: string; method: string; path: string; body?: string; timestamp: string }): string {
  const method = args.method.toUpperCase()
  let message = args.timestamp + args.path + method
  if ((method === 'POST' || method === 'PUT') && args.body !== undefined) {
    message += createHash('sha256').update(args.body).digest('base64')
  }
  return createHmac('sha256', args.secretKey).update(message).digest('base64')
}

export function authHeaders(args: { apiKey: string; secretKey: string; method: string; path: string; body?: string; timestamp?: string }) {
  const timestamp = args.timestamp ?? new Date().toISOString()
  const signature = signRequest({ ...args, timestamp })
  return { Authorization: `YcHmacV1 ${args.apiKey}:${signature}`, 'X-YC-Timestamp': timestamp, 'content-type': 'application/json' }
}

export function verifyWebhook(rawBody: string, headerSignature: string | null, secretKey: string): boolean {
  if (!headerSignature || !secretKey) return false
  const expected = createHmac('sha256', secretKey).update(rawBody).digest('base64')
  return safeEqual(expected, headerSignature)
}

export const yellowCardConfigured = () => Boolean(config.yellowCard.apiKey && config.yellowCard.secretKey)

async function ycFetch(method: 'GET' | 'POST', path: string, body?: unknown) {
  const base = new URL(config.yellowCard.baseUrl)
  const fullPath = `${base.pathname.replace(/\/$/, '')}${path}` // e.g. /business/channels
  const raw = body === undefined ? undefined : JSON.stringify(body)
  const res = await fetch(`${base.origin}${fullPath}`, {
    method,
    headers: authHeaders({ apiKey: config.yellowCard.apiKey, secretKey: config.yellowCard.secretKey, method, path: fullPath.split('?')[0], body: raw }),
    body: raw,
  })
  if (!res.ok) throw new Error(`Yellow Card returned ${res.status}`)
  return res.json() as Promise<unknown>
}

export const yellowCardProvider: PaymentProvider = {
  id: 'yellowcard',
  name: 'Yellow Card',
  status: 'needs-credentials',
  async quote() {
    // Rates come from GET /business/rates. Mapping to the quote shape is finished during the Yellow Card sandbox milestone (M5).
    if (!yellowCardConfigured()) throw new Error('Yellow Card credentials are not configured.')
    await ycFetch('GET', '/rates')
    throw new Error('Yellow Card quote mapping is not implemented yet.')
  },
  async createCollection() {
    if (!yellowCardConfigured()) throw new Error('Yellow Card credentials are not configured.')
    throw new Error('Yellow Card collections are not implemented yet (milestone M5).')
  },
}

export const listChannels = (country = 'NG') => ycFetch('GET', `/channels?country=${encodeURIComponent(country)}`)
