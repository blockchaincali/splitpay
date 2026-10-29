import { BaseError } from 'viem'

const MAX = 400

/**
 * Scrub anything that could be a secret before it reaches the console: authorization values, long hex blobs
 * (signatures, signed transactions, calldata, keys), URL credentials and query strings.
 */
export function redact(text: string): string {
  return text
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/\b(authorization|api[-_]?key|x-api-key|token|secret|password|private[-_]?key)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s/@]+@/gi, 'https://[redacted]@')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi, '$1?[redacted]')
    .replace(/0x[0-9a-fA-F]{40,}/g, '0x[redacted-hex]')
}

function clip(text: string): string {
  const safe = redact(text)
  return safe.length > MAX ? `${safe.slice(0, MAX)}…` : safe
}

function firstLine(text: string): string {
  return text.split('\n')[0]
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unparseable'
  }
}

/** Flatten an error and its causes into plain, log-safe data (names and short messages only, never request bodies). */
export function describeError(error: unknown): { name: string; message: string; chain: string[] } {
  const chain: string[] = []
  let cur: unknown = error
  for (let i = 0; i < 6 && cur; i++) {
    const e = cur as {
      name?: string
      shortMessage?: string
      message?: string
      code?: unknown
      cause?: unknown
      status?: unknown
      url?: unknown
      details?: unknown
    }
    const msg = e.shortMessage ?? e.message ?? 'unknown error'
    const code = typeof e.code === 'string' || typeof e.code === 'number' ? `(${e.code})` : ''
    // HTTP status, endpoint hostname (never the full URL or body) and the transport's one-line detail,
    // e.g. "Failed to fetch" for a blocked request versus a status code for a server answer.
    const status = typeof e.status === 'number' ? ` status=${e.status}` : ''
    const where = typeof e.url === 'string' ? ` host=${hostOf(e.url)}` : ''
    const detail = typeof e.details === 'string' && e.details ? ` detail=${firstLine(e.details)}` : ''
    chain.push(clip(`${e.name ?? 'Error'}${code}: ${firstLine(msg)}${status}${where}${detail}`))
    cur = e.cause
  }
  const top = error as { name?: string; shortMessage?: string; message?: string }
  return {
    name: top?.name ?? typeof error,
    message: clip(firstLine(error instanceof BaseError ? error.shortMessage : (top?.message ?? 'unknown error'))),
    chain,
  }
}

/** Structured console error so a failure in a deployed build shows the real cause, not just the friendly text. */
export function logFailure(scope: string, stage: string, error: unknown, context: Record<string, unknown> = {}): void {
  try {
    console.error(`[splitpay] ${scope} failed at "${stage}"`, { ...context, ...describeError(error) })
  } catch {
    /* logging must never throw */
  }
}
