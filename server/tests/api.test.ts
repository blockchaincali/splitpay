import { beforeEach, describe, expect, test } from 'bun:test'
import { client, GROUP_ID, linkWallet, makeEnv, metaFor, putGroup, signIn } from './helpers'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

let env: ReturnType<typeof makeEnv>
beforeEach(() => {
  env = makeEnv()
})

describe('email sign-in', () => {
  test('start then verify creates a session and /auth/me returns the user', async () => {
    const c = client(env.app)
    const res = await signIn(env, c, 'Ada@Example.com')
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('ada@example.com')
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
    expect(res.headers.get('set-cookie')).toContain('SameSite=Lax')
    expect((await c.get('/auth/me')).body.user.email).toBe('ada@example.com')
  })
  test('codes are stored hashed, never in plain text', async () => {
    const c = client(env.app)
    await c.post('/auth/email/start', { email: 'a@b.co' })
    const mail = env.db.query('SELECT body FROM outbox').get() as { body: string }
    const code = /(\d{6})/.exec(mail.body)![1]
    const rows = JSON.stringify(env.db.query('SELECT * FROM otp_codes').all())
    expect(rows).not.toContain(code)
  })
  test('wrong code is rejected, and 5 wrong attempts lock the code', async () => {
    const c = client(env.app)
    await c.post('/auth/email/start', { email: 'a@b.co' })
    for (let i = 0; i < 5; i++) expect((await c.post('/auth/email/verify', { email: 'a@b.co', code: '000000' })).status).toBe(400)
    const mail = env.db.query('SELECT body FROM outbox').get() as { body: string }
    const real = /(\d{6})/.exec(mail.body)![1]
    expect((await c.post('/auth/email/verify', { email: 'a@b.co', code: real })).status).toBe(429)
  })
  test('expired code is rejected', async () => {
    const c = client(env.app)
    await c.post('/auth/email/start', { email: 'a@b.co' })
    env.db.query('UPDATE otp_codes SET expires_at = 1').run()
    const mail = env.db.query('SELECT body FROM outbox').get() as { body: string }
    expect((await c.post('/auth/email/verify', { email: 'a@b.co', code: /(\d{6})/.exec(mail.body)![1] })).body.error).toBe('code_expired')
  })
  test('a code works once', async () => {
    const c = client(env.app)
    await signIn(env, c, 'a@b.co')
    const mail = env.db.query('SELECT body FROM outbox').get() as { body: string }
    const again = await client(env.app).post('/auth/email/verify', { email: 'a@b.co', code: /(\d{6})/.exec(mail.body)![1] })
    expect(again.status).toBe(400)
  })
  test('start is rate limited per email', async () => {
    const c = client(env.app)
    for (let i = 0; i < 5; i++) expect((await c.post('/auth/email/start', { email: 'a@b.co' })).status).toBe(200)
    expect((await c.post('/auth/email/start', { email: 'a@b.co' })).status).toBe(429)
  })
  test('logout ends the session; non-JSON posts are refused', async () => {
    const c = client(env.app)
    await signIn(env, c, 'a@b.co')
    await c.post('/auth/logout')
    expect((await c.get('/auth/me')).body.user).toBeNull()
    const res = await c.raw(new Request('http://test.local/auth/logout', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' }))
    expect(res.status).toBe(415)
  })
  test('invalid email is rejected; Google sign-in reports it needs credentials', async () => {
    const c = client(env.app)
    expect((await c.post('/auth/email/start', { email: 'nope' })).body.error).toBe('invalid_email')
    expect((await c.get('/auth/google/start')).status).toBe(501)
  })
  test('protected routes need a session', async () => {
    expect((await client(env.app).get('/groups')).status).toBe(401)
  })
})

describe('wallet linking', () => {
  test('a signed challenge links the wallet', async () => {
    const c = client(env.app)
    await signIn(env, c, 'a@b.co')
    const { account, res } = await linkWallet(c)
    expect(res.status).toBe(200)
    expect((await c.get('/wallets')).body.wallets[0].address).toBe(account.address)
  })
  test('a signature from a different key is refused', async () => {
    const c = client(env.app)
    await signIn(env, c, 'a@b.co')
    const claimed = privateKeyToAccount(generatePrivateKey())
    const attacker = privateKeyToAccount(generatePrivateKey())
    const ch = await c.post('/wallets/challenge', { address: claimed.address })
    const signature = await attacker.signMessage({ message: ch.body.message })
    expect((await c.post('/wallets/link', { address: claimed.address, signature })).body.error).toBe('bad_signature')
  })
  test('a wallet cannot be linked to two accounts', async () => {
    const a = client(env.app, '2.2.2.2')
    const b = client(env.app, '3.3.3.3')
    await signIn(env, a, 'a@b.co')
    await signIn(env, b, 'b@b.co')
    const key = generatePrivateKey()
    await linkWallet(a, key)
    expect((await linkWallet(b, key)).res.status).toBe(409)
  })
  test('challenges cannot be replayed', async () => {
    const c = client(env.app)
    await signIn(env, c, 'a@b.co')
    const account = privateKeyToAccount(generatePrivateKey())
    const ch = await c.post('/wallets/challenge', { address: account.address })
    const signature = await account.signMessage({ message: ch.body.message })
    expect((await c.post('/wallets/link', { address: account.address, signature })).status).toBe(200)
    expect((await c.post('/wallets/link', { address: account.address, signature })).status).toBe(400)
  })
})

describe('group index', () => {
  async function setup() {
    const c = client(env.app)
    await signIn(env, c, 'org@b.co')
    const { account } = await linkWallet(c)
    const meta = metaFor()
    putGroup(env, account.address, meta.hash)
    return { c, account, meta }
  }
  test('saves a group that exists on Arc, created by a linked wallet, with matching details', async () => {
    const { c, meta } = await setup()
    expect((await c.post('/groups', { groupId: GROUP_ID, metaText: meta.text, block: '123' })).status).toBe(200)
    const list = (await c.get('/groups')).body
    expect(list.owned[0].title).toBe('Cabin')
    expect(list.owned[0].path).toContain('&b=123')
  })
  test('refuses a group that is not on Arc', async () => {
    const { c, meta } = await setup()
    env.chain.groups.clear()
    expect((await c.post('/groups', { groupId: GROUP_ID, metaText: meta.text, block: '1' })).body.error).toBe('group_not_on_chain')
  })
  test('refuses when the creator wallet is not linked to the account', async () => {
    const c = client(env.app)
    await signIn(env, c, 'x@b.co')
    const meta = metaFor()
    putGroup(env, privateKeyToAccount(generatePrivateKey()).address, meta.hash)
    expect((await c.post('/groups', { groupId: GROUP_ID, metaText: meta.text, block: '1' })).body.error).toBe('wallet_not_linked')
  })
  test('refuses details that do not match the onchain hash', async () => {
    const { c } = await setup()
    expect((await c.post('/groups', { groupId: GROUP_ID, metaText: metaFor('Evil').text, block: '1' })).body.error).toBe('meta_mismatch')
  })
  test('saving twice is idempotent; another account cannot take it', async () => {
    const { c, meta } = await setup()
    await c.post('/groups', { groupId: GROUP_ID, metaText: meta.text, block: '1' })
    expect((await c.post('/groups', { groupId: GROUP_ID, metaText: meta.text, block: '1' })).body.existing).toBe(true)
    const other = client(env.app, '9.9.9.9')
    await signIn(env, other, 'o@b.co')
    expect((await other.post('/groups', { groupId: GROUP_ID, metaText: meta.text, block: '1' })).status).toBe(409)
    expect((await other.get(`/groups/${GROUP_ID}`)).status).toBe(404)
  })
})

describe('participants, invites and reminders', () => {
  async function setup() {
    const org = client(env.app, '5.5.5.5')
    await signIn(env, org, 'org@b.co')
    const { account } = await linkWallet(org)
    const meta = metaFor()
    putGroup(env, account.address, meta.hash)
    await org.post('/groups', { groupId: GROUP_ID, metaText: meta.text, block: '77' })
    return { org }
  }
  const invite = (org: ReturnType<typeof client>, body: object) => org.post(`/groups/${GROUP_ID}/participants`, body)

  test('invite tokens are single-person, stored hashed, and shown once', async () => {
    const { org } = await setup()
    const res = await invite(org, { name: 'Amina', email: 'amina@b.co', expectedAmount: '250000' }, )
    expect(res.status).toBe(200)
    const tokenValue = res.body.invitePath.replace('/join/', '')
    expect(JSON.stringify(env.db.query('SELECT * FROM participants').all())).not.toContain(tokenValue)
    expect(env.db.query('SELECT body FROM outbox WHERE to_email = ?').get('amina@b.co')).toBeTruthy()
    const view = await client(env.app).get(`/invites/${tokenValue}`)
    expect(view.body.participantName).toBe('Amina')
    expect(view.body.groupPath).toContain(`/g/${GROUP_ID}`)
    expect(JSON.stringify(view.body)).not.toContain('amina@b.co')
  })
  test('claiming needs a linked wallet and is exclusive', async () => {
    const { org } = await setup()
    const res = await invite(org, { name: 'Amina', expectedAmount: '250000' })
    const t = res.body.invitePath.replace('/join/', '')
    const friend = client(env.app, '6.6.6.6')
    await signIn(env, friend, 'f@b.co')
    expect((await friend.post(`/invites/${t}/claim`, { walletAddress: '0x000000000000000000000000000000000000dEaD' })).body.error).toBe('wallet_not_linked')
    const { account } = await linkWallet(friend)
    expect((await friend.post(`/invites/${t}/claim`, { walletAddress: account.address })).status).toBe(200)
    const thief = client(env.app, '7.7.7.7')
    await signIn(env, thief, 't@b.co')
    const w = await linkWallet(thief)
    expect((await thief.post(`/invites/${t}/claim`, { walletAddress: w.account.address })).status).toBe(409)
    const list = (await friend.get('/groups')).body
    expect(list.joined[0].title).toBe('Cabin')
  })
  test('expired or unknown invites are refused', async () => {
    await setup()
    expect((await client(env.app).get('/invites/nope')).status).toBe(404)
  })
  test('only the owner can manage participants', async () => {
    const { org } = await setup()
    const stranger = client(env.app, '8.8.8.8')
    await signIn(env, stranger, 's@b.co')
    expect((await invite(stranger, { name: 'X', expectedAmount: '1' })).status).toBe(404)
    expect((await invite(org, { name: 'Y', expectedAmount: '0' })).status).toBe(400)
  })
  test('reminders skip paid people, people without email, and repeat sends within 24 hours', async () => {
    const { org } = await setup()
    const mk = async (name: string, email: string | null, amount = '250000') => {
      const res = await invite(org, { name, ...(email ? { email } : {}), expectedAmount: amount })
      return res.body
    }
    const a = await mk('A', 'a@x.co')
    await mk('NoMail', null)
    const paid = await mk('Paid', 'paid@x.co')
    // Paid person joins with a wallet and has contributed enough onchain.
    const pc = client(env.app, '4.4.4.4')
    await signIn(env, pc, 'paidperson@x.co')
    const w = await linkWallet(pc)
    await pc.post(`/invites/${paid.invitePath.replace('/join/', '')}/claim`, { walletAddress: w.account.address })
    env.chain.contributions.set(`${GROUP_ID.toLowerCase()}:${w.account.address.toLowerCase()}`, 250000n)

    const first = (await org.post(`/groups/${GROUP_ID}/reminders`, {})).body.results as { participantId: number; result: string }[]
    const byId = Object.fromEntries(first.map((r) => [r.participantId, r.result]))
    expect(byId[a.participantId]).toBe('sent')
    expect(byId[paid.participantId]).toBe('already_paid')
    expect(Object.values(byId)).toContain('no_email')
    const second = (await org.post(`/groups/${GROUP_ID}/reminders`, {})).body.results as { participantId: number; result: string }[]
    expect(second.find((r) => r.participantId === a.participantId)!.result).toBe('too_soon')
    expect((env.db.query('SELECT COUNT(*) AS n FROM outbox WHERE to_email = ?').get('a@x.co') as { n: number }).n).toBe(2) // invite + one reminder
  })
  test('no reminders after the deadline', async () => {
    const { org } = await setup()
    await invite(org, { name: 'A', email: 'a@x.co', expectedAmount: '1' })
    env.chain.groups.get(GROUP_ID.toLowerCase())!.deadline = 1n
    const res = (await org.post(`/groups/${GROUP_ID}/reminders`, {})).body.results
    expect(res[0].result).toBe('closed')
  })
  test('participant status shows onchain payment, not a server flag', async () => {
    const { org } = await setup()
    const inv = await invite(org, { name: 'P', expectedAmount: '250000' })
    const p = client(env.app, '4.4.4.4')
    await signIn(env, p, 'p@x.co')
    const w = await linkWallet(p)
    await p.post(`/invites/${inv.body.invitePath.replace('/join/', '')}/claim`, { walletAddress: w.account.address })
    expect((await org.get(`/groups/${GROUP_ID}`)).body.participants[0].paid).toBe(false)
    env.chain.contributions.set(`${GROUP_ID.toLowerCase()}:${w.account.address.toLowerCase()}`, 250000n)
    expect((await org.get(`/groups/${GROUP_ID}`)).body.participants[0].paid).toBe(true)
  })
})
