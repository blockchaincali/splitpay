import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { arc, arcTestnet, mainnet } from 'viem/chains'
import { requireChain } from '../../src/onchain-facts'
import { rpcUrlsFor } from '../../src/lib/rpc'

const vercel = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const all = vercel.headers.find((h) => h.source === '/(.*)')!.headers
const header = (name: string) => all.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value

const ENFORCING = header('Content-Security-Policy')
const REPORT_ONLY = header('Content-Security-Policy-Report-Only')
const policy = ENFORCING ?? REPORT_ONLY ?? ''

function directives(p: string): Map<string, string[]> {
  return new Map(
    p
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...sources] = d.split(/\s+/)
        return [name, sources] as const
      }),
  )
}
const d = directives(policy)
const origin = (u: string) => new URL(u).origin

describe('Content-Security-Policy header', () => {
  test('a policy is configured (report-only or enforcing) and is not set twice', () => {
    expect(policy).not.toBe('')
    expect(all.filter((h) => /^content-security-policy/i.test(h.key)).length).toBe(1)
  })

  test('scripts, objects, base URI and forms are locked down', () => {
    expect(d.get('default-src')).toEqual(["'self'"])
    expect(d.get('script-src')).toEqual(["'self'"]) // no unsafe-inline, unsafe-eval, wildcards, https: or data:
    expect(d.get('object-src')).toEqual(["'none'"])
    expect(d.get('base-uri')).toEqual(["'self'"])
    expect(d.get('form-action')).toEqual(["'self'"])
    expect(d.get('frame-src')).toEqual(["'none'"])
    expect(policy).not.toContain('unsafe-eval')
  })

  test('framing is restricted (frame-ancestors never allows everyone)', () => {
    const fa = d.get('frame-ancestors') ?? []
    expect(fa.length).toBeGreaterThan(0)
    expect(fa).not.toContain('*')
    expect(fa).not.toContain('https:')
  })

  test('connect-src has no wildcard and covers every RPC endpoint the app can call', () => {
    const connect = d.get('connect-src') ?? []
    expect(connect).toContain("'self'")
    expect(connect).not.toContain('*')
    expect(connect).not.toContain('https:')
    expect(connect).not.toContain('wss:')

    // Arc Testnet uses the full failover list (see src/config.ts); mainnet and ENS use a single endpoint each.
    const needed = [
      ...rpcUrlsFor(arcTestnet),
      requireChain(arc.id).rpcUrls[0],
      mainnet.rpcUrls.default.http[0],
    ].map(origin)
    for (const o of needed) expect(connect).toContain(o)
  })

  test('the other security headers are still present', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })
})
