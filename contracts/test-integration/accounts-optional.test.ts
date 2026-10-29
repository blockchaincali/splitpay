import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checkAccountsApi } from '../../src/account/availability'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})
const stub = (fn: () => Promise<Response>) => {
  globalThis.fetch = (() => fn()) as unknown as typeof fetch
}

describe('accounts are offered only when the SplitPay API really answers', () => {
  test('the real API shape counts as available', async () => {
    stub(async () => Response.json({ ok: true, service: 'splitpay-api' }))
    expect(await checkAccountsApi()).toBe(true)
  })
  test('a static host that answers 200 HTML for /api/health counts as no server', async () => {
    stub(async () => new Response('<!doctype html><html><body>SplitPay</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    expect(await checkAccountsApi()).toBe(false)
  })
  test('JSON of the wrong shape, an error status, or a broken body count as no server', async () => {
    stub(async () => Response.json({ ok: true }))
    expect(await checkAccountsApi()).toBe(false)
    stub(async () => Response.json({ ok: true, service: 'something-else' }))
    expect(await checkAccountsApi()).toBe(false)
    stub(async () => Response.json({ ok: true, service: 'splitpay-api' }, { status: 503 }))
    expect(await checkAccountsApi()).toBe(false)
    stub(async () => new Response('{nope', { status: 200, headers: { 'content-type': 'application/json' } }))
    expect(await checkAccountsApi()).toBe(false)
  })
  test('a network failure never throws', async () => {
    stub(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await checkAccountsApi()).toBe(false)
  })
})

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|css)$/.test(n) ? [p] : []
  })
}
const read = (p: string) => readFileSync(p, 'utf8')

describe('wallet-first wiring', () => {
  test('there is no Google sign-in anywhere in the app or server', () => {
    for (const f of [...sources('src'), ...sources('server')]) {
      if (f.includes('/tests/')) continue
      expect(read(f).toLowerCase().includes('continue with google')).toBe(false)
      expect(/accounts\.google\.com|googleClient/i.test(read(f))).toBe(false)
    }
  })
  test('the build flag defaults to off', () => {
    expect(read('.env.example')).toMatch(/^# VITE_ACCOUNTS_ENABLED=true/m)
    expect(read('.env.example')).not.toMatch(/^VITE_ACCOUNTS_ENABLED=/m)
  })
  test('every account-only page is wrapped in the gate', () => {
    const app = read('src/App.tsx')
    for (const page of ['SignIn', 'Account', 'Manage', 'Join']) expect(app).toMatch(new RegExp(`<AccountsGate>\\s*<${page}\\b`))
  })
  test('account prompts in shared screens depend on availability', () => {
    for (const f of ['src/components/Layout.tsx', 'src/pages/Dashboard.tsx', 'src/pages/GroupPage.tsx', 'src/pages/CreateGroup.tsx', 'src/components/PayPanel.tsx', 'src/account/SessionProvider.tsx']) {
      expect(read(f)).toContain('useAccountsAvailable')
    }
  })
  test('the dev proxy keeps the /api prefix; the API server strips it (same path in dev and production)', () => {
    expect(read('vite.config.ts')).not.toMatch(/rewrite:/)
    expect(read('server/index.ts')).toContain("startsWith('/api/')")
  })
  test('the session check is not requested unless accounts are available', () => {
    expect(read('src/account/SessionProvider.tsx')).toMatch(/enabled:\s*available/)
  })
})
