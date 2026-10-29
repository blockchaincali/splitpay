/**
 * End-to-end check of SplitPayGroups on Arc Testnet with throwaway wallets.
 *
 *   E2E_KEYS=/tmp/e2e/keys.json bun run contracts/test-integration/e2e-testnet.ts
 *
 * keys.json holds { organiser, payer, recipient } private keys generated for this test only.
 * Never put a real key here. Needs a little test USDC in organiser and payer (gas is paid in USDC).
 * Reuses the app's own metadata/split code so the link format is tested too.
 */
import { createPublicClient, createWalletClient, encodeAbiParameters, erc20Abi, getAbiItem, http, keccak256, parseEventLogs, toHex, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { splitPayAbi } from '../../src/lib/splitpayAbi'
import { decodeMeta, encodeMetaText, serializeMeta, verifyMeta, type GroupMeta } from '../../src/lib/metadata'
import { equalShares } from '../../src/lib/splits'

const keys = JSON.parse(await Bun.file(process.env.E2E_KEYS ?? '/tmp/e2e/keys.json').text()) as Record<'organiser' | 'payer' | 'recipient', Hex>
const SPLITPAY = process.env.VITE_SPLITPAY_ADDRESS as Hex
const DEPLOY_BLOCK = BigInt(process.env.VITE_SPLITPAY_DEPLOY_BLOCK ?? '0')
const USDC = '0x3600000000000000000000000000000000000000' as const
const rpc = 'https://rpc.testnet.arc.io'

const pub = createPublicClient({ chain: arcTestnet, transport: http(rpc) })
const acct = { organiser: privateKeyToAccount(keys.organiser), payer: privateKeyToAccount(keys.payer), recipient: privateKeyToAccount(keys.recipient) }
const wallet = (a: ReturnType<typeof privateKeyToAccount>) => createWalletClient({ account: a, chain: arcTestnet, transport: http(rpc) })

const results: { name: string; ok: boolean; detail?: string }[] = []
const txs: Record<string, Hex> = {}
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
async function expectRevert(name: string, fn: () => Promise<unknown>, needle: string) {
  try {
    await fn()
    check(name, false, 'did not revert')
  } catch (e) {
    const text = String((e as { shortMessage?: string }).shortMessage ?? e) + String((e as Error).message)
    check(name, text.includes(needle), needle)
  }
}
const bal = (who: Hex) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [who] })
const send = async (label: string, who: keyof typeof acct, req: Parameters<ReturnType<typeof wallet>['writeContract']>[0]) => {
  const hash = await wallet(acct[who]).writeContract(req)
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 })
  txs[label] = hash
  check(`${label}: tx mined with status success`, r.status === 'success', hash)
  return r
}
const derive = (creator: Hex, salt: Hex) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [creator, salt]))
const salt = () => toHex(crypto.getRandomValues(new Uint8Array(32)))

// ---- 0. sanity: contract + token wiring, 6-decimal ERC-20 view
check('contract points at Arc USDC', (await pub.readContract({ address: SPLITPAY, abi: splitPayAbi, functionName: 'usdc' })).toLowerCase() === USDC)
check('USDC ERC-20 view has 6 decimals', (await pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' })) === 6)
check('nickname limit is 24 bytes', (await pub.readContract({ address: SPLITPAY, abi: splitPayAbi, functionName: 'MAX_NAME_BYTES' })) === 24n)

// ---- 1. organiser creates a 1.00 USDC group split four ways
const target = 1_000_000n
const shares = equalShares(target, 4)
check('equal split of 1.00 USDC / 4 = 0.25 each, exact', shares.every((s) => s === 250_000n) && shares.reduce((a, b) => a + b) === target)
const deadline = Math.floor(Date.now() / 1000) + 3600
const meta: GroupMeta = { v: 1, t: 'E2E cabin', d: 'Test group', r: acct.recipient.address.toLowerCase(), g: target.toString(), e: deadline, m: 'equal', n: 4 }
const metaText = serializeMeta(meta)
const metaHash = keccak256(toHex(metaText))
const saltA = salt()
const groupId = derive(acct.organiser.address, saltA)
const created = await send('createGroup', 'organiser', { address: SPLITPAY, abi: splitPayAbi, functionName: 'createGroup', args: [saltA, acct.recipient.address, target, BigInt(deadline), metaHash] })
const createdEvt = parseEventLogs({ abi: splitPayAbi, eventName: 'GroupCreated', logs: created.logs })[0]
check('GroupCreated emitted with derived id', createdEvt?.args.groupId === groupId)
check('groupIdFor matches the app derivation', (await pub.readContract({ address: SPLITPAY, abi: splitPayAbi, functionName: 'groupIdFor', args: [acct.organiser.address, saltA] })) === groupId)
const [creator, recipient, tgt, dl, collected0, mh] = await pub.readContract({ address: SPLITPAY, abi: splitPayAbi, functionName: 'getGroup', args: [groupId] })
check('onchain terms match', creator === acct.organiser.address && recipient === acct.recipient.address && tgt === target && BigInt(dl) === BigInt(deadline) && collected0 === 0n)
const decoded = decodeMeta(encodeMetaText(metaText))
check('share-link details verify against onchain hash', verifyMeta(decoded, { metadataHash: mh, recipient, target: tgt, deadline: BigInt(dl) }) === 'verified')
check('tampered link details are flagged', verifyMeta(decodeMeta(encodeMetaText(metaText.replace('E2E cabin', 'Evil cabin'))), { metadataHash: mh, recipient, target: tgt, deadline: BigInt(dl) }) === 'mismatch')

// ---- 2. front-run squat attempt: same salt from another wallet gets a different id
const squat = derive(acct.payer.address, saltA)
check('same salt from another wallet cannot take over the id', squat !== groupId)

// ---- 3. payer pays: exact allowance, then contribute with a UTF-8 nickname
const recipientBefore = await bal(acct.recipient.address)
const name = 'Amina 😀'
await expectRevert('pay without any allowance reverts', () => pub.simulateContract({ account: acct.payer, address: SPLITPAY, abi: splitPayAbi, functionName: 'contribute', args: [groupId, 250_000n, name] }), 'allowance')
await send('approve exact 0.25', 'payer', { address: USDC, abi: erc20Abi, functionName: 'approve', args: [SPLITPAY, 250_000n] })
check('allowance is exactly 0.25 USDC', (await pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [acct.payer.address, SPLITPAY] })) === 250_000n)
await expectRevert('25-byte nickname rejected', () => pub.simulateContract({ account: acct.payer, address: SPLITPAY, abi: splitPayAbi, functionName: 'contribute', args: [groupId, 250_000n, 'x'.repeat(25)] }), 'NameTooLong')
const paid = await send('contribute 0.25', 'payer', { address: SPLITPAY, abi: splitPayAbi, functionName: 'contribute', args: [groupId, 250_000n, name] })
const evt = parseEventLogs({ abi: splitPayAbi, eventName: 'ContributionReceived', logs: paid.logs })[0]
check('ContributionReceived has amount, running total and nickname', evt?.args.amount === 250_000n && evt.args.totalCollected === 250_000n && evt.args.name === name && evt.args.contributor === acct.payer.address)
check('recipient received the USDC directly', (await bal(acct.recipient.address)) - recipientBefore === 250_000n)
check('contract holds no USDC (no escrow)', (await bal(SPLITPAY)) === 0n)
check('allowance consumed (no leftover approval)', (await pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [acct.payer.address, SPLITPAY] })) === 0n)
check('contributionOf tracks the wallet', (await pub.readContract({ address: SPLITPAY, abi: splitPayAbi, functionName: 'contributionOf', args: [groupId, acct.payer.address] })) === 250_000n)

// ---- 4. overpayment, recipient self-pay, exact fill, then closed
await send('approve exact 0.75', 'payer', { address: USDC, abi: erc20Abi, functionName: 'approve', args: [SPLITPAY, 750_000n] })
await expectRevert('overpayment (0.80 > 0.75 left) reverts', () => pub.simulateContract({ account: acct.payer, address: SPLITPAY, abi: splitPayAbi, functionName: 'contribute', args: [groupId, 800_000n, ''] }), 'TargetExceeded')
await expectRevert('recipient cannot pay its own group', () => pub.simulateContract({ account: acct.recipient, address: SPLITPAY, abi: splitPayAbi, functionName: 'contribute', args: [groupId, 100_000n, ''] }), 'RecipientCannotContribute')
await send('contribute 0.75 (fills the goal)', 'payer', { address: SPLITPAY, abi: splitPayAbi, functionName: 'contribute', args: [groupId, 750_000n, ''] })
check('group is exactly fully collected', (await pub.readContract({ address: SPLITPAY, abi: splitPayAbi, functionName: 'totalCollected', args: [groupId] })) === target && (await pub.readContract({ address: SPLITPAY, abi: splitPayAbi, functionName: 'remaining', args: [groupId] })) === 0n)
await expectRevert('payment after the goal is reached reverts', () => pub.simulateContract({ account: acct.payer, address: SPLITPAY, abi: splitPayAbi, functionName: 'contribute', args: [groupId, 1n, ''] }), 'TargetExceeded')

// ---- 5. expired group
const saltB = salt()
const soon = Math.floor(Date.now() / 1000) + 12
await send('createGroup (12s deadline)', 'organiser', { address: SPLITPAY, abi: splitPayAbi, functionName: 'createGroup', args: [saltB, acct.recipient.address, 500_000n, BigInt(soon), keccak256(toHex('expiring'))] })
const expiringId = derive(acct.organiser.address, saltB)
for (let i = 0; i < 40; i++) {
  if ((await pub.getBlock()).timestamp > BigInt(soon)) break
  await new Promise((r) => setTimeout(r, 2000))
}
await expectRevert('payment after the deadline reverts', () => pub.simulateContract({ account: acct.payer, address: SPLITPAY, abi: splitPayAbi, functionName: 'contribute', args: [expiringId, 100_000n, ''] }), 'GroupExpired')

// ---- 6. the app's log queries find everything
const head = await pub.getBlockNumber()
const logs = await pub.getLogs({ address: SPLITPAY, event: getAbiItem({ abi: splitPayAbi, name: 'ContributionReceived' }), args: { groupId }, fromBlock: created.blockNumber, toBlock: head, strict: true })
check('log scan from the creation block finds both payments with names', logs.length === 2 && logs[0].args.name === name && logs.reduce((s, l) => s + l.args.amount, 0n) === target)
// The public RPC rejects very wide ranges ("requested range too large"), so scan in chunks and halve on error, like the app does.
const created_event = getAbiItem({ abi: splitPayAbi, name: 'GroupCreated' })
const mine: { args: { groupId: Hex } }[] = []
{
  let size = 5000n
  for (let from = DEPLOY_BLOCK; from <= head; ) {
    const to = from + size - 1n > head ? head : from + size - 1n
    try {
      mine.push(...(await pub.getLogs({ address: SPLITPAY, event: created_event, args: { creator: acct.organiser.address }, fromBlock: from, toBlock: to, strict: true })))
      from = to + 1n
    } catch (e) {
      if (size <= 100n) throw e
      size /= 2n
    }
  }
}
check('organiser dashboard scan finds both groups', mine.length >= 2 && mine.some((l) => l.args.groupId === groupId))

const failed = results.filter((r) => !r.ok)
await Bun.write('/home/user/app/docs/e2e-testnet-report.json', JSON.stringify({ network: 'Arc Testnet', contract: SPLITPAY, groupId, transactions: txs, passed: results.length - failed.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
