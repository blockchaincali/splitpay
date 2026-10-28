import { isAddress, verifyMessage, getAddress, type Hex } from 'viem'
import type { Router } from './router'
import { requireUser } from './router'
import { config } from './config'
import { HttpError, now, rateLimit, token } from './util'

export function challengeMessage(email: string, address: string, nonce: string, issuedAt: string): string {
  return [
    'SplitPay wants to link this wallet to your account.',
    '',
    `Account: ${email}`,
    `Wallet: ${address}`,
    `Chain: Arc Testnet (${config.chainId})`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
    '',
    'Signing this message does not send a transaction and costs nothing.',
  ].join('\n')
}

export function registerWallets(r: Router) {
  r.add('POST', '/wallets/challenge', (c) => {
    const user = requireUser(c)
    rateLimit(`wc:${user.id}`, 20, 600)
    const raw = c.body.address
    if (typeof raw !== 'string' || !isAddress(raw)) throw new HttpError(400, 'invalid_address', 'Enter a valid wallet address.')
    const address = getAddress(raw)
    const message = challengeMessage(user.email, address, token(16), new Date().toISOString())
    c.db.query('INSERT INTO wallet_challenges (user_id, address, message, expires_at) VALUES (?, ?, ?, ?)').run(user.id, address, message, now() + 600)
    return { message }
  }, { auth: true })

  r.add('POST', '/wallets/link', async (c) => {
    const user = requireUser(c)
    const raw = c.body.address
    const signature = c.body.signature
    const kind = c.body.kind === 'embedded' ? 'embedded' : 'external'
    if (typeof raw !== 'string' || !isAddress(raw) || typeof signature !== 'string') throw new HttpError(400, 'invalid_request')
    const address = getAddress(raw)
    const ch = c.db
      .query('SELECT id, message, expires_at FROM wallet_challenges WHERE user_id = ? AND address = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1')
      .get(user.id, address) as { id: number; message: string; expires_at: number } | null
    if (!ch || ch.expires_at < now()) throw new HttpError(400, 'challenge_expired', 'That request expired. Start again.')
    const ok = await verifyMessage({ address, message: ch.message, signature: signature as Hex }).catch(() => false)
    if (!ok) throw new HttpError(400, 'bad_signature', 'The signature does not match this wallet.')
    c.db.query('UPDATE wallet_challenges SET used_at = ? WHERE id = ?').run(now(), ch.id)
    const owner = c.db.query('SELECT user_id FROM wallets WHERE address = ?').get(address) as { user_id: number } | null
    if (owner && owner.user_id !== user.id) throw new HttpError(409, 'wallet_taken', 'This wallet is already linked to another account.')
    if (!owner) c.db.query('INSERT INTO wallets (user_id, address, kind, verified_at) VALUES (?, ?, ?, ?)').run(user.id, address, kind, now())
    return { wallet: { address, kind } }
  }, { auth: true })

  r.add('GET', '/wallets', (c) => {
    const user = requireUser(c)
    return { wallets: c.db.query('SELECT address, kind, verified_at FROM wallets WHERE user_id = ? ORDER BY id').all(user.id) }
  }, { auth: true })
}

export const userOwnsWallet = (db: import('bun:sqlite').Database, userId: number, address: string): boolean =>
  Boolean(db.query('SELECT 1 FROM wallets WHERE user_id = ? AND lower(address) = lower(?)').get(userId, address))
