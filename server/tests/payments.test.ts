import { createHash, createHmac } from 'node:crypto'
import { beforeEach, describe, expect, test } from 'bun:test'
import { client, GROUP_ID, makeEnv, metaFor, putGroup, signIn } from './helpers'
import { quoteMath } from '../payments/sandbox'
import { authHeaders, signRequest, verifyWebhook } from '../payments/yellowcard'

let env: ReturnType<typeof makeEnv>
beforeEach(() => {
  env = makeEnv()
})

describe('quote math (sandbox demo rate)', () => {
  test('payer covers the fee and it rounds up so the group is never short', () => {
    const q = quoteMath('collect_ngn', 250_000n, 1500, 100) // 0.25 USDC
    expect(q.ngnAmount - q.providerFee).toBe(37_500n) // 375.00 NGN gross in kobo
    expect(q.providerFee).toBe(375n) // 1%
    expect(q.ngnAmount).toBe(37_875n)
  })
  test('payout side deducts the fee from the recipient', () => {
    const q = quoteMath('payout_ngn', 1_000_000n, 1500, 100)
    expect(q.ngnAmount + q.providerFee).toBe(150_000n)
    expect(q.ngnAmount).toBe(148_500n)
  })
  test('tiny amounts never produce negative values', () => {
    const q = quoteMath('payout_ngn', 1n, 1500, 100)
    expect(q.ngnAmount >= 0n).toBe(true)
  })
})

describe('NGN sandbox flow', () => {
  async function setup() {
    const c = client(env.app)
    await signIn(env, c, 'p@b.co')
    putGroup(env, '0x000000000000000000000000000000000000dEaD', metaFor().hash)
    return c
  }
  test('quote shows rate, fee and recipient amount, labelled as sandbox', async () => {
    const c = await setup()
    const { quote } = (await c.post('/quotes', { side: 'collect_ngn', usdcAmount: '250000' })).body
    expect(quote.isSandbox).toBe(true)
    expect(quote.recipientReceivesUsdc).toBe('250000')
    expect(quote.splitpayFee).toBe('0')
    expect(quote.disclaimer).toContain('no money moves')
    expect(quote.rateNote).toContain('not a market price')
  })
  test('intent lifecycle never settles on Arc or counts toward collected', async () => {
    const c = await setup()
    const { quote } = (await c.post('/quotes', { side: 'collect_ngn', usdcAmount: '250000' })).body
    const { intent } = (await c.post('/payments/intents', { groupId: GROUP_ID, quoteId: quote.id })).body
    expect(intent.status).toBe('awaiting_payment')
    expect(intent.instructions.accountName).toContain('DO NOT PAY')
    for (const to of ['processing', 'completed_sandbox']) {
      const r = await c.post(`/payments/intents/${intent.id}/sandbox`, { to })
      expect(r.body.intent.status).toBe(to)
      expect(r.body.intent.settledOnArc).toBe(false)
      expect(r.body.intent.countsTowardCollected).toBe(false)
    }
    expect((await c.post(`/payments/intents/${intent.id}/sandbox`, { to: 'processing' })).status).toBe(400)
  })
  test('invalid transitions, expired quotes, unknown groups and huge amounts are refused', async () => {
    const c = await setup()
    const { quote } = (await c.post('/quotes', { side: 'collect_ngn', usdcAmount: '250000' })).body
    const { intent } = (await c.post('/payments/intents', { groupId: GROUP_ID, quoteId: quote.id })).body
    expect((await c.post(`/payments/intents/${intent.id}/sandbox`, { to: 'completed_sandbox' })).status).toBe(400)
    env.db.query('UPDATE quotes SET expires_at = 1').run()
    expect((await c.post('/payments/intents', { groupId: GROUP_ID, quoteId: quote.id })).status).toBe(410)
    env.chain.groups.clear()
    const fresh = (await c.post('/quotes', { side: 'collect_ngn', usdcAmount: '250000' })).body.quote
    expect((await c.post('/payments/intents', { groupId: GROUP_ID, quoteId: fresh.id })).body.error).toBe('group_not_on_chain')
    expect((await c.post('/quotes', { usdcAmount: '99999999999999' })).status).toBe(400)
    expect((await c.post('/quotes', { usdcAmount: '0' })).status).toBe(400)
  })
  test("one user cannot move another user's intent", async () => {
    const c = await setup()
    const { quote } = (await c.post('/quotes', { side: 'collect_ngn', usdcAmount: '250000' })).body
    const { intent } = (await c.post('/payments/intents', { groupId: GROUP_ID, quoteId: quote.id })).body
    const other = client(env.app, '2.2.2.2')
    await signIn(env, other, 'o@b.co')
    expect((await other.post(`/payments/intents/${intent.id}/sandbox`, { to: 'processing' })).status).toBe(404)
  })
  test('integration status is honest', async () => {
    const list = (await client(env.app).get('/integrations/status')).body.integrations as { id: string; status: string }[]
    const s = Object.fromEntries(list.map((i) => [i.id, i.status]))
    expect(s['usdc-arc']).toBe('live')
    expect(s['ngn-sandbox']).toBe('sandbox')
    expect(s['yellowcard']).toBe('needs-credentials')
    expect(s['circle-passkey']).toBe('needs-credentials')
    expect(Object.values(s)).not.toContain('live-ngn')
  })
})

describe('Yellow Card adapter (documented signing scheme)', () => {
  const secretKey = 'test-secret'
  const timestamp = '2022-01-11T15:48:37.424Z'
  test('GET signature = base64(HMAC-SHA256(secret, timestamp + path + METHOD))', () => {
    const expected = createHmac('sha256', secretKey).update(`${timestamp}/business/channelsGET`).digest('base64')
    expect(signRequest({ secretKey, method: 'get', path: '/business/channels', timestamp })).toBe(expected)
  })
  test('POST signature includes base64(sha256(body))', () => {
    const body = '{"a":1}'
    const bodyHash = createHash('sha256').update(body).digest('base64')
    const expected = createHmac('sha256', secretKey).update(`${timestamp}/business/receivePOST${bodyHash}`).digest('base64')
    expect(signRequest({ secretKey, method: 'POST', path: '/business/receive', body, timestamp })).toBe(expected)
  })
  test('headers use the YcHmacV1 scheme and the same timestamp', () => {
    const h = authHeaders({ apiKey: 'key', secretKey, method: 'GET', path: '/business/rates', timestamp })
    expect(h.Authorization.startsWith('YcHmacV1 key:')).toBe(true)
    expect(h['X-YC-Timestamp']).toBe(timestamp)
  })
  test('webhook signature check accepts the right signature and rejects others', () => {
    const body = '{"id":"evt_1","status":"complete"}'
    const good = createHmac('sha256', secretKey).update(body).digest('base64')
    expect(verifyWebhook(body, good, secretKey)).toBe(true)
    expect(verifyWebhook(body + ' ', good, secretKey)).toBe(false)
    expect(verifyWebhook(body, null, secretKey)).toBe(false)
    expect(verifyWebhook(body, good, '')).toBe(false)
  })
  test('webhook endpoint is off until credentials exist', async () => {
    const res = await client(env.app).raw(new Request('http://test.local/webhooks/yellowcard', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(501)
  })
})
