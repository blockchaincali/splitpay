import { useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReadContract } from 'wagmi'
import { BaseError, ContractFunctionRevertedError, decodeEventLog, encodeEventTopics, getAbiItem, toHex, type Address, type Hex, type PublicClient } from 'viem'
import { splitPayAbi } from './splitpayAbi'
import { DEPLOY_BLOCK, SPLITPAY_ADDRESS, TARGET_CHAIN_ID } from './deployment'
import { scanRange, type Window } from './historyScan'
import { HistoryCache, type Contribution } from './historyStore'
import { endpointClients, endpointUrls, headBlock } from './rpcClients'
import { getCursor, getEndpointLimits, rememberGroups, saveCursor, saveEndpointLimits } from './localGroups'

export interface Group {
  creator: Address
  recipient: Address
  target: bigint
  deadline: bigint
  collected: bigint
  metadataHash: Hex
}

export type { Contribution } from './historyStore'

export type GroupStatus = 'loading' | 'notfound' | 'error' | 'ready'

/** Live onchain group state. Polls every few seconds. */
export function useGroup(groupId: Hex | undefined) {
  const q = useReadContract({
    address: SPLITPAY_ADDRESS,
    abi: splitPayAbi,
    functionName: 'getGroup',
    args: groupId ? [groupId] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: Boolean(groupId && SPLITPAY_ADDRESS), refetchInterval: 6000, retry: false },
  })
  let status: GroupStatus = 'loading'
  let group: Group | undefined
  if (q.data) {
    const [creator, recipient, target, deadline, collected, metadataHash] = q.data
    group = { creator, recipient, target, deadline: BigInt(deadline), collected, metadataHash }
    status = 'ready'
  } else if (q.error) {
    const reverted =
      q.error instanceof BaseError ? q.error.walk((e) => e instanceof ContractFunctionRevertedError) : null
    status =
      reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName === 'GroupNotFound'
        ? 'notfound'
        : 'error'
  }
  return { status, group, refetch: q.refetch }
}

const contributionEvent = getAbiItem({ abi: splitPayAbi, name: 'ContributionReceived' })
const createdEvent = getAbiItem({ abi: splitPayAbi, name: 'GroupCreated' })

/** Per-endpoint range limits are remembered on this device (keyed by URL, same order as endpointClients()). */
const memory = {
  load: (i: number) => getEndpointLimits(endpointUrls()[i]),
  save: (i: number, l: { maxOk: bigint; ceil: bigint | null }) => saveEndpointLimits(endpointUrls()[i], l),
}

/** Thrown when some block windows could not be read yet. Everything that did load has been kept and saved. */
export class IncompleteScanError extends Error {
  constructor(readonly failedWindows: number) {
    super(`${failedWindows} block range(s) could not be read yet`)
    this.name = 'IncompleteScanError'
  }
}

export type GroupLogItem = { kind: 'created'; block: bigint } | { kind: 'contribution'; c: Contribution }

/** One request returns both the creation event and the payments of a group (both have the group id as their first indexed topic). */
async function fetchGroupLogs(client: PublicClient, groupId: Hex, w: Window): Promise<GroupLogItem[]> {
  const topic0 = [
    encodeEventTopics({ abi: [createdEvent] })[0],
    encodeEventTopics({ abi: [contributionEvent] })[0],
  ]
  const logs = await client.request({
    method: 'eth_getLogs',
    params: [{ address: SPLITPAY_ADDRESS!, fromBlock: toHex(w.from), toBlock: toHex(w.to), topics: [topic0, groupId] }],
  })
  const out: GroupLogItem[] = []
  for (const l of logs) {
    if (l.blockNumber === null || l.transactionHash === null || l.logIndex === null) continue
    const decoded = decodeEventLog({ abi: splitPayAbi, data: l.data, topics: l.topics })
    const block = BigInt(l.blockNumber)
    if (decoded.eventName === 'GroupCreated') out.push({ kind: 'created', block })
    else if (decoded.eventName === 'ContributionReceived')
      out.push({
        kind: 'contribution',
        c: {
          contributor: decoded.args.contributor,
          amount: decoded.args.amount,
          totalAfter: decoded.args.totalCollected,
          name: decoded.args.name,
          txHash: l.transactionHash,
          blockNumber: block,
          logIndex: Number(BigInt(l.logIndex)),
        },
      })
  }
  return out
}

async function scanGroup(cache: HistoryCache, groupId: Hex, from: bigint, to: bigint, record: boolean) {
  const clients = endpointClients()
  await runGroupScan({
    cache,
    from,
    to,
    record,
    endpoints: clients.length,
    fetchChunk: (w, i) => fetchGroupLogs(clients[i % clients.length], groupId, w),
  })
}

/** The history scan itself, separated from the network so it can be tested. Saves what it finds and the cursor after every chunk. */
export async function runGroupScan(o: {
  cache: HistoryCache
  from: bigint
  to: bigint
  /** True when scanning forward from the saved cursor; false when repairing history before the starting point. */
  record: boolean
  endpoints: number
  fetchChunk: (w: Window, endpoint: number) => Promise<GroupLogItem[]>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}) {
  const { cache, from, record } = o
  const res = await scanRange<GroupLogItem>({
    from,
    to: o.to,
    endpoints: o.endpoints,
    fetchChunk: o.fetchChunk,
    sleep: o.sleep,
    now: o.now,
    memory,
    onChunk: ({ items, frontier }) => {
      cache.merge(items.flatMap((x) => (x.kind === 'contribution' ? [x.c] : [])))
      for (const x of items) if (x.kind === 'created') cache.noteCreated(x.block)
      // Save after every chunk: a reload part way through resumes here instead of starting again.
      if (record && frontier >= from) cache.advance(frontier)
      else cache.persist()
    },
  })
  if (!res.complete) throw new IncompleteScanError(res.failed.length || 1)
}

/**
 * Bring one group's payment history up to date. Starts after the saved cursor; with nothing saved it starts at the
 * creation block (the ?b= hint, or the block of a GroupCreated event already seen), falling back to the contract's first block.
 * If the payments found add up to less than the onchain total, the history before the starting point is read once to repair it.
 */
export function syncGroupHistory(cache: HistoryCache, groupId: Hex, hint: bigint | null, collected: bigint | undefined) {
  return cache.exclusive(async () => {
    const begin = async () => {
      const head = await headBlock()
      const first = cache.cursor !== null ? cache.cursor + 1n : (cache.createdBlock ?? hint ?? DEPLOY_BLOCK)
      const from = first < DEPLOY_BLOCK ? DEPLOY_BLOCK : first
      if (cache.cursor === null) cache.noteStart(from)
      if (from <= head) await scanGroup(cache, groupId, from, head, true)
      return head
    }
    await begin()
    if (collected !== undefined && cache.total() < collected) {
      // The chain may simply have moved on since `collected` was read: look at the newest blocks again first.
      await begin()
      const floor = cache.floor
      if (cache.total() < collected && floor !== null && floor > DEPLOY_BLOCK) {
        await scanGroup(cache, groupId, DEPLOY_BLOCK, floor - 1n, false)
        cache.noteStart(DEPLOY_BLOCK)
        cache.persist()
      }
    }
  })
}

/**
 * All payments for one group. The saved history appears at once; new blocks are read in the background (several windows at
 * a time) and never block the page. A failed window is retried on another endpoint and nothing already loaded is dropped.
 */
export function useContributions(groupId: Hex | undefined, collected: bigint | undefined, hintBlock: bigint | null) {
  const cache = useMemo(() => (groupId ? new HistoryCache(groupId) : null), [groupId])
  const items = useSyncExternalStore(
    cache ? cache.subscribe : () => () => undefined,
    () => (cache ? cache.items() : EMPTY),
  )
  const query = useQuery({
    // Re-runs when the onchain total changes, so a new payment shows up within seconds (a short, resumed scan).
    queryKey: ['group-history', TARGET_CHAIN_ID, groupId?.toLowerCase(), collected?.toString() ?? ''],
    enabled: Boolean(cache && SPLITPAY_ADDRESS),
    retry: 8,
    retryDelay: (n) => Math.min(15_000, 800 * 2 ** n),
    refetchOnWindowFocus: false,
    queryFn: async () => {
      await syncGroupHistory(cache!, groupId!, hintBlock, collected)
      return true
    },
  })
  return {
    items,
    /** True while reading blocks, including the wait between retries. */
    syncing: query.isFetching || query.failureCount > 0,
    /** Only when nothing at all could be loaded. A partial list is shown as is. */
    error: query.isError && items.length === 0 ? 'Could not load payment history yet. We will keep trying.' : null,
    resync: query.refetch,
  }
}

const EMPTY: Contribution[] = []

export interface CreatedGroup {
  groupId: Hex
  recipient: Address
  target: bigint
  deadline: bigint
  metadataHash: Hex
  blockNumber: bigint
}

/**
 * Find the groups created by one wallet (creator is an indexed topic, compared without regard to case by the node).
 * Resumes from the saved cursor, reads several windows at once, saves what it finds and the cursor after EVERY chunk,
 * and throws IncompleteScanError (after keeping everything loaded) if some windows still failed.
 */
export async function syncMyGroups(creator: Address, onChange?: () => void, signal?: AbortSignal): Promise<void> {
  if (!SPLITPAY_ADDRESS) return
  const clients = endpointClients()
  const head = await headBlock(clients)
  const cursor = getCursor(creator)
  const from = cursor !== null ? cursor + 1n : DEPLOY_BLOCK
  if (from > head) return
  await scanMyGroups({
    creator,
    from,
    to: head,
    endpoints: clients.length,
    signal,
    onChange,
    fetchChunk: async (w, i) => {
      const logs = await clients[i % clients.length].getLogs({
        address: SPLITPAY_ADDRESS,
        event: createdEvent,
        args: { creator },
        fromBlock: w.from,
        toBlock: w.to,
        strict: true,
      })
      return logs.map((l) => ({
        groupId: l.args.groupId,
        recipient: l.args.recipient,
        target: l.args.target,
        deadline: BigInt(l.args.deadline),
        metadataHash: l.args.metadataHash,
        blockNumber: l.blockNumber,
      }))
    },
  })
}

/** The scan itself, separated from the network so it can be tested: saves groups and the cursor after every chunk. */
export async function scanMyGroups(o: {
  creator: Address
  from: bigint
  to: bigint
  endpoints: number
  fetchChunk: (w: Window, endpoint: number) => Promise<CreatedGroup[]>
  onChange?: () => void
  signal?: AbortSignal
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}): Promise<void> {
  const res = await scanRange<CreatedGroup>({
    from: o.from,
    to: o.to,
    endpoints: o.endpoints,
    signal: o.signal,
    sleep: o.sleep,
    now: o.now,
    memory,
    fetchChunk: o.fetchChunk,
    onChunk: ({ items, frontier }) => {
      if (items.length) rememberGroups(o.creator, items.map((g) => ({ groupId: g.groupId, block: g.blockNumber.toString() })))
      const saved = getCursor(o.creator)
      if (frontier >= o.from && (saved === null || frontier > saved)) saveCursor(o.creator, frontier)
      o.onChange?.()
    },
  })
  if (!res.complete) throw new IncompleteScanError(res.failed.length || 1)
}
