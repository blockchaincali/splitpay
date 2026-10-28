import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useReadContract, usePublicClient } from 'wagmi'
import { BaseError, ContractFunctionRevertedError, getAbiItem, type Address, type Hex, type PublicClient } from 'viem'
import { splitPayAbi } from './splitpayAbi'
import { DEPLOY_BLOCK, SPLITPAY_ADDRESS, TARGET_CHAIN_ID } from './deployment'

export interface Group {
  creator: Address
  recipient: Address
  target: bigint
  deadline: bigint
  collected: bigint
  metadataHash: Hex
}

export interface Contribution {
  contributor: Address
  amount: bigint
  totalAfter: bigint
  name: string
  txHash: Hex
  blockNumber: bigint
  logIndex: number
}

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

/** Fetch logs in block ranges, halving the range if the RPC rejects a wide request. */
async function chunkedLogs<T>(
  from: bigint,
  to: bigint,
  fetch: (a: bigint, b: bigint) => Promise<T[]>,
  onProgress?: (done: bigint, total: bigint) => void,
): Promise<T[]> {
  const out: T[] = []
  let size = 5000n
  let start = from
  while (start <= to) {
    const end = start + size - 1n > to ? to : start + size - 1n
    try {
      out.push(...(await fetch(start, end)))
      start = end + 1n
      onProgress?.(start - from, to - from + 1n)
    } catch (e) {
      if (size <= 100n) throw e
      size = size / 2n
    }
  }
  return out
}

/** All payments for one group, rebuilt from ContributionReceived logs. */
export function useContributions(groupId: Hex | undefined, collected: bigint | undefined, hintBlock: bigint | null) {
  const client = usePublicClient({ chainId: TARGET_CHAIN_ID }) as PublicClient | undefined
  const [progress, setProgress] = useState<number | null>(null)
  const cache = useRef<{ cursor: bigint | null; items: Contribution[]; fullScan: boolean }>({
    cursor: null,
    items: [],
    fullScan: false,
  })

  // Re-runs whenever the onchain collected total changes, so new payments appear within seconds.
  const query = useQuery({
    queryKey: ['contributions', TARGET_CHAIN_ID, groupId, collected?.toString()],
    enabled: Boolean(client && groupId && SPLITPAY_ADDRESS && collected !== undefined),
    placeholderData: keepPreviousData,
    retry: 2,
    queryFn: async (): Promise<Contribution[]> => {
      const c = cache.current
      const head = await client!.getBlockNumber()
      const load = async (from: bigint) => {
        const logs = await chunkedLogs(
          from,
          head,
          (a, b) =>
            client!.getLogs({
              address: SPLITPAY_ADDRESS,
              event: contributionEvent,
              args: { groupId },
              fromBlock: a,
              toBlock: b,
              strict: true,
            }),
          (done, total) => setProgress(Number((done * 100n) / total)),
        )
        return logs.map(
          (l): Contribution => ({
            contributor: l.args.contributor,
            amount: l.args.amount,
            totalAfter: l.args.totalCollected,
            name: l.args.name,
            txHash: l.transactionHash,
            blockNumber: l.blockNumber,
            logIndex: l.logIndex,
          }),
        )
      }
      try {
        const start = c.cursor !== null ? c.cursor + 1n : (hintBlock ?? DEPLOY_BLOCK)
        let merged = c.cursor !== null ? [...c.items] : []
        if (start <= head) merged = [...merged, ...(await load(start))]
        const sum = merged.reduce((s, x) => s + x.amount, 0n)
        // A quick scan from the creation block can miss history if the hint was wrong: rescan once from the contract's first block.
        if (sum !== collected && !c.fullScan && start > DEPLOY_BLOCK) {
          c.fullScan = true
          merged = await load(DEPLOY_BLOCK)
        }
        const seen = new Set<string>()
        merged = merged.filter((x) => {
          const k = `${x.txHash}:${x.logIndex}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        c.items = merged
        c.cursor = head
        return merged
      } finally {
        setProgress(null)
      }
    },
  })

  return {
    items: query.data ?? [],
    syncing: query.isFetching,
    progress,
    error: query.isError ? 'Could not load payment history. Retrying shortly.' : null,
    resync: query.refetch,
  }
}

export interface CreatedGroup {
  groupId: Hex
  recipient: Address
  target: bigint
  deadline: bigint
  metadataHash: Hex
  blockNumber: bigint
}

/** Groups created by one wallet, from GroupCreated logs (creator is an indexed topic). */
export async function fetchCreatedGroups(
  client: PublicClient,
  creator: Address,
  from: bigint,
  onProgress?: (pct: number) => void,
): Promise<{ groups: CreatedGroup[]; head: bigint }> {
  if (!SPLITPAY_ADDRESS) return { groups: [], head: from }
  const head = await client.getBlockNumber()
  if (from > head) return { groups: [], head }
  const logs = await chunkedLogs(
    from,
    head,
    (a, b) =>
      client.getLogs({
        address: SPLITPAY_ADDRESS,
        event: createdEvent,
        args: { creator },
        fromBlock: a,
        toBlock: b,
        strict: true,
      }),
    (done, total) => onProgress?.(Number((done * 100n) / total)),
  )
  return {
    head,
    groups: logs.map((l) => ({
      groupId: l.args.groupId,
      recipient: l.args.recipient,
      target: l.args.target,
      deadline: BigInt(l.args.deadline),
      metadataHash: l.args.metadataHash,
      blockNumber: l.blockNumber,
    })),
  }
}
