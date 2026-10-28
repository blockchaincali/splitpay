import type { Database } from 'bun:sqlite'
import { Router, errorResponse, toResponse, type Ctx } from './router'
import type { Mailer } from './mail'
import type { ChainReader } from './chain'
import { registerAuth, userFromRequest } from './auth'
import { registerWallets } from './wallets'
import { registerGroups } from './groups'
import { registerPayments } from './payments'
import { HttpError, rateLimit } from './util'
import { serverSecret } from './db'

export interface AppDeps {
  db: Database
  mailer: Mailer
  chain: ChainReader
}

export function createApp(deps: AppDeps) {
  const router = new Router()
  registerAuth(router)
  registerWallets(router)
  registerGroups(router)
  registerPayments(router)
  const secret = serverSecret(deps.db)

  return async function handle(req: Request, ip = 'unknown'): Promise<Response> {
    try {
      const url = new URL(req.url)
      const method = req.method.toUpperCase()
      const matched = router.match(method, url.pathname)
      if (!matched) throw new HttpError(404, 'not_found', 'Not found.')
      const isWebhook = url.pathname.startsWith('/webhooks/')
      const mutating = method !== 'GET' && method !== 'HEAD'
      // JSON-only mutations (plus SameSite=Lax cookies) block cross-site form posts.
      if (mutating && !isWebhook && !(req.headers.get('content-type') ?? '').includes('application/json'))
        throw new HttpError(415, 'json_required', 'Requests must be JSON.')
      rateLimit(`ip:${ip}`, 600, 60)
      const raw = mutating ? await req.text() : ''
      let body: Record<string, unknown> = {}
      if (raw && !isWebhook) {
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
          else throw new Error('not an object')
        } catch {
          throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.')
        }
      }
      const user = userFromRequest(deps.db, req)
      if (matched.route.auth && !user) throw new HttpError(401, 'unauthenticated', 'Please sign in.')
      const ctx: Ctx = {
        ...deps,
        secret,
        req,
        ip,
        params: matched.params,
        query: url.searchParams,
        body,
        raw,
        user,
        headers: new Headers(),
      }
      return toResponse(await matched.route.handler(ctx), ctx.headers)
    } catch (e) {
      return errorResponse(e)
    }
  }
}
