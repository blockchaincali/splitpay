import type { Hex } from 'viem'
import { normAddress } from './address'
import { encodeMetaText } from './metadata'
import { SPLITPAY_ADDRESS, TARGET_CHAIN_ID } from './deployment'

/**
 * Convenience cache only. Onchain state is authoritative for every amount and payment.
 * Holds the organiser's own group details (so the dashboard can show titles) and scan cursors.
 */
const ns = `splitpay:v1:${TARGET_CHAIN_ID}:${SPLITPAY_ADDRESS?.toLowerCase() ?? 'none'}`

export interface StoredGroup {
  groupId: Hex
  /** Exact JSON text that was hashed and committed onchain */
  text: string
  /** Block the group was created in (a hint for faster log scans) */
  block: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${ns}:${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(`${ns}:${key}`, JSON.stringify(value))
  } catch {
    // Storage may be full or blocked (private mode). The app still works without it.
  }
}

export function getStoredGroups(): Record<string, StoredGroup> {
  return read<Record<string, StoredGroup>>('groups', {})
}

export function saveStoredGroup(group: StoredGroup) {
  write('groups', { ...getStoredGroups(), [group.groupId.toLowerCase()]: group })
}

export function getCursor(creator: string): bigint | null {
  const v = read<string | null>(`cursor:${normAddress(creator)}`, null)
  return v ? BigInt(v) : null
}

export function saveCursor(creator: string, block: bigint) {
  write(`cursor:${normAddress(creator)}`, block.toString())
}

export function getKnownIds(creator: string): StoredGroupRef[] {
  return read<StoredGroupRef[]>(`ids:${normAddress(creator)}`, [])
}

export interface StoredGroupRef {
  groupId: Hex
  block: string
}

export function saveKnownIds(creator: string, refs: StoredGroupRef[]) {
  write(`ids:${normAddress(creator)}`, refs)
}

/**
 * Merge groups into a creator's local list (newest first, no duplicates, group ids compared in lower case).
 * Called the moment a group is created, so "Your groups" shows it at once, and after each chunk of a background scan.
 */
export function rememberGroups(creator: string, add: StoredGroupRef[]): StoredGroupRef[] {
  const byId = new Map(getKnownIds(creator).map((r) => [r.groupId.toLowerCase(), r]))
  for (const r of add) byId.set(r.groupId.toLowerCase(), r)
  const merged = [...byId.values()].sort((a, b) => (BigInt(b.block) > BigInt(a.block) ? 1 : BigInt(b.block) < BigInt(a.block) ? -1 : 0))
  saveKnownIds(creator, merged)
  return merged
}

export function rememberCreatedGroup(creator: string, groupId: Hex, block: bigint | string) {
  return rememberGroups(creator, [{ groupId, block: block.toString() }])
}

/** One payment as kept in localStorage (bigints as decimal strings). Onchain logs stay authoritative. */
export interface StoredContribution {
  contributor: string
  amount: string
  totalAfter: string
  name: string
  txHash: string
  blockNumber: string
  logIndex: number
}

export interface StoredHistory {
  /** Highest block B such that everything up to B has been scanned for this group. */
  cursor: string | null
  /** Block the group was created in, once seen in the logs. */
  createdBlock: string | null
  /** Lowest block this group's history was scanned from (so a too-late starting hint can be repaired once). */
  floor: string | null
  items: StoredContribution[]
}

const emptyHistory = (): StoredHistory => ({ cursor: null, createdBlock: null, floor: null, items: [] })

export function getHistory(groupId: string): StoredHistory {
  const h = read<StoredHistory>(`history:${groupId.toLowerCase()}`, emptyHistory())
  return h && Array.isArray(h.items) ? h : emptyHistory()
}

export function saveHistory(groupId: string, h: StoredHistory) {
  write(`history:${groupId.toLowerCase()}`, h)
}

/** What this device has learned about one RPC endpoint's log range limit, so a new visit starts at a width that works. */
export function getEndpointLimits(url: string): { maxOk?: bigint; ceil?: bigint | null } | undefined {
  const v = read<{ maxOk?: string; ceil?: string | null } | null>(`rpc-limits:${url}`, null)
  if (!v) return undefined
  const num = (x: unknown) => (typeof x === 'string' && /^\d+$/.test(x) ? BigInt(x) : undefined)
  return { maxOk: num(v.maxOk), ceil: v.ceil === null ? null : num(v.ceil) }
}

export function saveEndpointLimits(url: string, l: { maxOk: bigint; ceil: bigint | null }) {
  write(`rpc-limits:${url}`, { maxOk: l.maxOk.toString(), ceil: l.ceil === null ? null : l.ceil.toString() })
}

/** Path (not full URL) to a group page. Full links come from buildShareLink at display time. */
export function groupPath(groupId: Hex, text?: string, block?: string | bigint): string {
  const q = new URLSearchParams()
  if (text) q.set('d', encodeMetaText(text))
  if (block !== undefined) q.set('b', block.toString())
  const qs = q.toString()
  return `/g/${groupId}${qs ? `?${qs}` : ''}`
}
