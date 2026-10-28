import { isAddress, keccak256, toBytes, type Address, type Hex } from 'viem'

/**
 * Offchain group details travel inside the share link (`?d=`). A keccak256 hash of the
 * exact JSON text is committed onchain as `metadataHash`, so anyone can check the link
 * text matches what the organiser registered. Recipient, target and deadline are inside
 * the hashed text too, and are cross-checked against the onchain record.
 */
export const MAX_TITLE = 60
export const MAX_DESCRIPTION = 240
export const MAX_LABEL = 20
export const MAX_CUSTOM_SLOTS = 10
export const MAX_ENCODED_LENGTH = 900

export interface SplitSlot {
  /** Label, e.g. "Amina" */
  l: string
  /** Amount in raw 6-decimal USDC units, as a decimal string */
  a: string
}

export interface GroupMeta {
  v: 1
  t: string
  d: string
  /** recipient, lowercase */
  r: string
  /** target, raw units */
  g: string
  /** deadline, unix seconds */
  e: number
  m: 'equal' | 'custom'
  /** people count for equal splits */
  n?: number
  /** custom slots */
  s?: SplitSlot[]
}

/** Fixed key order so the same details always produce the same text and hash. */
export function serializeMeta(meta: GroupMeta): string {
  const ordered: Record<string, unknown> = {
    v: 1,
    t: meta.t,
    d: meta.d,
    r: meta.r.toLowerCase(),
    g: meta.g,
    e: meta.e,
    m: meta.m,
  }
  if (meta.m === 'equal') ordered.n = meta.n
  else ordered.s = meta.s
  return JSON.stringify(ordered)
}

export function hashMetaText(text: string): Hex {
  return keccak256(toBytes(text))
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export function encodeMetaText(text: string): string {
  return toBase64Url(text)
}

export interface DecodedMeta {
  text: string
  meta: GroupMeta
  hash: Hex
}

function isSlot(x: unknown): x is SplitSlot {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return typeof s.l === 'string' && typeof s.a === 'string' && /^\d+$/.test(s.a) && s.l.length <= MAX_LABEL
}

/** Decode and strictly validate link details. Returns null for anything malformed. */
export function decodeMeta(param: string | null): DecodedMeta | null {
  if (!param || param.length > MAX_ENCODED_LENGTH + 100) return null
  try {
    const text = fromBase64Url(param)
    const raw = JSON.parse(text) as Record<string, unknown>
    if (raw.v !== 1) return null
    if (typeof raw.t !== 'string' || raw.t.length === 0 || raw.t.length > MAX_TITLE) return null
    if (typeof raw.d !== 'string' || raw.d.length > MAX_DESCRIPTION) return null
    if (typeof raw.r !== 'string' || !isAddress(raw.r)) return null
    if (typeof raw.g !== 'string' || !/^\d+$/.test(raw.g)) return null
    if (typeof raw.e !== 'number' || !Number.isSafeInteger(raw.e)) return null
    if (raw.m !== 'equal' && raw.m !== 'custom') return null
    const meta: GroupMeta = {
      v: 1,
      t: raw.t,
      d: raw.d,
      r: raw.r.toLowerCase(),
      g: raw.g,
      e: raw.e,
      m: raw.m,
    }
    if (raw.m === 'equal') {
      if (typeof raw.n !== 'number' || !Number.isInteger(raw.n) || raw.n < 1 || raw.n > 200) return null
      meta.n = raw.n
    } else {
      if (!Array.isArray(raw.s) || raw.s.length < 1 || raw.s.length > MAX_CUSTOM_SLOTS || !raw.s.every(isSlot))
        return null
      meta.s = raw.s
    }
    return { text, meta, hash: hashMetaText(text) }
  } catch {
    return null
  }
}

export type VerifyState = 'verified' | 'mismatch' | 'missing'

/** Compare decoded link details with the onchain record. */
export function verifyMeta(
  decoded: DecodedMeta | null,
  chain: { metadataHash: Hex; recipient: Address; target: bigint; deadline: bigint },
): VerifyState {
  if (!decoded) return 'missing'
  const m = decoded.meta
  const ok =
    decoded.hash.toLowerCase() === chain.metadataHash.toLowerCase() &&
    m.r.toLowerCase() === chain.recipient.toLowerCase() &&
    BigInt(m.g) === chain.target &&
    BigInt(m.e) === chain.deadline
  return ok ? 'verified' : 'mismatch'
}
