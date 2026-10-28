import type { Database } from 'bun:sqlite'
import { config } from './config'
import { now } from './util'

export interface Mail {
  to: string
  subject: string
  body: string
}

export interface Mailer {
  kind: 'dev-outbox' | 'resend'
  send(mail: Mail): Promise<void>
}

/** Development sink: stores mail in the database so it can be read in the app. Nothing leaves the server. */
export function devMailer(db: Database): Mailer {
  return {
    kind: 'dev-outbox',
    async send(m) {
      db.query('INSERT INTO outbox (to_email, subject, body, created_at) VALUES (?, ?, ?, ?)').run(m.to, m.subject, m.body, now())
    },
  }
}

/** Resend HTTP API. Implemented from Resend's public API shape; not exercised without a real key. */
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    kind: 'resend',
    async send(m) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.body }),
      })
      if (!res.ok) throw new Error(`mail provider returned ${res.status}`)
    },
  }
}

export function pickMailer(db: Database): Mailer {
  if (config.resendApiKey && !config.devMail) return resendMailer(config.resendApiKey, config.mailFrom)
  return devMailer(db)
}
