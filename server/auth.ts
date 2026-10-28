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

  // --- Google sign-in: gated on credentials. Implemented from Google's documented OAuth 2.0 code flow; not exercised without a client ID.
  r.add('GET', '/auth/google/start', (c) => {
    if (!config.googleClientId || !config.googleClientSecret)
      throw new HttpError(501, 'not_configured', 'Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.')
    const state = token(16)
    const redirect = `${redirectBase(c.req)}/api/auth/google/callback`
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email',
      state,
      prompt: 'select_account',
    }).toString()
    const res = new Response(null, { status: 302, headers: { location: url.toString() } })
    res.headers.append('set-cookie', `sp_oauth=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${isProd ? '; Secure' : ''}`)
    return res
  })

  r.add('GET', '/auth/google/callback', async (c) => {
    if (!config.googleClientId || !config.googleClientSecret) throw new HttpError(501, 'not_configured', 'Google sign-in is not configured.')
    const state = c.query.get('state') ?? ''
    const cookie = parseCookies(c.req.headers.get('cookie')).sp_oauth ?? ''
    const code = c.query.get('code')
    if (!code || !state || !safeEqual(state, cookie)) throw new HttpError(400, 'bad_state', 'Sign-in could not be verified. Please try again.')
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: `${redirectBase(c.req)}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) throw new HttpError(400, 'google_failed', 'Google sign-in failed.')
    const { id_token } = (await tokenRes.json()) as { id_token?: string }
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token ?? '')}`)
    const claims = (await info.json()) as { aud?: string; email?: string; email_verified?: string | boolean }
    if (!info.ok || claims.aud !== config.googleClientId || !claims.email || String(claims.email_verified) !== 'true')
      throw new HttpError(400, 'google_failed', 'Google sign-in failed.')
    const userId = upsertUser(c.db, normalizeEmail(claims.email))
    startSession(c.db, userId, c.req, c.headers)
    const res = new Response(null, { status: 302, headers: { location: '/' } })
    c.headers.forEach((v, k) => res.headers.append(k, v))
    return res
  })

  // Development mail sink. Disabled in production and when a real mail provider is configured.
  r.add('GET', '/dev/outbox', (c) => {
    if (!config.devMail) throw new HttpError(404, 'not_found')
    const email = normalizeEmail(c.query.get('email'))
    return { messages: c.db.query('SELECT id, subject, body, created_at FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 10').all(email) }
  })
}

/** Base URL for OAuth redirects: configured value, else the request origin. */
function redirectBase(req: Request): string {
  if (config.appBaseUrl) return config.appBaseUrl.replace(/\/$/, '')
  return new URL(req.url).origin
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
