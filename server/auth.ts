import { randomInt } from 'node:crypto'
import type { Router } from './router'
import { config, isProd, STUDIO_ORIGINS } from './config'
import { HttpError, hmac, now, normalizeEmail, parseCookies, rateLimit, safeEqual, sha256, str, token } from './util'
import type { Database } from 'bun:sqlite'

const SESSION_DAYS = 30
const CODE_TTL = 10 * 60
const MAX_ATTEMPTS = 5
export const COOKIE = 'sp_session'

export function userFromRequest(db: Database, req: Request) {
  const t = parseCookies(req.headers.get('cookie'))[COOKIE]
  if (!t) return null
  const row = db
    .query('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .get(sha256(t), now()) as { id: number; email: string } | null
  return row
}

function sessionCookie(value: string, maxAge: number, req: Request): string {
  const secure = isProd || req.headers.get('x-forwarded-proto') === 'https' ? '; Secure' : ''
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
}

export function startSession(db: Database, userId: number, req: Request, headers: Headers) {
  const t = token(32)
  db.query('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    sha256(t),
    userId,
    now() + SESSION_DAYS * 86400,
    now(),
  )
  headers.append('set-cookie', sessionCookie(t, SESSION_DAYS * 86400, req))
}

function upsertUser(db: Database, email: string): number {
  const t = now()
  db.query('INSERT INTO users (email, email_verified_at, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET email_verified_at = COALESCE(email_verified_at, excluded.email_verified_at)').run(email, t, t)
  return (db.query('SELECT id FROM users WHERE email = ?').get(email) as { id: number }).id
}

export function registerAuth(r: Router) {
  r.add('POST', '/auth/email/start', async (c) => {
    const email = normalizeEmail(c.body.email)
    rateLimit(`otp:email:${email}`, 5, 3600)
    rateLimit(`otp:ip:${c.ip}`, 30, 3600)
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    c.db.query('UPDATE otp_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL').run(now(), email)
    c.db.query('INSERT INTO otp_codes (email, code_hash, expires_at) VALUES (?, ?, ?)').run(email, hmac(c.secret, `${email}:${code}`), now() + CODE_TTL)
    await c.mailer.send({
      to: email,
      subject: 'Your SplitPay sign-in code',
      body: `Your SplitPay code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.`,
    })
    return { ok: true, delivery: c.mailer.kind, expiresInSeconds: CODE_TTL }
  })

  r.add('POST', '/auth/email/verify', (c) => {
    const email = normalizeEmail(c.body.email)
    const code = str(c.body.code, 'code', 12)
    rateLimit(`verify:ip:${c.ip}`, 60, 3600)
    const row = c.db
      .query('SELECT id, code_hash, expires_at, attempts FROM otp_codes WHERE email = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1')
      .get(email) as { id: number; code_hash: string; expires_at: number; attempts: number } | null
    if (!row || row.expires_at < now()) throw new HttpError(400, 'code_expired', 'That code has expired. Ask for a new one.')
    if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'too_many_attempts', 'Too many wrong codes. Ask for a new one.')
    c.db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id)
    if (!safeEqual(row.code_hash, hmac(c.secret, `${email}:${code}`))) throw new HttpError(400, 'wrong_code', 'That code is not right.')
    c.db.query('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(now(), row.id)
    const userId = upsertUser(c.db, email)
    startSession(c.db, userId, c.req, c.headers)
    return { user: { id: userId, email } }
  })

  r.add('POST', '/auth/logout', (c) => {
    const t = parseCookies(c.req.headers.get('cookie'))[COOKIE]
    if (t) c.db.query('DELETE FROM sessions WHERE token_hash = ?').run(sha256(t))
    c.headers.append('set-cookie', sessionCookie('', 0, c.req))
    return { ok: true }
  })

  r.add('GET', '/auth/me', (c) => {
    if (!c.user) return { user: null }
    const wallets = c.db.query('SELECT address, kind FROM wallets WHERE user_id = ?').all(c.user.id)
    return { user: c.user, wallets }
  })

  // Development mail sink. Disabled in production and when a real mail provider is configured.
  r.add('GET', '/dev/outbox', (c) => {
    if (!config.devMail) throw new HttpError(404, 'not_found')
    const email = normalizeEmail(c.query.get('email'))
    return { messages: c.db.query('SELECT id, subject, body, created_at FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 10').all(email) }
  })
}

/** Validate a client-suggested link base against what we trust. */
export function resolveLinkBase(req: Request, suggested: unknown): string {
  const fallback = config.appBaseUrl ? config.appBaseUrl.replace(/\/$/, '') : (req.headers.get('origin') ?? '')
  if (typeof suggested !== 'string' || !suggested) return fallback
  try {
    const o = new URL(suggested).origin
    const allowed = new Set([...STUDIO_ORIGINS, req.headers.get('origin') ?? '', config.appBaseUrl ? new URL(config.appBaseUrl).origin : ''])
    return allowed.has(o) ? suggested.replace(/\/$/, '') : fallback
  } catch {
    return fallback
  }
}
