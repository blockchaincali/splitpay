/**
 * Resumable, parallel block-range scanner. Pure logic: no wallet, no viem, no storage, so it can be tested with fake RPCs.
 *
 * Why it exists: Arc makes blocks quickly, so reading a group's history one 5,000-block window at a time meant hundreds of calls
 * in a row. Public RPC endpoints also differ a lot (measured on Arc Testnet: one allows ~100,000 blocks and many parallel calls,
 * others only ~5,000 to ~9,999 blocks and rate-limit parallel bursts, one rejects log queries on its free plan), and some report a
 * too-wide range and a rate limit with the same message. So the scanner learns PER ENDPOINT:
 *
 * - Each endpoint has its own window width. It starts at a width known to be safe and doubles after each success, up to the widest
 *   width that endpoint has been seen to refuse. A refusal halves it. What was learned is handed back to the caller to save.
 * - Several windows are fetched at once (default 5), spread over the endpoints that are not cooling down.
 * - A failure puts that endpoint on a short, growing cooldown and sends the same window to a DIFFERENT endpoint. Nothing that
 *   already loaded is thrown away, and only after the attempts run out is a window reported as failed.
 * - `frontier` is the highest block B such that every block from `from` to B has been scanned: the point a caller may save and
 *   resume from. Windows that finish out of order are kept in `items` but never move the frontier past a gap.
 */

export interface Window {
  from: bigint
  to: bigint
}

export interface ScanProgress<T> {
  window: Window
  items: T[]
  /** Highest block B such that [from..B] is fully scanned (from - 1 when nothing contiguous is done yet). */
  frontier: bigint
}

/** What is known about one endpoint's log range limits. `ceil` is the widest width still believed to work. */
export interface EndpointLimits {
  maxOk?: bigint
  ceil?: bigint | null
}

export interface EndpointMemory {
  load(endpoint: number): EndpointLimits | undefined
  save(endpoint: number, limits: { maxOk: bigint; ceil: bigint | null }): void
}

export interface ScanOptions<T> {
  from: bigint
  to: bigint
  /** Fetch one window from the given endpoint (0-based). Throw on failure. */
  fetchChunk: (window: Window, endpoint: number) => Promise<T[]>
  /** How many RPC endpoints exist. */
  endpoints?: number
  concurrency?: number
  initialSize?: bigint
  minSize?: bigint
  maxSize?: bigint
  /** Attempts per window across all endpoints before it is reported as failed. */
  maxAttempts?: number
  backoffMs?: number
  maxCooldownMs?: number
  /** Injectable clock, so tests never really wait. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  onChunk?: (progress: ScanProgress<T>) => void
  signal?: AbortSignal
  memory?: EndpointMemory
}

export interface ScanResult<T> {
  items: T[]
  frontier: bigint
  complete: boolean
  failed: Window[]
  stats: {
    requests: number
    retries: number
    maxInFlight: number
    endpoints: { ok: number; failed: number; width: bigint; ceil: bigint | null }[]
  }
}

export type ScanErrorKind = 'range' | 'limit' | 'transient'

function errorText(e: unknown): string {
  const parts: string[] = []
  let cur: unknown = e
  for (let i = 0; i < 6 && cur; i++) {
    if (typeof cur === 'string') {
      parts.push(cur)
      break
    }
    const o = cur as { message?: unknown; details?: unknown; shortMessage?: unknown; cause?: unknown }
    for (const k of [o.shortMessage, o.details, o.message]) if (typeof k === 'string') parts.push(k)
    cur = o.cause
  }
  return parts.join(' | ').toLowerCase()
}

/**
 * range:     the endpoint says the request covers too many blocks or results.
 * limit:     "exceeds defined limit" / rate limit. Some endpoints use this for both causes, so it is treated as a rate limit
 *            unless the window was wider than anything that endpoint has accepted.
 * transient: timeouts, dropped connections, 5xx.
 */
export function classifyScanError(e: unknown): ScanErrorKind {
  const t = errorText(e)
  if (/rate limit|too many requests|\b429\b/.test(t)) return 'limit'
  if (/range|too large|too many (blocks|results|logs)|query returned more than|more than \d+ results|response size|block span|limit of \d+ blocks|exceeds max block/.test(t)) return 'range'
  if (/exceeds defined limit|limit exceeded|capacity/.test(t)) return 'limit'
  return 'transient'
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Job extends Window {
  attempt: number
  avoid: number | null
}

interface Ep {
  width: bigint
  ceil: bigint | null
  maxOk: bigint
  coolUntil: number
  fails: number
  inFlight: number
  score: number
  ok: number
  failed: number
}

export async function scanRange<T>(opts: ScanOptions<T>): Promise<ScanResult<T>> {
  const {
    from,
    to,
    fetchChunk,
    endpoints = 1,
    concurrency = 5,
    minSize = 100n,
    maxSize = 40_000n,
    maxAttempts = 6,
    backoffMs = 400,
    maxCooldownMs = 15_000,
    now = Date.now,
    sleep = realSleep,
    onChunk,
    signal,
    memory,
  } = opts

  const start = opts.initialSize ?? 5000n
  const eps: Ep[] = Array.from({ length: Math.max(1, endpoints) }, (_, i) => {
    const m = memory?.load(i)
    const ceil = m?.ceil ?? null
    const maxOk = m?.maxOk ?? 0n
    let width = maxOk > 0n && maxOk < start ? maxOk : start
    if (ceil !== null && width > ceil) width = ceil
    if (width > maxSize) width = maxSize
    if (width < minSize) width = minSize
    return { width, ceil, maxOk, coolUntil: 0, fails: 0, inFlight: 0, score: 0, ok: 0, failed: 0 }
  })

  const items: T[] = []
  const done = new Map<bigint, bigint>() // window.from -> window.to
  const failed: Window[] = []
  const retryQueue: Job[] = []
  let nextStart = from
  let requests = 0
  let retries = 0
  let inFlight = 0
  let maxInFlight = 0

  const frontier = (): bigint => {
    let f = from - 1n
    for (;;) {
      const end = done.get(f + 1n)
      if (end === undefined) return f
      f = end
    }
  }

  const remember = (i: number) => memory?.save(i, { maxOk: eps[i].maxOk, ceil: eps[i].ceil })

  /** The endpoint to use now: not cooling down, fewest requests in flight, best record. Or how long to wait. */
  const pick = (): { endpoint: number } | { wait: number } => {
    const t = now()
    let best = -1
    for (let i = 0; i < eps.length; i++) {
      if (eps[i].coolUntil > t) continue
      if (
        best === -1 ||
        eps[i].inFlight < eps[best].inFlight ||
        (eps[i].inFlight === eps[best].inFlight && eps[i].score > eps[best].score)
      )
        best = i
    }
    if (best !== -1) return { endpoint: best }
    return { wait: Math.max(1, Math.min(...eps.map((e) => e.coolUntil)) - t) }
  }

  const takeFor = (i: number): Job | null => {
    const ep = eps[i]
    let idx = retryQueue.findIndex((j) => j.avoid !== i)
    if (idx === -1 && retryQueue.length) idx = 0
    if (idx !== -1) {
      const job = retryQueue.splice(idx, 1)[0]
      const width = job.to - job.from + 1n
      if (width > ep.width) {
        // This endpoint takes narrower windows: keep the front part, queue the rest.
        const cut = job.from + ep.width - 1n
        retryQueue.unshift({ from: cut + 1n, to: job.to, attempt: job.attempt, avoid: job.avoid })
        return { from: job.from, to: cut, attempt: job.attempt, avoid: job.avoid }
      }
      return job
    }
    if (nextStart > to) return null
    const end = nextStart + ep.width - 1n > to ? to : nextStart + ep.width - 1n
    const job: Job = { from: nextStart, to: end, attempt: 0, avoid: null }
    nextStart = end + 1n
    return job
  }

  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return
      if (retryQueue.length === 0 && nextStart > to) return
      const choice = pick()
      if ('wait' in choice) {
        await sleep(choice.wait)
        continue
      }
      const i = choice.endpoint
      const job = takeFor(i)
      if (!job) return
      const ep = eps[i]
      const width = job.to - job.from + 1n
      ep.inFlight++
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      requests++
      try {
        const chunk = await fetchChunk({ from: job.from, to: job.to }, i)
        ep.inFlight--
        inFlight--
        ep.fails = 0
        ep.score++
        ep.ok++
        if (width > ep.maxOk) ep.maxOk = width
        // Accepted at the current width: try wider next time (never above the widest width not yet refused).
        if (width >= ep.width) {
          let next = ep.width * 2n
          if (ep.ceil !== null && next > ep.ceil) next = ep.ceil
          if (next > maxSize) next = maxSize
          if (next > ep.width) ep.width = next
        }
        remember(i)
        items.push(...chunk)
        done.set(job.from, job.to)
        onChunk?.({ window: { from: job.from, to: job.to }, items: chunk, frontier: frontier() })
      } catch (e) {
        ep.inFlight--
        inFlight--
        if (signal?.aborted) return
        const kind = classifyScanError(e)
        ep.fails++
        ep.failed++
        ep.score -= 2
        ep.coolUntil = now() + Math.min(maxCooldownMs, backoffMs * 2 ** (ep.fails - 1)) + Math.floor(Math.random() * (backoffMs / 2))
        // Too wide? Explicit "range" errors always say so. An ambiguous limit error only counts as "too wide" when the window
        // was wider than anything this endpoint has accepted (otherwise it is a rate limit and the width is fine).
        const tooWide = kind === 'range' || (kind === 'limit' && ep.maxOk > 0n && width > ep.maxOk) || (kind === 'limit' && ep.maxOk === 0n && width > minSize * 2n)
        if (tooWide && width > minSize) {
          // Fall back to the widest width known to work (or half this one), and stop growing past it: no endless probing.
          const half = width / 2n
          const safe = ep.maxOk > half && ep.maxOk < width ? ep.maxOk : half
          ep.width = safe < minSize ? minSize : safe
          if (kind === 'range' || ep.maxOk > 0n) ep.ceil = ep.width
        }
        remember(i)
        job.attempt++
        job.avoid = i
        retries++
        if (job.attempt >= maxAttempts) failed.push({ from: job.from, to: job.to })
        else retryQueue.unshift(job)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))

  const f = frontier()
  const finalFrontier = to < from ? from - 1n : f
  return {
    items,
    frontier: finalFrontier,
    complete: failed.length === 0 && finalFrontier >= to,
    failed,
    stats: {
      requests,
      retries,
      maxInFlight,
      endpoints: eps.map((e) => ({ ok: e.ok, failed: e.failed, width: e.width, ceil: e.ceil })),
    },
  }
}
