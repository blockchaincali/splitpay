import type { Hex } from 'viem'
import type { Ctx, Router } from './router'
import { requireUser } from './router'
import { HttpError, now, token, sha256 } from './util'
import { config } from './config'
import { sandboxProvider } from './payments/sandbox'
import { verifyWebhook, yellowCardConfigured, yellowCardProvider } from './payments/yellowcard'
import type { CollectionInstructions, PaymentProvider, Quote, ProviderStatus } from './payments/types'

const QUOTE_TTL = 300
const MAX_USDC_RAW = 10_000n * 1_000_000n // 10,000 USDC per payment in this release
const ID_RE = /^0x[0-9a-fA-F]{64}$/

/** Until the Yellow Card sandbox milestone (M5) is complete, every NGN flow uses the sandbox provider. */
export const activeProvider = (): PaymentProvider => sandboxProvider

export interface IntegrationStatus {
  id: string
  name: string
  status: ProviderStatus
  note: string
}

export function integrationStatuses(devMail: boolean): IntegrationStatus[] {
  return [
    { id: 'usdc-arc', name: 'Pay with USDC on Arc', status: 'live', note: 'Unchanged v1 contract. Payments settle directly to the recipient.' },
    { id: 'email-auth', name: 'Email sign-in', status: 'live', note: devMail ? 'Codes appear in the development outbox. Configure a mail provider to email real codes.' : 'Codes are emailed.' },
    { id: 'google-auth', name: 'Google sign-in', status: config.googleClientId && config.googleClientSecret ? 'needs-credentials' : 'needs-credentials', note: config.googleClientId ? 'Configured but not yet verified end to end.' : 'Needs a Google OAuth client ID and secret on the server.' },
    { id: 'embedded-wallet', name: 'SplitPay testnet wallet', status: 'live', note: 'Testnet only. Key is encrypted in your browser with your PIN. Not for real funds.' },
    { id: 'circle-passkey', name: 'Circle passkey wallet', status: 'needs-credentials', note: 'Needs a Circle Console client key for this site.' },
    { id: 'ngn-sandbox', name: 'NGN bank transfer (sandbox)', status: 'sandbox', note: 'No money moves. Demo rate. Never counted as collected.' },
    { id: 'yellowcard', name: 'Yellow Card', status: yellowCardConfigured() ? 'needs-credentials' : 'needs-credentials', note: 'Request signing built to the published scheme. Not run against Yellow Card. Needs KYB onboarding and credentials.' },
    { id: 'circle-onramp', name: 'Circle fiat onramp (App Kit)', status: 'planned', note: 'Needs a Circle API key and a region eligibility check.' },
  ]
}

interface IntentRow {
  id: string
  group_id: string
  user_id: number
  method: string
  status: string
  usdc_amount: string
  local_amount: string | null
  quote_json: string | null
  provider: string
  provider_ref: string | null
  is_sandbox: number
  created_at: number
  updated_at: number
}

function intentView(row: IntentRow) {
  const stored = row.quote_json ? (JSON.parse(row.quote_json) as { quote: Quote; instructions: CollectionInstructions }) : null
  return {
    id: row.id,
    groupId: row.group_id,
    method: row.method,
    status: row.status,
    isSandbox: Boolean(row.is_sandbox),
    usdcAmount: row.usdc_amount,
    ngnAmount: row.local_amount,
    quote: stored?.quote ?? null,
    instructions: stored?.instructions ?? null,
    // Hard-wired: no off-chain payment is ever counted as collected in this release.
    settledOnArc: false,
    countsTowardCollected: false,
    label: row.is_sandbox ? 'Sandbox: no money moved' : 'Pending provider confirmation',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SANDBOX_TRANSITIONS: Record<string, string[]> = {
  awaiting_payment: ['processing', 'failed', 'expired'],
  processing: ['completed_sandbox', 'failed'],
}

export function registerPayments(r: Router) {
  r.add('GET', '/integrations/status', (c) => ({ integrations: integrationStatuses(config.devMail) }))

  r.add('POST', '/quotes', async (c) => {
    requireUser(c)
    const side = c.body.side === 'payout_ngn' ? 'payout_ngn' : 'collect_ngn'
    const amountStr = c.body.usdcAmount
    if (typeof amountStr !== 'string' || !/^\d{1,18}$/.test(amountStr)) throw new HttpError(400, 'invalid_amount', 'Enter an amount.')
    const usdcAmount = BigInt(amountStr)
    if (usdcAmount <= 0n) throw new HttpError(400, 'invalid_amount', 'Enter an amount above zero.')
    if (usdcAmount > MAX_USDC_RAW) throw new HttpError(400, 'amount_too_large', 'That is above the limit for this release.')
    const provider = activeProvider()
    const base = await provider.quote({ side, usdcAmount })
    const quote: Quote = { ...base, id: `q_${token(12)}`, expiresAt: now() + QUOTE_TTL }
    c.db.query('INSERT INTO quotes (id, json, expires_at) VALUES (?, ?, ?)').run(quote.id, JSON.stringify(quote), quote.expiresAt)
    return { quote }
  }, { auth: true })

  r.add('POST', '/payments/intents', async (c) => {
    const user = requireUser(c)
    const groupId = String(c.body.groupId ?? '').toLowerCase()
    if (!ID_RE.test(groupId)) throw new HttpError(400, 'invalid_group')
    const q = c.db.query('SELECT json, expires_at FROM quotes WHERE id = ?').get(String(c.body.quoteId ?? '')) as { json: string; expires_at: number } | null
    if (!q) throw new HttpError(404, 'quote_not_found', 'That quote was not found. Get a new one.')
    if (q.expires_at < now()) throw new HttpError(410, 'quote_expired', 'That quote expired. Get a new one.')
    const quote = JSON.parse(q.json) as Quote
    if (quote.side !== 'collect_ngn') throw new HttpError(400, 'invalid_quote')
    if (!(await c.chain.getGroup(groupId as Hex))) throw new HttpError(404, 'group_not_on_chain', 'That group was not found on Arc.')
    const provider = activeProvider()
    const id = `pi_${token(12)}`
    const instructions = await provider.createCollection({ sequenceId: id, ngnAmountKobo: BigInt(quote.ngnAmount) })
    c.db
      .query('INSERT INTO payment_intents (id, group_id, user_id, method, status, usdc_amount, local_amount, quote_json, provider, provider_ref, is_sandbox, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, groupId, user.id, 'ngn_bank_transfer', 'awaiting_payment', quote.usdcAmount, quote.ngnAmount, JSON.stringify({ quote, instructions }), provider.id, instructions.providerRef, provider.status === 'sandbox' ? 1 : 0, now(), now())
    return { intent: intentView(c.db.query('SELECT * FROM payment_intents WHERE id = ?').get(id) as IntentRow) }
  }, { auth: true })

  r.add('GET', '/payments/intents', (c) => {
    const user = requireUser(c)
    const groupId = (c.query.get('groupId') ?? '').toLowerCase()
    const rows = (groupId
      ? c.db.query('SELECT * FROM payment_intents WHERE user_id = ? AND group_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id, groupId)
      : c.db.query('SELECT * FROM payment_intents WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id)) as IntentRow[]
    return { intents: rows.map(intentView) }
  }, { auth: true })

  // Simulate a provider callback. Only exists for sandbox intents; there is nothing to simulate for a live provider.
  r.add('POST', '/payments/intents/:id/sandbox', (c) => {
    const user = requireUser(c)
    const row = c.db.query('SELECT * FROM payment_intents WHERE id = ? AND user_id = ?').get(c.params.id, user.id) as IntentRow | null
    if (!row) throw new HttpError(404, 'not_found')
    if (!row.is_sandbox) throw new HttpError(400, 'not_sandbox', 'Only sandbox payments can be simulated.')
    const to = String(c.body.to ?? '')
    if (!(SANDBOX_TRANSITIONS[row.status] ?? []).includes(to)) throw new HttpError(400, 'invalid_transition', 'That status change is not allowed.')
    c.db.query('UPDATE payment_intents SET status = ?, updated_at = ? WHERE id = ?').run(to, now(), row.id)
    return { intent: intentView({ ...row, status: to, updated_at: now() }) }
  }, { auth: true })

  r.add('GET', '/groups/:id/intents', (c) => {
    const user = requireUser(c)
    const id = c.params.id.toLowerCase()
    const g = c.db.query('SELECT owner_user_id FROM groups WHERE group_id = ?').get(id) as { owner_user_id: number } | null
    if (!g || g.owner_user_id !== user.id) throw new HttpError(404, 'not_found')
    const rows = c.db.query('SELECT * FROM payment_intents WHERE group_id = ? ORDER BY created_at DESC LIMIT 50').all(id) as IntentRow[]
    return { intents: rows.map(intentView).map(({ quote: _q, instructions: _i, ...rest }) => rest) }
  }, { auth: true })

  // Yellow Card webhook: signature checked, idempotent by event id. Gated on credentials.
  r.add('POST', '/webhooks/yellowcard', (c: Ctx) => {
    if (!yellowCardConfigured()) throw new HttpError(501, 'not_configured', 'Yellow Card is not configured.')
    if (!verifyWebhook(c.raw, c.req.headers.get('x-yc-signature'), config.yellowCard.secretKey)) throw new HttpError(401, 'bad_signature')
    let event: { id?: string; sequenceId?: string; status?: string }
    try {
      event = JSON.parse(c.raw)
    } catch {
      throw new HttpError(400, 'invalid_json')
    }
    const eventId = String(event.id ?? sha256(c.raw))
    const dup = c.db.query('SELECT 1 FROM webhook_events WHERE provider = ? AND event_id = ?').get('yellowcard', eventId)
    if (dup) return { ok: true, duplicate: true }
    c.db.query('INSERT INTO webhook_events (provider, event_id, received_at) VALUES (?, ?, ?)').run('yellowcard', eventId, now())
    // Mapping provider statuses to intents is finished in milestone M5 against Yellow Card's sandbox.
    return { ok: true }
  })
}

export { yellowCardProvider }
