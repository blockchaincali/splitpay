import { BaseError } from 'viem'

const MAX = 400

function clip(text: string): string {
  return text.length > MAX ? `${text.slice(0, MAX)}…` : text
}

/** Flatten an error and its causes into plain, log-safe data (names and short messages only, never request bodies). */
export function describeError(error: unknown): { name: string; message: string; chain: string[] } {
  const chain: string[] = []
  let cur: unknown = error
  for (let i = 0; i < 6 && cur; i++) {
    const e = cur as { name?: string; shortMessage?: string; message?: string; code?: unknown; cause?: unknown }
    const msg = e.shortMessage ?? e.message ?? 'unknown error'
    chain.push(clip(`${e.name ?? 'Error'}${typeof e.code === 'string' || typeof e.code === 'number' ? `(${e.code})` : ''}: ${msg.split('\n')[0]}`))
    cur = e.cause
  }
  const top = error as { name?: string; shortMessage?: string; message?: string }
  return {
    name: top?.name ?? typeof error,
    message: clip((error instanceof BaseError ? error.shortMessage : (top?.message ?? 'unknown error')).split('\n')[0]),
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
