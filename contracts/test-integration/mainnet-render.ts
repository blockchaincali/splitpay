// Helper for mainnet-config.test.ts: renders the shell with whatever VITE_* environment this process was started with
// and prints JSON. Run it as a subprocess so each network gets its own fresh module state.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mq = { matches: false, addEventListener() {}, removeEventListener() {} }
Object.assign(globalThis, {
  window: { location: { pathname: '/', search: '', hash: '', origin: 'http://localhost' }, addEventListener() {}, removeEventListener() {}, matchMedia: () => mq },
})

const dep = await import('../../src/lib/deployment')
const { Home } = await import('../../src/pages/Home')
const { SiteHeader } = await import('../../src/components/SiteHeader')
const { SiteFooter } = await import('../../src/components/SiteFooter')
const { endpointUrls } = await import('../../src/lib/rpcClients')
const { buildTxExplorerUrl, buildAddressExplorerUrl } = await import('../../src/onchain-facts')
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

console.log(
  JSON.stringify({
    chainId: dep.TARGET_CHAIN_ID,
    isMainnet: dep.IS_MAINNET,
    address: dep.SPLITPAY_ADDRESS ?? null,
    deployBlock: dep.DEPLOY_BLOCK.toString(),
    usdc: { address: dep.USDC?.address, decimals: dep.USDC?.decimals },
    scanEndpoints: endpointUrls(),
    txUrl: buildTxExplorerUrl(dep.TARGET_CHAIN_ID, '0xabc'),
    addressUrl: buildAddressExplorerUrl(dep.TARGET_CHAIN_ID, '0x00000000000000000000000000000000000000A1'),
    home: html(createElement(Home)),
    header: html(createElement(SiteHeader, { wallet: createElement('span', null, 'w'), walletCompact: createElement('span', null, 'w') })),
    footer: html(createElement(SiteFooter)),
  }),
)
