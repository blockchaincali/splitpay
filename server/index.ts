import { createApp } from './app'
import { arcReader } from './chain'
import { config } from './config'
import { openDb } from './db'
import { pickMailer } from './mail'

const db = openDb()
const handle = createApp({ db, mailer: pickMailer(db), chain: arcReader() })

const server = Bun.serve({
  port: config.port,
  hostname: '127.0.0.1',
  fetch: (req, srv) => handle(req, srv.requestIP(req)?.address ?? req.headers.get('x-forwarded-for') ?? 'unknown'),
})
console.log(`[server] SplitPay API on http://127.0.0.1:${server.port} (${config.devMail ? 'dev mail outbox' : 'real mail'})`)

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
