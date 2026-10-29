import { beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { Address, Hex } from 'viem'
import { classifyScanError, scanRange, type Window } from '../../src/lib/historyScan'
import { HistoryCache, type Contribution } from '../../src/lib/historyStore'
import { runGroupScan, scanMyGroups, type CreatedGroup, type GroupLogItem } from '../../src/lib/groupData'
import { getCursor, getHistory, getKnownIds, rememberCreatedGroup, rememberGroups } from '../../src/lib/localGroups'
import { sameAddress } from '../../src/lib/address'

// A tiny in-memory localStorage so the cache code runs exactly as it does in the browser.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

/** A virtual clock: sleeping just moves time forward, so cooldowns never really wait. */
function clock() {
  let t = 0
  return { now: () => t, sleep: async (ms: number) => void (t += ms) }
}
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const G = ('0x' + 'ab'.repeat(32)) as Hex
const CREATOR = '0x40368D97E3E92B494626653EC91D12354bC71884' as Address

function contribution(block: number, amount = 250_000n, idx = 0): Contribution {
  return {
    contributor: '0x00000000000000000000000000000000000000a1',
    amount,
    totalAfter: amount,
    name: '',
    txHash: ('0x' + block.toString(16).padStart(64, '0')) as Hex,
    blockNumber: BigInt(block),
    logIndex: idx,
  }
}

describe('BUG 1: payment history is scanned in parallel, resumably, and survives failures', () => {
  test('several windows are fetched at once (not one after another)', async () => {
    const res = await scanRange<number>({
      from: 1n,
      to: 200_000n,
      initialSize: 5000n,
      maxSize: 5000n,
      concurrency: 5,
      fetchChunk: async (w) => {
        await delay(15)
        return [Number(w.from)]
      },
    })
    expect(res.complete).toBe(true)
    expect(res.stats.requests).toBe(40)
    expect(res.stats.maxInFlight).toBeGreaterThanOrEqual(4)
    expect(res.stats.maxInFlight).toBeLessThanOrEqual(6)
    expect(res.items.length).toBe(40)
    expect(res.frontier).toBe(200_000n)
  })

  test('the window grows while the RPC accepts it, so far fewer calls are needed', async () => {
    const widths: bigint[] = []
    const res = await scanRange<number>({
      from: 1n,
      to: 400_000n,
      initialSize: 1000n,
      maxSize: 40_000n,
      fetchChunk: async (w: Window) => {
        widths.push(w.to - w.from + 1n)
        return []
      },
    })
    expect(res.complete).toBe(true)
    expect(Math.max(...widths.map(Number))).toBeGreaterThan(1000)
    expect(res.stats.requests).toBeLessThan(60) // 400 windows of 1000 if it never grew
  })

  test('a range that is too wide shrinks the window, and the limit is remembered for the next visit', async () => {
    const limit = 3000n
    const saved = new Map<number, { maxOk: bigint; ceil: bigint | null }>()
    const memory = { load: (i: number) => saved.get(i), save: (i: number, l: { maxOk: bigint; ceil: bigint | null }) => void saved.set(i, l) }
    const c = clock()
    const first = await scanRange<number>({
      from: 1n,
      to: 60_000n,
      initialSize: 20_000n,
      memory,
      ...c,
      fetchChunk: async (w) => {
        if (w.to - w.from + 1n > limit) throw new Error('requested range too large')
        return [Number(w.from)]
      },
    })
    expect(first.complete).toBe(true)
    expect(first.frontier).toBe(60_000n)
    expect(saved.get(0)!.ceil).not.toBeNull()
    expect(saved.get(0)!.ceil!).toBeLessThanOrEqual(limit)
    // The next scan starts at the learned width: no rejected request this time, and it does not probe wider forever.
    let rejected = 0
    const second = await scanRange<number>({
      from: 1n,
      to: 60_000n,
      initialSize: 20_000n,
      memory,
      ...clock(),
      fetchChunk: async (w) => {
        if (w.to - w.from + 1n > limit) {
          rejected++
          throw new Error('requested range too large')
        }
        return []
      },
    })
    expect(second.complete).toBe(true)
    expect(rejected).toBe(0)
  })

  test('a failing endpoint goes on a cooldown and its windows are retried on ANOTHER endpoint', async () => {
    const calls = [0, 0, 0]
    const c = clock()
    const res = await scanRange<number>({
      from: 1n,
      to: 60_000n,
      endpoints: 3,
      initialSize: 5000n,
      maxSize: 5000n,
      ...c,
      fetchChunk: async (w, endpoint) => {
        calls[endpoint]++
        if (endpoint === 0) throw new Error('fetch failed')
        return [Number(w.from)]
      },
    })
    expect(res.complete).toBe(true)
    expect(res.items.length).toBe(12)
    expect(calls[1] + calls[2]).toBeGreaterThanOrEqual(12)
    expect(calls[0]).toBeLessThan(8) // the broken endpoint is backed off, not hammered
    expect(res.stats.retries).toBeGreaterThan(0)
  })

  test('a window that cannot be read anywhere is reported, and everything else already loaded is kept', async () => {
    const seen: bigint[] = []
    const res = await scanRange<number>({
      from: 1n,
      to: 40_000n,
      endpoints: 2,
      initialSize: 5000n,
      maxSize: 5000n,
      maxAttempts: 3,
      ...clock(),
      fetchChunk: async (w) => {
        if (w.from === 10_001n) throw new Error('fetch failed')
        return [Number(w.from)]
      },
      onChunk: ({ frontier }) => void seen.push(frontier),
    })
    expect(res.complete).toBe(false)
    expect(res.failed).toEqual([{ from: 10_001n, to: 15_000n }])
    expect(res.items.length).toBe(7) // 8 windows, one failed, seven kept
    expect(res.frontier).toBe(10_000n) // never claims to have scanned past the gap
    expect(Math.max(...seen.map(Number))).toBeLessThanOrEqual(10_000)
  })

  test('the resume point never jumps over a window that is still loading', async () => {
    const frontiers: bigint[] = []
    await scanRange<number>({
      from: 1n,
      to: 20_000n,
      initialSize: 5000n,
      maxSize: 5000n,
      concurrency: 4,
      fetchChunk: async (w) => {
        if (w.from === 1n) await delay(60) // the first window is the slowest
        return [Number(w.from)]
      },
      onChunk: ({ frontier }) => void frontiers.push(frontier),
    })
    expect(frontiers[0]).toBe(0n) // other windows finished first; nothing contiguous yet
    expect(frontiers.at(-1)).toBe(20_000n)
    for (let i = 1; i < frontiers.length; i++) expect(frontiers[i] >= frontiers[i - 1]).toBe(true)
  })

  test('real-world mix (measured on Arc Testnet): wide+fast, narrow+rate-limited, always-failing and range-capped endpoints', async () => {
    // 0: allows up to 9,999 blocks but rate-limits bursts and labels EVERYTHING "rate limit exceeded" (like the public primary)
    // 1: allows 100,000 blocks and any parallelism (like blockdaemon)
    // 2: rejects every log query (like a free plan)
    // 3: allows 5,000 blocks, rate-limits bursts (like quicknode)
    const c = clock()
    let lastCall0 = -1e9
    let lastCall3 = -1e9
    const widths = [0n, 0n, 0n, 0n]
    const res = await scanRange<number>({
      from: 69_502_501n,
      to: 69_702_501n, // 200,000 blocks
      endpoints: 4,
      ...c,
      fetchChunk: async (w, e) => {
        const width = w.to - w.from + 1n
        if (e === 0) {
          if (width >= 10_000n || c.now() - lastCall0 < 600) throw new Error('Request exceeds defined limit. rate limit exceeded')
          lastCall0 = c.now()
        }
        if (e === 2) throw new Error('ranges over 10000 blocks are not supported on free plan')
        if (e === 3) {
          if (width > 5000n) throw new Error('requested range too large')
          if (c.now() - lastCall3 < 600) throw new Error('rate limit exceeded')
          lastCall3 = c.now()
        }
        if (e === 1 && width > 100_000n) throw new Error('query exceeds max block range 100000')
        if (width > widths[e]) widths[e] = width
        return [Number(w.from)]
      },
    })
    expect(res.complete).toBe(true)
    expect(res.frontier).toBe(69_702_501n)
    // Hundreds of 5,000-block calls in a row would be 40+; with the fast endpoint doing the heavy lifting it is a handful.
    expect(res.stats.requests).toBeLessThan(40)
    expect(res.stats.endpoints[1].ok).toBeGreaterThan(res.stats.endpoints[0].ok)
    expect(widths[1]).toBeGreaterThan(5000n) // the wide endpoint was allowed to grow
    expect(res.stats.endpoints[2].ok).toBe(0)
  })

  test('an ambiguous "exceeds defined limit" on a window wider than anything accepted shrinks it; on a narrow one it just waits', async () => {
    const c = clock()
    const widths: bigint[] = []
    const res = await scanRange<number>({
      from: 1n,
      to: 8000n,
      initialSize: 4000n,
      maxSize: 4000n,
      concurrency: 1,
      ...c,
      fetchChunk: async (w) => {
        const width = w.to - w.from + 1n
        widths.push(width)
        if (width > 2000n) throw new Error('Request exceeds defined limit')
        return []
      },
    })
    expect(res.complete).toBe(true)
    expect(widths[0]).toBe(4000n)
    expect(widths.slice(1).some((x) => x <= 2000n)).toBe(true)
  })

  test('errors are classified so the right recovery is used', () => {
    expect(classifyScanError(new Error('requested range too large'))).toBe('range')
    expect(classifyScanError(new Error('query exceeds max block range 100000'))).toBe('range')
    expect(classifyScanError(new Error('ranges over 10000 blocks are not supported on free plan'))).toBe('range')
    expect(classifyScanError(new Error('query returned more than 10000 results'))).toBe('range')
    expect(classifyScanError(new Error('Request exceeds defined limit'))).toBe('limit')
    expect(classifyScanError(new Error('rate limit exceeded'))).toBe('limit')
    // Arc's documented JSON-RPC codes win over the message text
    expect(classifyScanError(Object.assign(new Error('something'), { code: -32012 }))).toBe('range')
    expect(classifyScanError(Object.assign(new Error('block range'), { code: -32014 }))).toBe('transient')
    expect(classifyScanError(new Error('wrapper', { cause: Object.assign(new Error('x'), { code: -32012 }) }))).toBe('range')
    expect(classifyScanError(new Error('429 Too Many Requests'))).toBe('limit')
    expect(classifyScanError(new Error('fetch failed'))).toBe('transient')
    expect(classifyScanError(Object.assign(new Error('RPC Request failed.'), { cause: new Error('requested range too large') }))).toBe('range')
  })

  test('a revisit only fetches NEW blocks, using the saved history', async () => {
    const itemsFor = (w: Window): GroupLogItem[] =>
      [20, 4000, 9000].filter((b) => BigInt(b) >= w.from && BigInt(b) <= w.to).map((b) => ({ kind: 'contribution' as const, c: contribution(b) }))

    const first = new HistoryCache(G)
    await runGroupScan({ cache: first, from: 1n, to: 10_000n, record: true, endpoints: 1, ...clock(), fetchChunk: async (w) => itemsFor(w) })
    expect(first.items().length).toBe(3)
    expect(getHistory(G).cursor).toBe('10000')

    // A later visit: a brand-new cache object reads what was saved, then asks only for blocks after the cursor.
    const second = new HistoryCache(G)
    expect(second.items().length).toBe(3)
    expect(second.cursor).toBe(10_000n)
    const asked: Window[] = []
    await runGroupScan({
      cache: second,
      from: second.cursor! + 1n,
      to: 10_400n,
      record: true,
      endpoints: 1,
      ...clock(),
      fetchChunk: async (w) => {
        asked.push(w)
        return [{ kind: 'contribution' as const, c: contribution(10_100) }]
      },
    })
    expect(asked.every((w) => w.from > 10_000n)).toBe(true)
    expect(second.items().length).toBe(4)
    expect(getHistory(G).cursor).toBe('10400')
  })

  test('the cursor is saved after EVERY chunk, and a failure keeps what already loaded', async () => {
    const cache = new HistoryCache(G)
    const cursorsAtChunk: (string | null)[] = []
    const ok: Window[] = []
    const run = runGroupScan({
      cache,
      from: 1n,
      to: 60_000n,
      record: true,
      endpoints: 1,
      ...clock(),
      fetchChunk: async (w) => {
        if (w.from > 12_000n) throw new Error('fetch failed') // everything after block 12,000 cannot be read
        cursorsAtChunk.push(getHistory(G).cursor)
        ok.push(w)
        return [{ kind: 'contribution' as const, c: contribution(Number(w.from) + 1) }]
      },
    })
    await expect(run).rejects.toThrow(/could not be read/)
    expect(ok.length).toBeGreaterThan(0)
    // Progress was written while the scan was still running, not only at the end.
    expect(cursorsAtChunk.length).toBeGreaterThan(0)
    // A brand-new cache (a reload) has every payment that did load, and resumes right before the gap.
    const reloaded = new HistoryCache(G)
    expect(reloaded.items().length).toBe(ok.length)
    let contiguous = 0n
    for (const w of [...ok].sort((x, y) => (x.from < y.from ? -1 : 1))) if (w.from === contiguous + 1n) contiguous = w.to
    expect(reloaded.cursor).toBe(contiguous)
    expect(reloaded.cursor! < 60_000n).toBe(true)
  })

  test('the payments list never waits on the scan: stored history is shown immediately', () => {
    const seeded = new HistoryCache(G)
    seeded.merge([contribution(5), contribution(6)])
    seeded.advance(100n)
    const revisit = new HistoryCache(G) // constructing it is synchronous: no network involved
    expect(revisit.items().map((c) => Number(c.blockNumber))).toEqual([5, 6])
  })

  test('source: no sequential chunk loop, no percentage counter, a plain loading line', () => {
    const data = readFileSync('src/lib/groupData.ts', 'utf8')
    expect(data).not.toMatch(/while \(start <= to\)/)
    expect(data).not.toMatch(/setProgress|progress/)
    const receipts = readFileSync('src/components/ReceiptList.tsx', 'utf8')
    expect(receipts).toContain('Loading payment history...')
    expect(receipts).not.toMatch(/progress|Updating/)
    // The group page renders from getGroup alone; the history hook only feeds the list.
    const page = readFileSync('src/pages/GroupPage.tsx', 'utf8')
    expect(page).toMatch(/useGroup\(/)
    expect(page).not.toMatch(/if \([^)]*(syncing|items)[^)]*\)/) // no early return waits for the history
  })
})

describe('BUG 2: a new group is in "Your groups" at once, and the background sync is resumable', () => {
  test('a created group is saved with its block and listed immediately, with no scan', () => {
    rememberCreatedGroup(CREATOR, G, 69_600_123n)
    const list = getKnownIds(CREATOR)
    expect(list).toEqual([{ groupId: G, block: '69600123' }])
  })

  test('addresses and group ids match whatever their letter case', () => {
    rememberCreatedGroup(CREATOR, G, 1n) // saved under the checksummed address
    expect(getKnownIds(CREATOR.toLowerCase()).length).toBe(1) // found under the lower-case form
    expect(getKnownIds(CREATOR.toUpperCase().replace('0X', '0x')).length).toBe(1)
    rememberGroups(CREATOR.toLowerCase(), [{ groupId: G.toUpperCase().replace('0X', '0x') as Hex, block: '1' }])
    expect(getKnownIds(CREATOR).length).toBe(1) // same group, not duplicated
    expect(sameAddress(CREATOR, CREATOR.toLowerCase())).toBe(true)
    expect(sameAddress(CREATOR, '0x0000000000000000000000000000000000000001')).toBe(false)
    expect(sameAddress(undefined, CREATOR)).toBe(false)
  })

  test('newest first, and a later scan result merges into the same list', () => {
    rememberCreatedGroup(CREATOR, ('0x' + '01'.repeat(32)) as Hex, 100n)
    rememberCreatedGroup(CREATOR, ('0x' + '02'.repeat(32)) as Hex, 300n)
    rememberGroups(CREATOR, [{ groupId: ('0x' + '03'.repeat(32)) as Hex, block: '200' }])
    expect(getKnownIds(CREATOR).map((r) => r.block)).toEqual(['300', '200', '100'])
  })

  test('the background sync saves groups and the cursor after every chunk, retries failures, and keeps partial results', async () => {
    const created = (n: number, block: bigint): CreatedGroup => ({
      groupId: ('0x' + n.toString(16).padStart(64, '0')) as Hex,
      recipient: '0x0000000000000000000000000000000000000002',
      target: 1_000_000n,
      deadline: 2_000_000_000n,
      metadataHash: ('0x' + '00'.repeat(32)) as Hex,
      blockNumber: block,
    })
    const cursorsDuring: (bigint | null)[] = []
    let failures = 0
    await scanMyGroups({
      creator: CREATOR,
      from: 1n,
      to: 30_000n,
      endpoints: 2,
      ...clock(),
      fetchChunk: async (w, endpoint) => {
        if (w.from === 10_001n && endpoint === 0) {
          failures++
          throw new Error('fetch failed') // first endpoint is flaky; the next one answers
        }
        cursorsDuring.push(getCursor(CREATOR))
        return w.from === 5001n ? [created(7, 5500n)] : []
      },
    })
    expect(failures).toBeGreaterThan(0)
    expect(getKnownIds(CREATOR).map((r) => r.block)).toEqual(['5500'])
    expect(getCursor(CREATOR)).toBe(30_000n)
    expect(cursorsDuring.some((c) => c !== null)).toBe(true) // saved mid-scan, not only at the end
  })

  test('a scan that cannot finish still keeps the groups it found and the cursor up to the gap', async () => {
    rememberCreatedGroup(CREATOR, ('0x' + '09'.repeat(32)) as Hex, 50n) // created a moment ago, saved locally
    const run = scanMyGroups({
      creator: CREATOR,
      from: 1n,
      to: 20_000n,
      endpoints: 1,
      ...clock(),
      fetchChunk: async (w) => {
        if (w.from > 5000n) throw new Error('fetch failed')
        return []
      },
    })
    await expect(run).rejects.toThrow(/could not be read/)
    expect(getKnownIds(CREATOR).length).toBe(1) // still listed
    expect(getCursor(CREATOR)).toBe(5000n)
  })

  test('source: creating a group saves it at once; the dashboard shows an error only when nothing loaded', () => {
    expect(readFileSync('src/lib/useCreateGroup.ts', 'utf8')).toContain('rememberCreatedGroup')
    const dash = readFileSync('src/pages/Dashboard.tsx', 'utf8')
    expect(dash).not.toContain('Pull to refresh')
    expect(dash).toContain('Still syncing')
    expect(dash).toMatch(/nothingLoaded/)
    expect(dash).toMatch(/refetchInterval/) // retries by itself
  })
})
