import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code)
  }
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(init.headers ?? {}) },
  })

export const now = () => Math.floor(Date.now() / 1000)
export const token = (bytes = 32) => randomBytes(bytes).toString('base64url')
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')
export const hmac = (secret: string, v: string) => createHmac('sha256', secret).update(v).digest('hex')

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const normalizeEmail = (e: unknown): string => {
  if (typeof e !== 'string') throw new HttpError(400, 'invalid_email', 'Enter a valid email address.')
  const v = e.trim().toLowerCase()
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new HttpError(400, 'invalid_email', 'Enter a valid email address.')
  return v
}

export function str(v: unknown, name: string, max: number, opts: { optional?: boolean } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return ''
    throw new HttpError(400, 'invalid_' + name, `${name} is required.`)
  }
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'invalid_' + name, `${name} is invalid.`)
  return v.trim()
}

/** Fixed-window in-memory limiter. Fine for one server process; use a shared store when scaling out. */
const hits = new Map<string, { n: number; reset: number }>()
export function rateLimit(key: string, max: number, windowSec: number) {
  const t = now()
  const h = hits.get(key)
  if (!h || h.reset <= t) {
    hits.set(key, { n: 1, reset: t + windowSec })
    return
  }
  h.n += 1
  if (h.n > max) throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait and try again.', { retryAfter: h.reset - t })
}
export const resetRateLimits = () => hits.clear()

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
