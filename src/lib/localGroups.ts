import type { Hex } from 'viem'
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
  const v = read<string | null>(`cursor:${creator.toLowerCase()}`, null)
  return v ? BigInt(v) : null
}

export function saveCursor(creator: string, block: bigint) {
  write(`cursor:${creator.toLowerCase()}`, block.toString())
}

export function getKnownIds(creator: string): StoredGroupRef[] {
  return read<StoredGroupRef[]>(`ids:${creator.toLowerCase()}`, [])
}

export interface StoredGroupRef {
  groupId: Hex
  block: string
}

export function saveKnownIds(creator: string, refs: StoredGroupRef[]) {
  write(`ids:${creator.toLowerCase()}`, refs)
}

/** Path (not full URL) to a group page. Full links come from buildShareLink at display time. */
export function groupPath(groupId: Hex, text?: string, block?: string | bigint): string {
  const q = new URLSearchParams()
  if (text) q.set('d', encodeMetaText(text))
  if (block !== undefined) q.set('b', block.toString())
  const qs = q.toString()
  return `/g/${groupId}${qs ? `?${qs}` : ''}`
}
