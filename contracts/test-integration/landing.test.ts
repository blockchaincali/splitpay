import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

const ROOT = join(import.meta.dir, '..', '..')
/** Source text with line endings normalised, so the checks pass whether git checked the files out as LF or CRLF. */
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').split('\r\n').join('\n')
const landingFiles = readdirSync(join(ROOT, 'src/landing')).map((f) => `src/landing/${f}`)

/** The pages read window.location and matchMedia when they render; a minimal stand-in is enough for static markup. */
{
  const mq = { matches: false, addEventListener() {}, removeEventListener() {} }
  Object.assign(globalThis, {
    window: {
      location: { pathname: '/', search: '', hash: '', origin: 'http://localhost' },
      addEventListener() {},
      removeEventListener() {},
      matchMedia: () => mq,
    },
  })
}

async function load() {
  const { Home } = await import('../../src/pages/Home')
  const { SiteHeader } = await import('../../src/components/SiteHeader')
  const { SiteFooter } = await import('../../src/components/SiteFooter')
  const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
  return {
    home: html(createElement(Home)),
    header: html(createElement(SiteHeader, { wallet: createElement('span', null, 'wallet'), walletCompact: createElement('span', null, 'wallet-compact') })),
    footer: html(createElement(SiteFooter)),
  }
}

describe('the walkthrough can never touch a wallet, the network or storage', () => {
  test('src/landing imports no wallet, chain or network code', () => {
    for (const f of landingFiles) {
      const src = read(f)
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
      for (const spec of imports) expect(spec).not.toMatch(/^(wagmi|viem|connectkit|@wagmi|@tanstack|@circle-fin)/)
      expect(`${f}: ${/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|navigator\.(clipboard|share))\b/.test(src)}`).toBe(`${f}: false`)
      expect(`${f}: ${/window\.ethereum|eth_[a-zA-Z]+|personal_sign|signMessage|signTypedData|sendTransaction|writeContract|useAccount|useConnect/.test(src)}`).toBe(`${f}: false`)
    }
  })

  test('the only app code it uses is pure formatting and split math', () => {
    const imports = landingFiles.flatMap((f) => [...read(f).matchAll(/from\s+['"](@\/[^'"]+)['"]/g)].map((m) => m[1]))
    expect([...new Set(imports)].sort()).toEqual(['@/lib/money', '@/lib/splits'])
  })

  test('it is labelled as a demonstration', () => {
    const src = read('src/landing/ProductPreview.tsx')
    expect(src).toContain('Demonstration')
    expect(src).toContain('Nothing is connected or sent')
    expect(read('src/landing/PreviewScenes.tsx')).toContain('Demo: no wallet is connected')
    expect(read('src/landing/PreviewScenes.tsx')).toContain('(simulated)')
  })
})

describe('sample data is internally consistent and uses the real split code', async () => {
  const s = await import('../../src/landing/sample')
  const sum = (xs: readonly bigint[]) => xs.reduce((a, b) => a + b, 0n)

  test('shares add up exactly to the total', () => {
    expect(sum(s.EQUAL_SHARES)).toBe(s.SAMPLE_TOTAL)
    expect(sum(s.CUSTOM_SHARES.map((p) => p.amount))).toBe(s.SAMPLE_TOTAL)
  })
  test('"paid so far" figures are the running total of the payments that arrive, and never reach the goal', () => {
    let running = 0n
    s.ARRIVING.forEach((p, i) => {
      running += p.amount
      expect(s.PAID_AFTER[i]).toBe(running)
    })
    expect(running < s.SAMPLE_TOTAL).toBe(true)
    expect(s.usdc(s.SAMPLE_TOTAL - running)).toBe(s.usdc(s.CUSTOM_SHARES[3].amount)) // the one person who has not paid
  })
  test('the progress bar stops where the numbers do (105 of 120)', () => {
    expect(Number(s.PAID_AFTER[2]) / Number(s.SAMPLE_TOTAL)).toBeCloseTo(0.875, 4)
    expect(read('src/index.css')).toContain('scaleX(0.875)')
  })
})

describe('page structure and links (server-rendered markup)', async () => {
  const { home, header, footer } = await load()
  const { SECTION, ROUTE, NAV_ITEMS, hrefFor } = await import('../../src/lib/siteLinks')

  test('exactly one h1, and each landing section has its heading and id', () => {
    expect(home.match(/<h1\b/g)?.length).toBe(1)
    for (const id of Object.values(SECTION)) {
      expect(home).toContain(`id="${id}"`)
      expect(home).toContain(`id="${id}-title"`)
      expect(home).toContain(`aria-labelledby="${id}-title"`)
    }
  })

  test('every nav item points at a real route or a section that exists', () => {
    const app = read('src/App.tsx')
    for (const item of NAV_ITEMS) {
      if ('route' in item.to) {
        expect(Object.values(ROUTE)).toContain(item.to.route)
        expect(item.to.route === '/' || app.includes(`'${item.to.route}'`)).toBe(true)
      } else {
        expect(Object.values(SECTION)).toContain(item.to.section)
        expect(home).toContain(`id="${item.to.section}"`)
      }
      expect(header).toContain(`href="${hrefFor(item.to)}"`)
    }
  })

  test('there are no dead links: every anchor has a real destination', () => {
    for (const html of [home, header, footer]) {
      const hrefs = [...html.matchAll(/<a\b[^>]*?href="([^"]*)"/g)].map((m) => m[1])
      expect(hrefs.length).toBeGreaterThan(0)
      for (const h of hrefs) {
        expect(h).not.toBe('')
        expect(h).not.toBe('#')
        expect(h).not.toMatch(/^javascript:/i)
        expect(h).toMatch(/^(\/|https:\/\/)/)
      }
      expect((html.match(/<a\b(?![^>]*\bhref=)/g) ?? []).length).toBe(0)
    }
  })

  test('external links open safely', () => {
    for (const html of [home, footer]) {
      for (const tag of html.match(/<a\b[^>]*href="https:\/\/[^"]*"[^>]*>/g) ?? []) {
        if (tag.includes('github.com') || tag.includes('faucet.circle.com') || tag.includes('explorer.testnet')) {
          expect(tag).toContain('target="_blank"')
          expect(tag).toContain('rel="noopener noreferrer"')
        }
      }
    }
  })

  test('mobile menu exposes the disclosure pattern and starts closed', () => {
    expect(header).toMatch(/<button[^>]*aria-controls="site-menu"[^>]*aria-expanded="false"|<button[^>]*aria-expanded="false"[^>]*aria-controls="site-menu"/)
    expect(header).toMatch(/<nav[^>]*id="site-menu"[^>]*hidden/)
    expect(header).toContain('aria-label="Main menu"')
    expect(header).toContain('aria-label="Main"')
    expect(header).toContain('aria-label="SplitPay home"')
  })

  test('primary and secondary hero calls to action', () => {
    expect(home).toMatch(/<a[^>]*href="\/new"[^>]*>Create a group/)
    expect(home).toMatch(/<a[^>]*href="\/#how-it-works"[^>]*>See how it works/)
  })

  test('walkthrough: five numbered steps, labelled as a demonstration, with a pause control', () => {
    expect((home.match(/aria-label="Walkthrough steps"/g) ?? []).length).toBe(1)
    for (const t of ['Create a group', 'Choose the split', 'Connect a wallet', 'Share the group', 'Track payments']) expect(home).toContain(t)
    expect(home).toContain('Demonstration')
    expect(home).toContain('Nothing is connected or sent')
    expect(home).toContain('Pause')
    expect(home).toMatch(/aria-hidden="true"[^>]*>[\s\S]*SplitPay · demonstration/) // the mock window is decorative
  })

  test('testnet disclosure and footer content', () => {
    expect(home).toContain('test USDC with no real-world value')
    expect(home).toContain('Get test USDC')
    expect(footer).toContain('test USDC with no real value')
    expect(footer).toContain('SplitPay never holds your money')
    for (const label of ['Create a group', 'My groups', 'How it works', 'Features', 'Source code', 'Documentation']) expect(footer).toContain(label)
  })
})

describe('copy stays honest', () => {
  const copy = ['src/pages/Home.tsx', 'src/components/SiteFooter.tsx', ...landingFiles].map(read).join('\n')

  test('no invented testimonials, partners, statistics or security guarantees', () => {
    expect(copy).not.toMatch(/\b(testimonials?|trusted by|partnered?|partnerships?|audited|guarantee[sd]?|insured|bank-grade|military|unhackable|100% secure|risk-free)\b/i)
    expect(copy).not.toMatch(/\b\d[\d,.]*\+?\s*(users|customers|groups created|downloads|teams)\b/i)
  })
  test('it never claims a payment has settled', () => {
    expect(copy).not.toMatch(/\bsettle[sd]?\b/i)
    expect(copy).toContain('(simulated)')
  })
})

describe('motion', () => {
  const css = read('src/index.css')
  test('reduced motion removes all walkthrough animation and shows finished states', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .demo-stage'))
    expect(block).toContain('animation: none !important')
    expect(block).toContain('.demo-in')
    expect(block).toContain('.demo-gone')
  })
  test('the walkthrough pauses when paused, off screen or in a background tab, and never autoplays under reduced motion', () => {
    expect(css).toContain(".demo-stage[data-running='false']")
    expect(css).toContain('animation-play-state: paused')
    const src = read('src/landing/ProductPreview.tsx')
    expect(src).toContain('usePrefersReducedMotion')
    expect(src).toMatch(/const running = !reduced && !paused && inView && visible/)
  })
})
