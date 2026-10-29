import { keccak256, toBytes, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createApp } from '../app'
import { openDb } from '../db'
import { devMailer } from '../mail'
import type { ChainReader, OnchainGroup } from '../chain'
import { resetRateLimits } from '../util'

export function fakeChain() {
  const groups = new Map<string, OnchainGroup>()
  const contributions = new Map<string, bigint>()
  const reader: ChainReader = {
    async getGroup(id) {
      return groups.get(id.toLowerCase()) ?? null
    },
    async contributionOf(id, wallet) {
      return contributions.get(`${id.toLowerCase()}:${wallet.toLowerCase()}`) ?? 0n
    },
  }
  return { reader, groups, contributions }
}

export function makeEnv() {
  resetRateLimits()
  const db = openDb(':memory:')
  const chain = fakeChain()
  const app = createApp({ db, mailer: devMailer(db), chain: chain.reader })
  return { db, chain, app }
}

/** Tiny HTTP client with a cookie jar. */
export function client(app: (req: Request, ip?: string) => Promise<Response>, ip = '1.1.1.1') {
  let cookie = ''
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app(
      new Request(`http://test.local${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      }),
      ip,
    )
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0]
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
  }
  return {
    get: (p: string) => call('GET', p),
    post: (p: string, b?: unknown, h?: Record<string, string>) => call('POST', p, b, h),
    del: (p: string) => call('DELETE', p),
    raw: (req: Request) => app(req, ip),
  }
}

export type TestClient = ReturnType<typeof client>

export async function signIn(env: ReturnType<typeof makeEnv>, c: TestClient, email: string) {
  await c.post('/auth/email/start', { email })
  const row = env.db.query('SELECT body FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 1').get(email.toLowerCase()) as { body: string }
  const code = /code is (\d{6})/.exec(row.body)![1]
  return c.post('/auth/email/verify', { email, code })
}

export async function linkWallet(c: TestClient, key = generatePrivateKey()) {
  const account = privateKeyToAccount(key)
  const ch = await c.post('/wallets/challenge', { address: account.address })
  const signature = await account.signMessage({ message: ch.body.message })
  const res = await c.post('/wallets/link', { address: account.address, signature })
  return { account, res }
}

export const GROUP_ID = ('0x' + 'ab'.repeat(32)) as Hex

export function metaFor(title = 'Cabin') {
  const text = JSON.stringify({ v: 1, t: title, d: 'Weekend', r: '0x000000000000000000000000000000000000dead', g: '1000000', e: 1900000000, m: 'equal', n: 4 })
  return { text, hash: keccak256(toBytes(text)) }
}

export function putGroup(env: ReturnType<typeof makeEnv>, creator: Address, hash: Hex, id: Hex = GROUP_ID, deadline = BigInt(Math.floor(Date.now() / 1000) + 86400)) {
  env.chain.groups.set(id.toLowerCase(), {
    creator,
    recipient: '0x000000000000000000000000000000000000dEaD',
    target: 1_000_000n,
    deadline,
    collected: 0n,
    metadataHash: hash,
  })
}
