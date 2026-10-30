# SplitPay

> Branch `consumer-v2` (this branch adds accounts, invitations, reminders and the NGN sandbox on top of the release line). The frozen Arc Microgrants release is tag `v1.0.0`; `v1.0.1` adds hosting config and documents. The deployed contract is the same everywhere. Release steps and what needs the owner: `docs/RELEASE_CHECKLIST.md`.

SplitPay helps friends, roommates and organisers collect shared expenses in USDC. Create a payment group, share one link (for example in WhatsApp), and watch contributions arrive. Payments go straight from each contributor to the receiving wallet: SplitPay never holds the money.

Built with [Arc Studio](https://studio.arc.io)

## Grant submission (Arc Microgrants Round 2)

- Arc Studio project URL: https://studio.arc.io/app/b48c1672-5469-4cc3-9277-20e5e45cd5e8
- Live app URL: https://splitpay-sepia.vercel.app (Vercel production, Arc mainnet)
- Public repository: https://github.com/blockchaincali/splitpay

### Arc mainnet (chain ID 5042): live

Deployed by the owner from their own wallet and checked read-only on 30 October 2026. Full record and verification results: [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md).

| Item | Value |
|------|-------|
| Mainnet contract address (`SplitPayGroups`) | [`0x5E02A090D6fbEADeF2cAb310Da64C222677A809a`](https://explorer.arc.io/address/0x5E02A090D6fbEADeF2cAb310Da64C222677A809a) (source verified on the explorer, per the owner) |
| Mainnet deploy transaction | [`0xdb5807f12cff462ce71b09562f808a1f1f84c72c7fa70ba608de261a5d75bcab`](https://explorer.arc.io/tx/0xdb5807f12cff462ce71b09562f808a1f1f84c72c7fa70ba608de261a5d75bcab) |
| Mainnet deploy block | 28666906 |
| First real USDC payment transactions (0.25 USDC each, into the same group) | [`0x2271805f…2b0d`](https://explorer.arc.io/tx/0x2271805f7af74b98f79385dd5cb8703602cc28d485c37c73821e6eca8cbb2b0d) and [`0x20c05490…f8a6`](https://explorer.arc.io/tx/0x20c0549036ed7393c7b1c5603c9fd0b0fa1a6f28ce377d9b31e063fbad49f8a6) |
| Explorer | https://explorer.arc.io |

Read-only checks against three Arc mainnet endpoints: the deployed runtime code is identical to this repository's build of `contracts/SplitPayGroups.sol` (ignoring the compiler's metadata hash), `usdc()` is the official USDC `0x3600000000000000000000000000000000000000`, `MAX_NAME_BYTES()` is 24, and both payments emitted `ContributionReceived` from this contract and moved USDC straight to the group's recipient. No independent security audit is recorded in this repository (`docs/SECURITY_REVIEW.md` is an automated review).

### Arc Testnet (chain ID 5042002), what has been verified

- Contract: `SplitPayGroups` at `0xd7f9c3823e81fe27300693c060a6418ad3eed806` ([explorer](https://explorer.testnet.arc.io/address/0xd7f9c3823e81fe27300693c060a6418ad3eed806))
- Deployment transaction: `0x7bf806f4ab7864f97b0a643b0f8f1a90b73ae8cf7d680da2249673f993c028cc`, block 69502501
- Contract tests: 70 passing (unit, bad-token, fuzz and invariant tests), also passing on Arc's own runtime with `arc-forge test --network arc`
- Live testnet check: 31 of 31 checks passing (`bun run e2e:testnet`), hashes in `docs/e2e-testnet-report.json`
- A fresh copy deployed with Arc Foundry and an encrypted keystore, exactly as the mainnet steps describe, has runtime code identical to the grant contract and is verified on the testnet explorer
- Browser checks of the running app (create, share link, verify, pay, confirm, "Your groups") with test wallets: passing
- Security review: see `docs/SECURITY_REVIEW.md`. It is an automated review, not an independent audit

## What it does

- Create a group with a title, description, goal in USDC, deadline and receiving wallet.
- Share a unique link and QR code. Anyone can open it on a phone.
- Split equally or with custom amounts per person.
- Contributors connect an EVM wallet and pay their share in USDC.
- Live progress: paid so far, still to pay, and every confirmed payment with its transaction link.
- Organiser dashboard listing your groups and what each has collected.
- Optional public nickname with each payment (24 bytes at most, visible onchain to everyone).

### New on `consumer-v2`

- Sign in with an email code. Groups, invitations and people follow your account to any device.
- Link a wallet to your account by signing a message (free, no transaction).
- SplitPay testnet wallet: try it with no browser extension. Testnet only, protected by a PIN.
- Invite people by link or email, see who has paid (read from Arc), and send reminders (at most one a day per person).
- Choose how to pay: USDC on Arc (live), or an NGN bank transfer shown as a sandbox demo with a quote, fees and status steps. The NGN demo moves no money and never counts toward a group's total.
- The Account page lists what is live, what is a demo, and what still needs setup.

See `docs/V2_ARCHITECTURE.md`, `docs/INTEGRATIONS_RESEARCH.md`, `docs/GRANT_APPLICATION.md` and `docs/TEST_EVIDENCE.md`.

A payment is only shown as complete after the network has confirmed it.

## Tech stack

- React, TypeScript, Vite, Tailwind CSS
- wagmi and viem for wallets and chain access
- Solidity 0.8.28 with OpenZeppelin (SafeERC20, ReentrancyGuard), built and tested with Foundry
- Arc Testnet, USDC as the 6-decimal ERC-20

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
bun run dev        # the app on port 5173 (proxies /api to the server)
bun run server     # the API on port 3001, in a second terminal
```

For a single-process production run: `bun run build && bun run start` (or use the `Dockerfile`, which serves the app and API together on port 7860 and keeps its database in `/data`). The v2 server needs a host that runs a process and keeps a volume; static-only hosts work only for the frozen v1 release.

### Environment variables

SplitPay is wallet-first. Accounts (email sign-in, invitations, reminders, the NGN sandbox) are optional and off by default. They show up only when the build has `VITE_ACCOUNTS_ENABLED=true` **and** `/api/health` answers. A static host without the API (for example Vercel) shows none of it and needs no server.

Frontend values are public only. Never put private keys in `VITE_` variables. Server values go in the host's secret store; `.env.example` lists all of them.

- `VITE_SPLITPAY_ADDRESS`: deployed `SplitPayGroups` contract address on the network you target.
- `VITE_SPLITPAY_DEPLOY_BLOCK`: block the contract was deployed in (where history scans start).
- `VITE_SPLITPAY_CHAIN_ID`: optional. Leave unset for Arc Testnet. `5042` targets Arc mainnet (real USDC, mainnet RPC endpoints, explorer.arc.io); read `docs/MAINNET_CHECKLIST.md` first.
- On Vercel these three are set in the project's Environment Variables (nothing is hard-coded in `vercel.json`). Use mainnet values for Production and testnet values for Preview.

Server (all optional in development): `APP_ENV`, `PORT` or `SERVER_PORT`, `DATABASE_PATH`, `SERVER_SECRET`, `APP_BASE_URL`, `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`, `YELLOWCARD_API_KEY`, `YELLOWCARD_SECRET_KEY`, `YELLOWCARD_BASE_URL`, `SANDBOX_NGN_PER_USDC`, `SANDBOX_PROVIDER_FEE_BPS`. In development, sign-in codes appear in the app instead of being emailed. In production the server refuses to send mail until a provider is configured. The sandbox NGN rate is a demo number, not market data.

### Scripts

```bash
bun run contracts:build   # compile contracts
bun run contracts:test    # Foundry tests
bun run test:lib          # split and share-link tests
bun run test:server       # API server tests
bun run test:landing      # landing page structure and copy
bun run test:security     # production build contains no Studio hooks
bun run test:accounts     # accounts stay optional (wallet-first)
bun run test:mainnet      # mainnet config matches Arc's docs (chain, RPCs, explorer, USDC)
bun run server            # start the API server
bun run start             # production mode (serves dist and /api)
bun run e2e:testnet       # live Arc Testnet checks with throwaway wallets (see the script header)
bun run check             # lint and typecheck
bun run build             # production build
```

### Deploying the contract

`contracts/script/DeploySplitPayGroups.s.sol` deploys `SplitPayGroups` with the USDC address you give it. Sign with a Foundry keystore or hardware wallet, never a pasted private key:

```bash
export USDC_ADDRESS=0x3600000000000000000000000000000000000000
export RPC_URL=https://rpc.testnet.arc.io
forge script contracts/script/DeploySplitPayGroups.s.sol:DeploySplitPayGroups \
  --rpc-url "$RPC_URL" --account "$KEYSTORE_NAME" --broadcast
```

Then set `VITE_SPLITPAY_ADDRESS` and `VITE_SPLITPAY_DEPLOY_BLOCK` in `.env` and restart the dev server.

## Good to know

- Amounts are always in the 6-decimal USDC token view. On Arc, gas is also paid in USDC, so wallets need a little extra for fees.
- The receiving wallet is fixed when a group is created, and cannot pay into its own group.
- If USDC refuses to pay a receiving wallet, payments to that group fail without moving any money. Create a new group with a different wallet.
- Group titles and splits live inside the share link and are checked against a hash stored onchain. Nothing is stored on a server.
