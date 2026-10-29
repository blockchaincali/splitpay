import type { Address, Hex } from 'viem'
import { getHistory, saveHistory, type StoredContribution } from './localGroups'

/** One confirmed payment, rebuilt from a ContributionReceived log. */
export interface Contribution {
  contributor: Address
  amount: bigint
  totalAfter: bigint
  name: string
  txHash: Hex
  blockNumber: bigint
  logIndex: number
}

const key = (c: { txHash: string; logIndex: number }) => `${c.txHash.toLowerCase()}:${c.logIndex}`

const toStored = (c: Contribution): StoredContribution => ({
  contributor: c.contributor,
  amount: c.amount.toString(),
  totalAfter: c.totalAfter.toString(),
  name: c.name,
  txHash: c.txHash,
  blockNumber: c.blockNumber.toString(),
  logIndex: c.logIndex,
})

const fromStored = (c: StoredContribution): Contribution => ({
  contributor: c.contributor as Address,
  amount: BigInt(c.amount),
  totalAfter: BigInt(c.totalAfter),
  name: c.name,
  txHash: c.txHash as Hex,
  blockNumber: BigInt(c.blockNumber),
  logIndex: c.logIndex,
})

/**
 * The payment history of one group: what has been scanned so far, kept in memory and mirrored to localStorage after every
 * chunk. A revisit starts from the saved cursor and only fetches newer blocks. It is a cache: the chain stays authoritative,
 * and anything that looks wrong is repaired by rescanning, never trusted.
 */
export class HistoryCache {
  private map = new Map<string, Contribution>()
  private listeners = new Set<() => void>()
  private snapshot: Contribution[] = []
  private inflight: Promise<unknown> | null = null
  cursor: bigint | null = null
  createdBlock: bigint | null = null
  floor: bigint | null = null

  constructor(readonly groupId: string) {
    try {
      const h = getHistory(groupId)
      this.cursor = h.cursor !== null ? BigInt(h.cursor) : null
      this.createdBlock = h.createdBlock !== null ? BigInt(h.createdBlock) : null
      this.floor = h.floor !== null && h.floor !== undefined ? BigInt(h.floor) : null
      for (const s of h.items) {
        const c = fromStored(s)
        this.map.set(key(c), c)
      }
    } catch {
      // A damaged cache is just an empty cache.
      this.map.clear()
      this.cursor = this.createdBlock = this.floor = null
    }
    this.rebuild()
  }

  private rebuild() {
    this.snapshot = [...this.map.values()].sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber > b.blockNumber ? 1 : -1,
    )
  }

  /** Stable between changes, so React can use it as a snapshot. */
  items = (): Contribution[] => this.snapshot

  total(): bigint {
    return this.snapshot.reduce((s, c) => s + c.amount, 0n)
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.rebuild()
    this.listeners.forEach((l) => l())
  }

  merge(items: Contribution[]) {
    if (items.length === 0) return
    let added = false
    for (const c of items) {
      const k = key(c)
      if (!this.map.has(k)) {
        this.map.set(k, c)
        added = true
      }
    }
    if (added) this.emit()
  }

  /** Move the resume point forward (never back) and save. Called after every chunk. */
  advance(cursor: bigint) {
    if (this.cursor === null || cursor > this.cursor) this.cursor = cursor
    this.persist()
  }

  noteStart(from: bigint) {
    if (this.floor === null || from < this.floor) this.floor = from
  }

  noteCreated(block: bigint) {
    if (this.createdBlock === null || block < this.createdBlock) this.createdBlock = block
  }

  persist() {
    saveHistory(this.groupId, {
      cursor: this.cursor?.toString() ?? null,
      createdBlock: this.createdBlock?.toString() ?? null,
      floor: this.floor?.toString() ?? null,
      items: this.snapshot.map(toStored),
    })
  }

  /** Only one scan at a time per group; a request that arrives meanwhile waits and then runs once more. */
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    while (this.inflight) await this.inflight.catch(() => undefined)
    const p = fn()
    this.inflight = p
    try {
      return await p
    } finally {
      this.inflight = null
    }
  }
}
