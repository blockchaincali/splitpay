import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { config } from './config'

/**
 * SQLite in WAL mode for development. One process owns this file.
 * For production use Postgres; the schema below is portable SQL.
 * On an integrity error, stop and tell the operator. Never delete and rebuild the file.
 */
export function openDb(path = config.dbPath): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { create: true })
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;')
  db.exec(`
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, email_verified_at INTEGER, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER);
  CREATE INDEX IF NOT EXISTS otp_email ON otp_codes(email);
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wallet_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address TEXT NOT NULL, message TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER);
  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, verified_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS groups (
    group_id TEXT PRIMARY KEY, owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_address TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, meta_text TEXT NOT NULL,
    chain_id INTEGER NOT NULL, block TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    name TEXT NOT NULL, email TEXT, expected_amount TEXT NOT NULL, user_id INTEGER REFERENCES users(id),
    wallet_address TEXT, invite_token_hash TEXT NOT NULL UNIQUE, invite_expires_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'invited', last_reminder_at INTEGER, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS participants_group ON participants(group_id);
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, participant_id INTEGER NOT NULL,
    sent_at INTEGER NOT NULL, channel TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, json TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS payment_intents (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), method TEXT NOT NULL,
    status TEXT NOT NULL, usdc_amount TEXT NOT NULL, local_amount TEXT, quote_json TEXT, provider TEXT NOT NULL,
    provider_ref TEXT, is_sandbox INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS webhook_events (
    provider TEXT NOT NULL, event_id TEXT NOT NULL, received_at INTEGER NOT NULL, PRIMARY KEY (provider, event_id));
  `)
  return db
}

/** Persistent server secret (used to hash one-time codes). Generated once, stored in the database. */
export function serverSecret(db: Database): string {
  const fromEnv = process.env.SERVER_SECRET
  if (fromEnv) return fromEnv
  const row = db.query('SELECT v FROM kv WHERE k = ?').get('server_secret') as { v: string } | null
  if (row) return row.v
  const v = randomBytes(32).toString('hex')
  db.query('INSERT INTO kv (k, v) VALUES (?, ?)').run('server_secret', v)
  return v
}
