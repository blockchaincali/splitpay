import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { createApp } from './app'
import { arcReader } from './chain'
import { config, isProd } from './config'
import { openDb } from './db'
import { pickMailer } from './mail'

const db = openDb()
const handle = createApp({ db, mailer: pickMailer(db), chain: arcReader() })
const DIST = join(import.meta.dir, '..', 'dist')

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'SAMEORIGIN',
}

async function respond(req: Request, ip: string): Promise<Response> {
  const url = new URL(req.url)
  // In development Vite strips /api before proxying; in production this one process serves both.
  if (url.pathname.startsWith('/api/')) {
    const stripped = new URL(req.url)
    stripped.pathname = url.pathname.slice(4)
    return handle(new Request(stripped, req), ip)
  }
  if (isProd && existsSync(DIST)) {
    const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
    const file = Bun.file(join(DIST, safe))
    if (safe !== '/' && (await file.exists())) return new Response(file, { headers: SECURITY_HEADERS })
    return new Response(Bun.file(join(DIST, 'index.html')), { headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8' } })
  }
  return new Response('Not found', { status: 404 })
}

const server = Bun.serve({
  port: config.port,
  hostname: isProd ? '0.0.0.0' : '127.0.0.1',
  fetch: (req, srv) => respond(req, srv.requestIP(req)?.address ?? req.headers.get('x-forwarded-for') ?? 'unknown'),
})
console.log(`[server] SplitPay on port ${server.port} (${isProd ? 'production' : 'development'}, ${config.devMail ? 'dev mail outbox' : 'real mail'})`)

// Checkpoint the WAL on shutdown so the database file is clean.
const shutdown = () => {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
