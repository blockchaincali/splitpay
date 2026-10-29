import { isAddress, keccak256, toBytes, type Address, type Hex } from 'viem'
import type { Ctx, Router } from './router'
import { requireUser } from './router'
import { config } from './config'
import { resolveLinkBase } from './auth'
import { userOwnsWallet } from './wallets'
import { HttpError, now, rateLimit, sha256, str, token, normalizeEmail } from './util'

const ID_RE = /^0x[0-9a-fA-F]{64}$/
const INVITE_TTL = 14 * 86400
const REMINDER_COOLDOWN = 24 * 3600
const MAX_PARTICIPANTS = 50

export const fmtUsdc = (raw: bigint): string => {
  const s = raw.toString().padStart(7, '0')
  const whole = s.slice(0, -6)
  const frac = s.slice(-6).replace(/0+$/, '').padEnd(2, '0')
  return `${whole}.${frac}`
}

interface GroupRow {
  group_id: string
  owner_user_id: number
  title: string
  description: string
  meta_text: string
  block: string
  creator_address: string
  created_at: number
}

interface ParticipantRow {
  id: number
  group_id: string
  name: string
  email: string | null
  expected_amount: string
  user_id: number | null
  wallet_address: string | null
  status: string
  last_reminder_at: number | null
  invite_expires_at: number
}

export const groupPath = (g: Pick<GroupRow, 'group_id' | 'meta_text' | 'block'>) =>
  `/g/${g.group_id}?d=${Buffer.from(g.meta_text).toString('base64url')}&b=${g.block}`

function ownedGroup(c: Ctx, id: string): GroupRow {
  const user = requireUser(c)
  if (!ID_RE.test(id)) throw new HttpError(400, 'invalid_group')
  const g = c.db.query('SELECT * FROM groups WHERE group_id = ?').get(id.toLowerCase()) as GroupRow | null
  if (!g || g.owner_user_id !== user.id) throw new HttpError(404, 'not_found', 'Group not found.')
  return g
}

function publicParticipant(p: ParticipantRow, contributed: bigint | null) {
  const expected = BigInt(p.expected_amount)
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    expectedAmount: p.expected_amount,
    status: p.status,
    walletLinked: Boolean(p.wallet_address),
    lastReminderAt: p.last_reminder_at,
    contributed: contributed === null ? null : contributed.toString(),
    paid: contributed === null ? false : contributed >= expected,
  }
}

async function contributedBy(c: Ctx, groupId: string, wallet: string | null): Promise<bigint | null> {
  if (!wallet) return 0n
  try {
    return await c.chain.contributionOf(groupId as Hex, wallet as Address)
  } catch {
    return null
  }
}

export function registerGroups(r: Router) {
  // Index a group that already exists on Arc. Verified against the chain before it is saved.
  r.add('POST', '/groups', async (c) => {
    const user = requireUser(c)
    const groupId = str(c.body.groupId, 'groupId', 66).toLowerCase()
    const metaText = str(c.body.metaText, 'metaText', 4000)
    const block = str(c.body.block, 'block', 20)
    if (!ID_RE.test(groupId) || !/^\d+$/.test(block)) throw new HttpError(400, 'invalid_request')
    const existing = c.db.query('SELECT owner_user_id FROM groups WHERE group_id = ?').get(groupId) as { owner_user_id: number } | null
    if (existing) {
      if (existing.owner_user_id === user.id) return { ok: true, existing: true }
      throw new HttpError(409, 'group_taken', 'This group is saved to a different account.')
    }
    const chainGroup = await c.chain.getGroup(groupId as Hex)
    if (!chainGroup) throw new HttpError(404, 'group_not_on_chain', 'That group was not found on Arc.')
    if (!userOwnsWallet(c.db, user.id, chainGroup.creator))
      throw new HttpError(403, 'wallet_not_linked', 'Link the wallet that created this group to your account first.')
    if (keccak256(toBytes(metaText)).toLowerCase() !== chainGroup.metadataHash.toLowerCase())
      throw new HttpError(400, 'meta_mismatch', 'The group details do not match the record on Arc.')
    let meta: { t?: unknown; d?: unknown }
    try {
      meta = JSON.parse(metaText)
    } catch {
      throw new HttpError(400, 'invalid_meta')
    }
    if (typeof meta.t !== 'string' || typeof meta.d !== 'string') throw new HttpError(400, 'invalid_meta')
    c.db
      .query('INSERT INTO groups (group_id, owner_user_id, creator_address, title, description, meta_text, chain_id, block, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(groupId, user.id, chainGroup.creator, meta.t, meta.d, metaText, config.chainId, block, now())
    return { ok: true }
  }, { auth: true })

  r.add('GET', '/groups', (c) => {
    const user = requireUser(c)
    const owned = (c.db.query('SELECT * FROM groups WHERE owner_user_id = ? ORDER BY created_at DESC').all(user.id) as GroupRow[]).map((g) => ({
      groupId: g.group_id,
      title: g.title,
      description: g.description,
      path: groupPath(g),
      createdAt: g.created_at,
      participantCount: (c.db.query('SELECT COUNT(*) AS n FROM participants WHERE group_id = ?').get(g.group_id) as { n: number }).n,
    }))
    const joined = (
      c.db
        .query('SELECT g.*, p.expected_amount, p.status FROM participants p JOIN groups g ON g.group_id = p.group_id WHERE p.user_id = ? ORDER BY p.id DESC')
        .all(user.id) as (GroupRow & { expected_amount: string; status: string })[]
    ).map((g) => ({ groupId: g.group_id, title: g.title, path: groupPath(g), expectedAmount: g.expected_amount, status: g.status }))
    return { owned, joined }
  }, { auth: true })

  r.add('GET', '/groups/:id', async (c) => {
    const g = ownedGroup(c, c.params.id)
    const rows = c.db.query('SELECT * FROM participants WHERE group_id = ? ORDER BY id').all(g.group_id) as ParticipantRow[]
    const participants = await Promise.all(rows.map(async (p) => publicParticipant(p, await contributedBy(c, g.group_id, p.wallet_address))))
    return { group: { groupId: g.group_id, title: g.title, description: g.description, path: groupPath(g) }, participants }
  }, { auth: true })

  r.add('POST', '/groups/:id/participants', async (c) => {
    const g = ownedGroup(c, c.params.id)
    rateLimit(`inv:${g.group_id}`, 60, 3600)
    const name = str(c.body.name, 'name', 40)
    const email = c.body.email ? normalizeEmail(c.body.email) : null
    const amount = str(c.body.expectedAmount, 'expectedAmount', 18)
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new HttpError(400, 'invalid_expectedAmount', 'Enter an amount above zero.')
    const count = (c.db.query('SELECT COUNT(*) AS n FROM participants WHERE group_id = ?').get(g.group_id) as { n: number }).n
    if (count >= MAX_PARTICIPANTS) throw new HttpError(400, 'too_many_participants', `A group can have up to ${MAX_PARTICIPANTS} people.`)
    const t = token(32)
    const info = c.db
      .query('INSERT INTO participants (group_id, name, email, expected_amount, invite_token_hash, invite_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(g.group_id, name, email, amount, sha256(t), now() + INVITE_TTL, now())
    const base = resolveLinkBase(c.req, c.body.linkBase)
    const invitePath = `/join/${t}`
    if (email) {
      await c.mailer.send({
        to: email,
        subject: `You're invited to pay your share: ${g.title}`,
        body: `Hi ${name},\n\nYou have been invited to pay ${fmtUsdc(BigInt(amount))} USDC for "${g.title}".\n\nOpen your invite: ${base}${invitePath}\n\nThe link works for 14 days.`,
      })
    }
    return { participantId: Number(info.lastInsertRowid), invitePath, inviteLink: `${base}${invitePath}`, emailed: Boolean(email) }
  }, { auth: true })

  r.add('POST', '/groups/:id/participants/:pid/reissue', (c) => {
    const g = ownedGroup(c, c.params.id)
    const p = c.db.query('SELECT id, user_id FROM participants WHERE id = ? AND group_id = ?').get(Number(c.params.pid), g.group_id) as { id: number; user_id: number | null } | null
    if (!p) throw new HttpError(404, 'not_found')
    if (p.user_id) throw new HttpError(409, 'already_joined', 'This person has already joined.')
    const t = token(32)
    c.db.query('UPDATE participants SET invite_token_hash = ?, invite_expires_at = ? WHERE id = ?').run(sha256(t), now() + INVITE_TTL, p.id)
    const base = resolveLinkBase(c.req, c.body.linkBase)
    return { invitePath: `/join/${t}`, inviteLink: `${base}/join/${t}` }
  }, { auth: true })

  r.add('DELETE', '/groups/:id/participants/:pid', (c) => {
    const g = ownedGroup(c, c.params.id)
    c.db.query('DELETE FROM participants WHERE id = ? AND group_id = ?').run(Number(c.params.pid), g.group_id)
    return { ok: true }
  }, { auth: true })

  // Public: look at an invitation. Reveals the group's public details and the invitee's own share only.
  r.add('GET', '/invites/:token', (c) => {
    const p = c.db.query('SELECT * FROM participants WHERE invite_token_hash = ?').get(sha256(c.params.token)) as ParticipantRow | null
    if (!p || p.invite_expires_at < now()) throw new HttpError(404, 'invite_invalid', 'This invitation is invalid or has expired.')
    const g = c.db.query('SELECT * FROM groups WHERE group_id = ?').get(p.group_id) as GroupRow
    if (p.status === 'invited') c.db.query("UPDATE participants SET status = 'viewed' WHERE id = ?").run(p.id)
    return { participantName: p.name, expectedAmount: p.expected_amount, groupTitle: g.title, groupPath: groupPath(g), claimed: Boolean(p.user_id) }
  })

  r.add('POST', '/invites/:token/claim', (c) => {
    const user = requireUser(c)
    const p = c.db.query('SELECT * FROM participants WHERE invite_token_hash = ?').get(sha256(c.params.token)) as ParticipantRow | null
    if (!p || p.invite_expires_at < now()) throw new HttpError(404, 'invite_invalid', 'This invitation is invalid or has expired.')
    if (p.user_id && p.user_id !== user.id) throw new HttpError(409, 'invite_taken', 'This invitation was already used.')
    const wallet = c.body.walletAddress
    if (typeof wallet !== 'string' || !isAddress(wallet) || !userOwnsWallet(c.db, user.id, wallet))
      throw new HttpError(400, 'wallet_not_linked', 'Link a wallet to your account first.')
    c.db.query("UPDATE participants SET user_id = ?, wallet_address = ?, status = 'joined' WHERE id = ?").run(user.id, wallet.toLowerCase(), p.id)
    const g = c.db.query('SELECT * FROM groups WHERE group_id = ?').get(p.group_id) as GroupRow
    return { ok: true, groupPath: groupPath(g) }
  }, { auth: true })

  r.add('POST', '/groups/:id/reminders', async (c) => {
    const g = ownedGroup(c, c.params.id)
    const chainGroup = await c.chain.getGroup(g.group_id as Hex)
    if (!chainGroup) throw new HttpError(404, 'group_not_on_chain')
    const ids = Array.isArray(c.body.participantIds) ? (c.body.participantIds as unknown[]).map(Number) : null
    const rows = (c.db.query('SELECT * FROM participants WHERE group_id = ?').all(g.group_id) as ParticipantRow[]).filter((p) => !ids || ids.includes(p.id))
    const base = resolveLinkBase(c.req, c.body.linkBase)
    const results: { participantId: number; result: 'sent' | 'already_paid' | 'no_email' | 'too_soon' | 'closed' | 'unknown_balance' }[] = []
    for (const p of rows) {
      const push = (result: (typeof results)[number]['result']) => results.push({ participantId: p.id, result })
      if (Number(chainGroup.deadline) < now()) { push('closed'); continue }
      const contributed = await contributedBy(c, g.group_id, p.wallet_address)
      if (contributed === null) { push('unknown_balance'); continue }
      if (contributed >= BigInt(p.expected_amount)) { push('already_paid'); continue }
      if (!p.email) { push('no_email'); continue }
      if (p.last_reminder_at && now() - p.last_reminder_at < REMINDER_COOLDOWN) { push('too_soon'); continue }
      const owed = BigInt(p.expected_amount) - contributed
      await c.mailer.send({
        to: p.email,
        subject: `Reminder: ${g.title}`,
        body: `Hi ${p.name},\n\nA friendly reminder to pay your share of "${g.title}": ${fmtUsdc(owed)} USDC still to pay.\n\nPay here: ${base}${groupPath(g)}\n`,
      })
      c.db.query('UPDATE participants SET last_reminder_at = ?, status = ? WHERE id = ?').run(now(), 'reminded', p.id)
      c.db.query('INSERT INTO reminders (group_id, participant_id, sent_at, channel) VALUES (?, ?, ?, ?)').run(g.group_id, p.id, now(), 'email')
      push('sent')
    }
    return { results }
  }, { auth: true })
}
