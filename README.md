# SplitPay

> Branch `consumer-v2` (this branch adds accounts, invitations, reminders and the NGN sandbox on top of the release line). The frozen Arc Microgrants release is tag `v1.0.0`; `v1.0.1` adds hosting config and documents. The deployed contract is the same everywhere. Release steps and what needs the owner: `docs/RELEASE_CHECKLIST.md`.

SplitPay helps friends, roommates and organisers collect shared expenses in USDC. Create a payment group, share one link (for example in WhatsApp), and watch contributions arrive. Payments go straight from each contributor to the receiving wallet: SplitPay never holds the money.

Built with [Arc Studio](https://studio.arc.io)

## Grant submission (Arc Microgrants Round 2)

- Arc Studio project URL: _paste your Arc Studio project URL here_
- Live app URL: _paste your Vercel URL here_
- Mainnet: **not deployed.** No real USDC has moved. The Arc Microgrants (Built with Arc Studio) round requires a mainnet deployment; see `docs/submission/ARC_MICROGRANTS_SUBMISSION.md`.
- Network: Arc Testnet (chain ID 5042002); see `docs/MAINNET_CHECKLIST.md` for the readiness checklist and independent deployment steps.
- Contract: `SplitPayGroups` at `0xd7f9c3823e81fe27300693c060a6418ad3eed806` ([explorer](https://explorer.testnet.arc.io/address/0xd7f9c3823e81fe27300693c060a6418ad3eed806))
- Deployment transaction: `0x7bf806f4ab7864f97b0a643b0f8f1a90b73ae8cf7d680da2249673f993c028cc`, block 69502501
- Contract tests: 70 passing (unit, bad-token, fuzz and invariant tests)
- Frontend library tests: 10 passing
- Live testnet check: 31 of 31 checks passing, with transaction hashes in `docs/e2e-testnet-report.json`
- Browser check of the running app (create, share link, verify, pay, confirm, dashboard) with test wallets on Arc Testnet: passing
- Security review: see `docs/SECURITY_REVIEW.md`

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

- `VITE_SPLITPAY_ADDRESS`: deployed `SplitPayGroups` contract address.
- `VITE_SPLITPAY_DEPLOY_BLOCK`: block the contract was deployed in (where history scans start).
- `VITE_SPLITPAY_CHAIN_ID`: optional. Leave unset for Arc Testnet. `5042` switches the app to Arc mainnet (real USDC); read `docs/MAINNET_CHECKLIST.md` first.

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
