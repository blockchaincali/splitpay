import type { Database } from 'bun:sqlite'
import type { Mailer } from './mail'
import type { ChainReader } from './chain'
import { HttpError, json } from './util'

export interface User {
  id: number
  email: string
}

export interface Ctx {
  db: Database
  mailer: Mailer
  chain: ChainReader
  secret: string
  req: Request
  ip: string
  params: Record<string, string>
  query: URLSearchParams
  body: Record<string, unknown>
  /** Raw request body text (needed to verify webhook signatures). */
  raw: string
  user: User | null
  /** Extra headers to attach to the response (for example Set-Cookie). */
  headers: Headers
}

export type Handler = (c: Ctx) => Promise<unknown | Response> | unknown | Response

interface Route {
  method: string
  parts: string[]
  handler: Handler
  auth: boolean
}

export class Router {
  private routes: Route[] = []
  add(method: string, pattern: string, handler: Handler, opts: { auth?: boolean } = {}) {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler, auth: opts.auth ?? false })
  }
  match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    const p = path.split('/').filter(Boolean)
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== p.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < p.length; i++) {
        if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(p[i])
        else if (r.parts[i] !== p[i]) {
          ok = false
          break
        }
      }
      if (ok) return { route: r, params }
    }
    return null
  }
}

export function toResponse(result: unknown, headers: Headers): Response {
  if (result instanceof Response) return result
  const res = json(result ?? { ok: true })
  headers.forEach((v, k) => res.headers.append(k, v))
  return res
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    const res = json({ error: e.code, message: e.message, ...(e.extra ?? {}) }, { status: e.status })
    if (e.status === 429 && typeof e.extra?.retryAfter === 'number') res.headers.set('retry-after', String(e.extra.retryAfter))
    return res
  }
  console.error('[server] unexpected error:', (e as Error)?.message)
  return json({ error: 'server_error', message: 'Something went wrong on our side.' }, { status: 500 })
}

export const requireUser = (c: Ctx): User => {
  if (!c.user) throw new HttpError(401, 'unauthenticated', 'Please sign in.')
  return c.user
}
