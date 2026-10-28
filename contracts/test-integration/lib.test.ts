import { describe, expect, test } from 'bun:test'
import { decodeMeta, encodeMetaText, serializeMeta, verifyMeta, type GroupMeta } from '../../src/lib/metadata'
import { equalShares, validateCustom } from '../../src/lib/splits'
import { keccak256, toHex } from 'viem'

const base: GroupMeta = { v: 1, t: 'Cabin', d: 'Weekend', r: '0x000000000000000000000000000000000000dead', g: '10000000', e: 1900000000, m: 'equal', n: 3 }

describe('equalShares', () => {
  test('always adds up to exactly the target and never exceeds it', () => {
    for (const [t, n] of [[10_000_000n, 3], [1n, 7], [999_999n, 4], [1_000_000n, 1], [123_456_789n, 200]] as const) {
      const shares = equalShares(t, n)
      expect(shares.length).toBe(n)
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(t)
      expect(Math.max(...shares.map(Number)) - Math.min(...shares.map(Number))).toBeLessThanOrEqual(1)
    }
  })
  test('10 USDC across 3 people is 3.333334 / 3.333333 / 3.333333', () => {
    expect(equalShares(10_000_000n, 3)).toEqual([3_333_334n, 3_333_333n, 3_333_333n])
  })
  test('rejects nonsense', () => {
    expect(equalShares(0n, 3)).toEqual([])
    expect(equalShares(5n, 0)).toEqual([])
  })
})

describe('validateCustom', () => {
  test('must add up exactly', () => {
    expect(validateCustom([{ label: 'A', amount: 600_000n }, { label: 'B', amount: 400_000n }], 1_000_000n).ok).toBe(true)
    expect(validateCustom([{ label: 'A', amount: 600_000n }, { label: 'B', amount: 399_999n }], 1_000_000n).ok).toBe(false)
    expect(validateCustom([{ label: 'A', amount: 600_000n }, { label: 'B', amount: 400_001n }], 1_000_000n).difference).toBe(-1n)
  })
  test('rejects empty labels and zero amounts', () => {
    expect(validateCustom([{ label: ' ', amount: 1_000_000n }], 1_000_000n).ok).toBe(false)
    expect(validateCustom([{ label: 'A', amount: 0n }, { label: 'B', amount: 1_000_000n }], 1_000_000n).ok).toBe(false)
    expect(validateCustom([{ label: 'A', amount: null }], 1n).ok).toBe(false)
  })
})

describe('share-link metadata', () => {
  const text = serializeMeta(base)
  const chain = { metadataHash: keccak256(toHex(text)), recipient: base.r as `0x${string}`, target: 10_000_000n, deadline: 1_900_000_000n }
  test('round trips and verifies', () => {
    const decoded = decodeMeta(encodeMetaText(text))
    expect(decoded?.meta.t).toBe('Cabin')
    expect(verifyMeta(decoded, chain)).toBe('verified')
  })
  test('unicode survives the round trip', () => {
    const t = serializeMeta({ ...base, t: 'Café 日本 😀' })
    expect(decodeMeta(encodeMetaText(t))?.meta.t).toBe('Café 日本 😀')
  })
  test('any change to the link text fails verification', () => {
    const edited = decodeMeta(encodeMetaText(text.replace('Cabin', 'Cabln')))
    expect(verifyMeta(edited, chain)).toBe('mismatch')
  })
  test('onchain recipient, target or deadline differing fails verification', () => {
    const decoded = decodeMeta(encodeMetaText(text))
    expect(verifyMeta(decoded, { ...chain, recipient: '0x000000000000000000000000000000000000beef' })).toBe('mismatch')
    expect(verifyMeta(decoded, { ...chain, target: 1n })).toBe('mismatch')
    expect(verifyMeta(decoded, { ...chain, deadline: 1n })).toBe('mismatch')
  })
  test('missing or malformed details are handled', () => {
    expect(verifyMeta(null, chain)).toBe('missing')
    expect(decodeMeta('not-base64!!')).toBeNull()
    expect(decodeMeta(encodeMetaText('{"v":2}'))).toBeNull()
    expect(decodeMeta(encodeMetaText(JSON.stringify({ ...base, r: 'nope' })))).toBeNull()
  })
})
