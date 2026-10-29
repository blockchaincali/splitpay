import { afterAll, describe, expect, test } from 'bun:test'
import { BaseError, HttpRequestError, SwitchChainError, TimeoutError, createPublicClient, UserRejectedRequestError } from 'viem'
import { arcTestnet } from 'viem/chains'
import { friendlyError, isTransportError } from '../../src/lib/errors'
import { describeError } from '../../src/lib/log'
import { buildRpcTransport, probeEndpoints, rpcUrlsFor } from '../../src/lib/rpc'
import { isEmbeddedInArcStudio, parentIsArcStudio } from '../../src/lib/studioHost'

const NETWORK = 'Network issue. Check your connection and try again.'
const GENERIC = 'Something went wrong. Nothing was charged unless a transaction link is shown.'

describe('friendlyError classification', () => {
  test('real RPC transport failures say network issue', () => {
    expect(friendlyError(new HttpRequestError({ url: 'https://rpc.example', status: 503 })).message).toBe(NETWORK)
    expect(friendlyError(new TimeoutError({ body: {}, url: 'https://rpc.example' })).message).toBe(NETWORK)
    expect(friendlyError(new TypeError('Failed to fetch')).message).toBe(NETWORK)
    expect(isTransportError(new Error('The request took too long to respond.'))).toBe(true)
  })

  test('wallet / chain-add errors that merely mention fetch or network are NOT blamed on the connection', () => {
    // Regression: these used to be shown as "Network issue" because of a loose substring match.
    const addChain = new Error('Could not fetch chain ID. Is your RPC URL correct?')
    expect(friendlyError(addChain).message).toBe(GENERIC)
    expect(friendlyError(new Error('Wrong network selected in wallet')).message).toBe(GENERIC)
  })

  test('a failed network switch gets its own message', () => {
    const viaType = new SwitchChainError(new Error('4902'))
    expect(friendlyError(viaType).message).toContain('could not switch')
    expect(friendlyError(new Error('Unrecognized chain ID'), { stage: 'switching' }).message).toContain('could not switch')
  })

  test('cancellations and reverts still win over everything else', () => {
    expect(friendlyError(new UserRejectedRequestError(new Error('nope'))).cancelled).toBe(true)
    expect(friendlyError(new Error('User rejected the request.')).cancelled).toBe(true)
    expect(friendlyError(new Error('insufficient funds for gas')).message).toContain('enough USDC')
    expect(friendlyError(new BaseError('boom')).message).toBe(GENERIC)
  })
})

describe('describeError (log-safe output)', () => {
  test('keeps names and first lines of the cause chain, drops multi-line bodies', () => {
    const inner = new Error('inner failure\nRequest body: {"secret":"x"}')
    const outer = new Error('outer', { cause: inner })
    const d = describeError(outer)
    expect(d.chain).toEqual(['Error: outer', 'Error: inner failure'])
    expect(JSON.stringify(d)).not.toContain('secret')
  })
})

describe('rpcUrlsFor', () => {
  test('primary first, unique, includes fallbacks', () => {
    const urls = rpcUrlsFor(arcTestnet)
    expect(urls[0]).toBe('https://rpc.testnet.arc.io')
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.length).toBeGreaterThan(1)
  })
})

describe('buildRpcTransport retry and fallback (local JSON-RPC servers)', () => {
  const servers: ReturnType<typeof Bun.serve>[] = []
  const hits = { bad: 0, good: 0, revert: 0 }
  const rpc = (result: unknown, id: number) => Response.json({ jsonrpc: '2.0', id, result })

  function serve(handler: (body: { id: number; method: string }) => Response | Promise<Response>) {
    const s = Bun.serve({ port: 0, async fetch(req) { return handler(await req.json()) } })
    servers.push(s)
    return `http://localhost:${s.port}`
  }
  afterAll(() => servers.forEach((s) => s.stop(true)))

  const fast = { timeout: 1_000, retryCount: 1, retryDelay: 10 }
  const client = (urls: string[]) => createPublicClient({ chain: arcTestnet, transport: buildRpcTransport(urls, fast) })

  test('moves to the next endpoint when the first is down (HTTP 503)', async () => {
    const bad = serve(() => { hits.bad++; return new Response('unavailable', { status: 503 }) })
    const good = serve((b) => { hits.good++; return rpc('0x10', b.id) })
    expect(await client([bad, good]).getBlockNumber()).toBe(16n)
    expect(hits.bad).toBeGreaterThan(0)
    expect(hits.good).toBe(1)
  })

  test('moves to the next endpoint when the first refuses the connection', async () => {
    const good = serve((b) => rpc('0x2a', b.id))
    expect(await client(['http://localhost:1', good]).getBlockNumber()).toBe(42n)
  })

  test('moves on when the first endpoint hangs past the timeout', async () => {
    const slow = serve(async (b) => { await Bun.sleep(3_000); return rpc('0x1', b.id) })
    const good = serve((b) => rpc('0x7', b.id))
    expect(await client([slow, good]).getBlockNumber()).toBe(7n)
  })

  test('a contract revert is surfaced, not retried on the other endpoints', async () => {
    const reverting = serve((b) => { hits.revert++; return Response.json({ jsonrpc: '2.0', id: b.id, error: { code: 3, message: 'execution reverted' } }) })
    const never = serve((b) => { hits.good += 100; return rpc('0x', b.id) })
    const before = hits.good
    await expect(client([reverting, never]).call({ to: '0x0000000000000000000000000000000000000001', data: '0x' })).rejects.toThrow()
    expect(hits.good).toBe(before)
    expect(hits.revert).toBe(1)
  })

  test('every endpoint down is reported as a transport error (friendly network message)', async () => {
    const err = await client(['http://localhost:1', 'http://localhost:2']).getBlockNumber().catch((e) => e)
    expect(isTransportError(err)).toBe(true)
    expect(friendlyError(err).message).toBe(NETWORK)
  })
})

describe('describeError transport details', () => {
  test('keeps HTTP status, endpoint hostname and one-line detail, but not the path, body or later lines', () => {
    const http = new HttpRequestError({ url: 'https://rpc.example.test/v1/SECRET-KEY', status: 403, body: { method: 'eth_call' }, details: 'Forbidden\nraw body' })
    const d = describeError(new Error('outer', { cause: http }))
    const line = d.chain.find((c) => c.startsWith('HttpRequestError'))!
    expect(line).toContain('status=403')
    expect(line).toContain('host=rpc.example.test')
    expect(line).toContain('detail=Forbidden')
    expect(JSON.stringify(d)).not.toContain('SECRET-KEY')
    expect(JSON.stringify(d)).not.toContain('raw body')
  })
})

describe('probeEndpoints', () => {
  const asFetch = (fn: (url: string, init: RequestInit) => Promise<Response>) => fn as unknown as typeof fetch

  test('distinguishes ok, CORS and fully blocked endpoints', async () => {
    const fake = asFetch(async (url, init) => {
      if (url.includes('ok.test')) return new Response('{}', { status: 200 })
      if (url.includes('cors.test')) {
        if (init.mode === 'no-cors') return new Response(null)
        throw new TypeError('Failed to fetch')
      }
      throw new TypeError('Failed to fetch')
    })
    const r = await probeEndpoints(['https://ok.test/', 'https://cors.test/', 'https://down.test/'], 1000, fake)
    expect(r.map((p) => [p.host, p.result])).toEqual([['ok.test', 'ok'], ['cors.test', 'cors'], ['down.test', 'blocked']])
    expect(r[0].status).toBe(200)
  })
})

describe('Arc Studio instrumentation scope', () => {
  test('only a direct Arc Studio parent enables it', () => {
    expect(parentIsArcStudio(['https://studio.arc.io'])).toBe(true)
    expect(parentIsArcStudio(['https://studio-staging.arc.io', 'https://x.test'])).toBe(true)
    expect(parentIsArcStudio(undefined, 'https://studio.arc.io/project/1')).toBe(true) // Firefox: no ancestorOrigins
  })
  test('other parents, spoofy lookalikes and no parent do not', () => {
    expect(parentIsArcStudio(['https://evil.example'])).toBe(false)
    expect(parentIsArcStudio(['https://studio.arc.io.evil.example'])).toBe(false)
    expect(parentIsArcStudio(['https://evil.example'], 'https://studio.arc.io/')).toBe(false) // ancestorOrigins wins over referrer
    expect(parentIsArcStudio(undefined, '')).toBe(false)
    expect(parentIsArcStudio([], 'not a url')).toBe(false)
  })
  test('a top-level page never enables it', () => {
    // bun has no window, so isEmbeddedInArcStudio must fail closed instead of throwing
    expect(isEmbeddedInArcStudio()).toBe(false)
  })
})
