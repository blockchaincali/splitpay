import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { HttpRequestError } from 'viem'
import { describeError, redact } from '../../src/lib/log'

const ROOT = join(import.meta.dir, '..', '..')

describe('log redaction', () => {
  test('scrubs bearer tokens, key=value secrets, URL credentials and query strings', () => {
    expect(redact('Authorization: Bearer abc.DEF-123_xyz')).not.toContain('abc.DEF')
    expect(redact('bearer abc.DEF-123_xyz')).toBe('bearer [redacted]')
    expect(redact('api_key=sk_live_12345 and token: hunter2')).not.toMatch(/sk_live|hunter2/)
    expect(redact('https://user:pass@rpc.example/path')).not.toContain('pass')
    expect(redact('https://rpc.example/v1?apikey=SECRET&x=1')).toBe('https://rpc.example/v1?[redacted]')
  })

  test('scrubs long hex blobs (signatures, signed transactions, calldata, private keys) but keeps short ones', () => {
    const sig = '0x' + 'ab'.repeat(65)
    const key = '0x' + '1f'.repeat(32)
    expect(redact(`signature ${sig}`)).not.toContain('abab')
    expect(redact(`pk ${key}`)).not.toContain('1f1f')
    expect(redact('selector 0xa9059cbb ok')).toBe('selector 0xa9059cbb ok')
  })

  test('describeError never lets a secret through any field of the cause chain', () => {
    const http = new HttpRequestError({
      url: 'https://user:pw@rpc.example.test/v1/KEY123?apikey=QUERYSECRET',
      status: 401,
      body: { method: 'eth_sendRawTransaction', params: ['0x' + 'cd'.repeat(120)] },
      details: 'Authorization: Bearer TOPSECRET.TOKEN\n0x' + 'ef'.repeat(100),
    })
    const out = JSON.stringify(describeError(new Error('wrapped', { cause: http })))
    for (const secret of ['TOPSECRET', 'QUERYSECRET', 'KEY123', 'pw@', 'cdcdcd', 'efefef', 'eth_sendRawTransaction']) {
      expect(out).not.toContain(secret)
    }
    expect(out).toContain('status=401')
    expect(out).toContain('host=rpc.example.test')
  })
})

// ---------------------------------------------------------------------------
// Production bundle: built for real, then inspected statically and in a browser.
// ---------------------------------------------------------------------------

const FORBIDDEN_MARKERS = [
  'studio-trace-event',
  'studio-trace-config',
  'studio-console-log',
  '__studioTrace',
  '__studioPatched',
  '[studio-trace]',
]

const outDir = mkdtempSync(join(tmpdir(), 'splitpay-prod-'))
let built = false

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

beforeAll(async () => {
  const proc = Bun.spawn([process.execPath, 'x', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [code, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
  if (code !== 0) throw new Error(`production build failed (${code}): ${err.slice(-500)}`)
  built = true
}, 420_000)

afterAll(() => rmSync(outDir, { recursive: true, force: true }))

describe('production bundle contains no Arc Studio instrumentation', () => {
  test('no tracing / console-capture markers in any shipped file', () => {
    expect(built).toBe(true)
    const shipped = files(outDir).filter((f) => ['.js', '.html', '.css', '.map'].includes(extname(f)))
    expect(shipped.length).toBeGreaterThan(0)
    for (const f of shipped) {
      const text = readFileSync(f, 'utf8')
      for (const m of FORBIDDEN_MARKERS) expect(`${f} ${text.includes(m)}`).toBe(`${f} false`)
      // The old hook redefined window.ethereum with an accessor.
      expect(/defineProperty\(\s*window\s*,\s*["']ethereum["']/.test(text)).toBe(false)
    }
  })

  test('index.html has no inline scripts (keeps a strict script-src possible)', () => {
    const html = readFileSync(join(outDir, 'index.html'), 'utf8')
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([, attrs, body]) => !/\bsrc=/.test(attrs) && body.trim())
    expect(inline).toEqual([])
  })
})

function findChrome(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  return candidates.find((c) => c && existsSync(c))
}
const chrome = findChrome()

/** Runs before the app: installs a fake wallet and records anything that touches it. */
const HARNESS = `<script>(function(){
  var fake = { request: function realRequest(){ return Promise.resolve(null) }, on: function(){} };
  var announced = { request: function realAnnounced(){ return Promise.resolve(null) } };
  var origRequest = fake.request, origAnnounced = announced.request;
  Object.defineProperty(window, 'ethereum', { value: fake, writable: true, configurable: true, enumerable: true });
  var oFetch = window.fetch, oLog = console.log, oErr = console.error, oWarn = console.warn;
  var studioMessages = [];
  window.addEventListener('message', function(e){ try { var t = e.data && e.data.type; if (typeof t === 'string' && t.indexOf('studio') === 0) studioMessages.push(t) } catch(_) {} });
  function announce(){ window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: 'u-1', name: 'Test', icon: 'data:,', rdns: 'test.wallet' }, provider: announced }) })) }
  window.addEventListener('eip6963:requestProvider', announce);
  window.addEventListener('DOMContentLoaded', function(){ setTimeout(announce, 200) });
  setTimeout(function(){
    if (location.search.indexOf('control=1') >= 0) {
      fake.request = function hooked(){}; window.fetch = function(){}; console.log = function(){};
      Object.defineProperty(window, 'ethereum', { get: function(){ return fake }, configurable: true });
    }
    var d = Object.getOwnPropertyDescriptor(window, 'ethereum');
    var out = {
      ethereumIsPlainValue: !!d && 'value' in d && !d.get && !d.set,
      ethereumSame: window.ethereum === fake,
      walletRequestUntouched: fake.request === origRequest,
      announcedRequestUntouched: announced.request === origAnnounced,
      noPatchFlags: !('__studioPatched' in fake) && !('__studioPatched' in announced),
      fetchUntouched: window.fetch === oFetch,
      consoleUntouched: console.log === oLog && console.error === oErr && console.warn === oWarn,
      noTraceApi: !('__studioTrace' in window),
      studioMessages: studioMessages
    };
    var pre = document.createElement('pre'); pre.id = '__result'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
  }, 6000);
})();</script>`

const MIME: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }

async function runInBrowser(control: boolean): Promise<Record<string, unknown>> {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      const file = join(outDir, url.pathname)
      if (url.pathname !== '/' && existsSync(file) && statSync(file).isFile()) {
        return new Response(Bun.file(file), { headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' } })
      }
      const html = readFileSync(join(outDir, 'index.html'), 'utf8').replace('<head>', `<head>${HARNESS}`)
      return new Response(html, { headers: { 'content-type': 'text/html' } })
    },
  })
  const profile = mkdtempSync(join(tmpdir(), 'splitpay-chrome-'))
  try {
    const proc = Bun.spawn(
      [chrome!, '--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--virtual-time-budget=20000', '--dump-dom', `http://localhost:${server.port}/${control ? '?control=1' : ''}`],
      { stdout: 'pipe', stderr: 'ignore' },
    )
    const dom = await new Response(proc.stdout).text()
    await proc.exited
    const m = /<pre id="__result">([\s\S]*?)<\/pre>/.exec(dom)
    if (!m) throw new Error('harness result missing from page: ' + dom.slice(0, 300))
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  } finally {
    server.stop(true)
    rmSync(profile, { recursive: true, force: true })
  }
}

describe.skipIf(!chrome)('production app in a real browser leaves the wallet, fetch and console alone', () => {
  test('harness detects hooks (negative control)', async () => {
    const r = await runInBrowser(true)
    expect(r.ethereumIsPlainValue).toBe(false)
    expect(r.walletRequestUntouched).toBe(false)
    expect(r.fetchUntouched).toBe(false)
    expect(r.consoleUntouched).toBe(false)
  }, 120_000)

  test('window.ethereum is not overridden; injected and EIP-6963 providers are not wrapped', async () => {
    const r = await runInBrowser(false)
    expect(r.ethereumIsPlainValue).toBe(true)
    expect(r.ethereumSame).toBe(true)
    expect(r.walletRequestUntouched).toBe(true)
    expect(r.announcedRequestUntouched).toBe(true)
    expect(r.noPatchFlags).toBe(true)
  }, 120_000)

  test('fetch and console are not monkey-patched, no trace API, nothing posted to the parent', async () => {
    const r = await runInBrowser(false)
    expect(r.fetchUntouched).toBe(true)
    expect(r.consoleUntouched).toBe(true)
    expect(r.noTraceApi).toBe(true)
    expect(r.studioMessages).toEqual([])
  }, 120_000)
})
