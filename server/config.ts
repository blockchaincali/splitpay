import { requireChain } from '../src/onchain-facts'

const env = process.env

/** Server configuration. Secrets come from the environment only and are never sent to the browser. */
export const appEnv = (env.APP_ENV ?? 'development') as 'development' | 'production' | 'test'
export const isProd = appEnv === 'production'

const chainId = 5042002 // Arc Testnet. Mainnet is not enabled on the server.
const chain = requireChain(chainId)

function rpcUrl(): string {
  const chains = (env.RPC_PROXY_CHAINS ?? '').split(',')
  if (env.RPC_PROXY_BASE_URL && chains.includes('Arc_Testnet') && env.RPC_PROXY_TOKEN) {
    return `${env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${env.RPC_PROXY_TOKEN}`
  }
  return chain.rpcUrls[0]
}

export const config = {
  port: Number(env.SERVER_PORT ?? 3001),
  dbPath: env.DATABASE_PATH ?? 'server/data/splitpay.db',
  chainId,
  explorerBase: chain.explorerBase,
  rpcUrl: rpcUrl(),
  contract: (env.VITE_SPLITPAY_ADDRESS ?? '') as `0x${string}`,
  /** Public base URL used in emailed links. Falls back to the request Origin. */
  appBaseUrl: env.APP_BASE_URL ?? '',
  /** Development mail sink: codes and emails go to an in-app outbox instead of the internet. */
  devMail: !isProd && env.MAIL_PROVIDER !== 'resend',
  resendApiKey: env.RESEND_API_KEY ?? '',
  mailFrom: env.MAIL_FROM ?? 'SplitPay <no-reply@example.invalid>',
  googleClientId: env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
  yellowCard: {
    apiKey: env.YELLOWCARD_API_KEY ?? '',
    secretKey: env.YELLOWCARD_SECRET_KEY ?? '',
    baseUrl: env.YELLOWCARD_BASE_URL ?? 'https://sandbox.api.yellowcard.io/business',
  },
  /** Demo-only FX settings. These are NOT market data. */
  sandbox: {
    ngnPerUsdc: Number(env.SANDBOX_NGN_PER_USDC ?? 1500),
    providerFeeBps: Number(env.SANDBOX_PROVIDER_FEE_BPS ?? 100),
  },
}

export const STUDIO_ORIGINS = ['https://studio.arc.io', 'https://studio-staging.arc.io']
