import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { arc, arcTestnet } from 'viem/chains'
import { requireChain, getUsdc } from '../../src/onchain-facts'
import { rpcUrlsFor } from '../../src/lib/rpc'

const ROOT = join(import.meta.dir, '..', '..')

/**
 * Values below were read from Arc's official documentation on 29 October 2026:
 *   https://docs.arc.io/arc/references/rpc-endpoints.md      (endpoints, chain IDs, explorers)
 *   https://docs.arc.io/arc/references/contract-addresses.md (USDC, 6 decimals ERC-20 view)
 * If Arc changes them, these tests fail on purpose: re-check the docs, then update both.
 */
const DOCS = {
  mainnet: {
    chainId: 5042,
    explorer: 'https://explorer.arc.io',
    rpc: [
      'https://rpc.mainnet.arc.io',
      'https://rpc.blockdaemon.mainnet.arc.io',
      'https://rpc.drpc.mainnet.arc.io',
      'https://rpc.quicknode.mainnet.arc.io',
    ],
  },
  testnet: {
    chainId: 5042002,
    explorer: 'https://explorer.testnet.arc.io',
    rpc: [
      'https://rpc.testnet.arc.io',
      'https://rpc.blockdaemon.testnet.arc.io',
      'https://rpc.drpc.testnet.arc.io',
      'https://rpc.quicknode.testnet.arc.io',
    ],
  },
  usdc: '0x3600000000000000000000000000000000000000',
}

describe('Arc network facts match the official docs', () => {
  test('chain IDs, explorers and the USDC ERC-20 view (6 decimals, native view 18)', () => {
    for (const [name, net, chain] of [['mainnet', DOCS.mainnet, arc], ['testnet', DOCS.testnet, arcTestnet]] as const) {
      const f = requireChain(net.chainId)
      expect(f.chainId).toBe(net.chainId)
      expect(chain.id).toBe(net.chainId)
      expect(f.explorerBase).toBe(net.explorer)
      expect(f.nativeCurrency.decimals).toBe(18)
      const usdc = getUsdc(net.chainId)
      expect(`${name}:${usdc?.address.toLowerCase()}`).toBe(`${name}:${DOCS.usdc}`)
      expect(usdc?.decimals).toBe(6)
    }
  })

  test('the published RPC endpoints are all used for failover, the primary first', () => {
    expect(rpcUrlsFor(arc)).toEqual(DOCS.mainnet.rpc)
    expect(rpcUrlsFor(arcTestnet)).toEqual(DOCS.testnet.rpc)
  })

  test('the Vercel config no longer hard-codes a network, contract or block', () => {
    const v = readFileSync(join(ROOT, 'vercel.json'), 'utf8')
    expect(JSON.parse(v).build).toBeUndefined()
    expect(v).not.toMatch(/0x[0-9a-fA-F]{40}/)
    expect(v).not.toMatch(/VITE_SPLITPAY/)
    expect(v).not.toContain('69502501')
  })
})

interface Rendered {
  chainId: number
  isMainnet: boolean
  address: string | null
  deployBlock: string
  usdc: { address: string; decimals: number }
  scanEndpoints: string[]
  txUrl: string
  addressUrl: string
  home: string
  header: string
  footer: string
}

function render(env: Record<string, string>): Rendered {
  const p = Bun.spawnSync(['bun', 'run', join(ROOT, 'contracts/test-integration/mainnet-render.ts')], {
    cwd: ROOT,
    // The shell's own VITE_* values are replaced, so each case sees exactly the environment under test.
    env: { ...process.env, VITE_SPLITPAY_CHAIN_ID: '', VITE_SPLITPAY_ADDRESS: '', VITE_SPLITPAY_DEPLOY_BLOCK: '', ...env },
  })
  if (p.exitCode !== 0) throw new Error(p.stderr.toString().slice(0, 600))
  return JSON.parse(p.stdout.toString()) as Rendered
}

const FAKE = '0x00000000000000000000000000000000000000A1' // a placeholder, NOT a real contract

describe('VITE_SPLITPAY_CHAIN_ID=5042 targets Arc mainnet using the environment values', () => {
  const m = render({ VITE_SPLITPAY_CHAIN_ID: '5042', VITE_SPLITPAY_ADDRESS: FAKE, VITE_SPLITPAY_DEPLOY_BLOCK: '12345' })

  test('chain, contract and block come from the environment', () => {
    expect(m.chainId).toBe(5042)
    expect(m.isMainnet).toBe(true)
    expect(m.address).toBe(FAKE)
    expect(m.deployBlock).toBe('12345')
    expect(m.usdc).toEqual({ address: DOCS.usdc, decimals: 6 })
  })

  test('the scanner and failover use the mainnet endpoints, never the testnet ones', () => {
    expect(m.scanEndpoints).toEqual(DOCS.mainnet.rpc)
    expect(m.scanEndpoints.join(' ')).not.toContain('testnet')
  })

  test('explorer links point at explorer.arc.io', () => {
    expect(m.txUrl).toBe('https://explorer.arc.io/tx/0xabc')
    expect(m.addressUrl).toBe(`https://explorer.arc.io/address/${FAKE}`)
  })

  test('the page says real USDC and shows no test-network wording or faucet', () => {
    const markup = `${m.home} ${m.header} ${m.footer}`
    // What a person reads: visible text only (the section id "testnet" is an internal anchor, not wording).
    const text = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(/real USDC/i.test(text)).toBe(true)
    expect(text.match(/test USDC|test network|testnet|Get test|faucet/i)?.[0] ?? null).toBeNull()
    expect(markup.includes('explorer.arc.io')).toBe(true)
    expect(markup.includes('explorer.testnet.arc.io')).toBe(false)
    expect(markup.match(/https:\/\/faucet[^"]*/)?.[0] ?? null).toBeNull()
  })
})

describe('with no network setting the build stays on Arc Testnet', () => {
  const t = render({ VITE_SPLITPAY_ADDRESS: FAKE, VITE_SPLITPAY_DEPLOY_BLOCK: '7' })
  test('testnet defaults', () => {
    expect(t.chainId).toBe(5042002)
    expect(t.isMainnet).toBe(false)
    expect(t.scanEndpoints).toEqual(DOCS.testnet.rpc)
    expect(t.txUrl).toBe('https://explorer.testnet.arc.io/tx/0xabc')
    expect(/test USDC/.test(`${t.home} ${t.footer}`)).toBe(true)
  })
})

describe('the mainnet banner and wallet rules', () => {
  test('Layout shows the real-USDC banner on mainnet only', () => {
    const src = readFileSync(join(ROOT, 'src/components/Layout.tsx'), 'utf8')
    expect(src).toMatch(/IS_MAINNET \? \(/)
    expect(src).toContain('Arc mainnet: payments use real USDC and cannot be reversed.')
  })
  test('the browser-held testnet wallet is off on mainnet', () => {
    const src = readFileSync(join(ROOT, 'src/wallet/embedded.ts'), 'utf8')
    expect(src).toContain('export const embeddedAvailable = () => !IS_MAINNET')
  })
})
