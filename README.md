# SplitPay

> Release line `v1.0.x` (Arc Microgrants MVP, Arc Testnet). The contract is frozen at `v1.0.0`. Accounts, invitations, the NGN sandbox and server work live on the separate `consumer-v2` branch. Release steps and what needs the owner: `docs/RELEASE_CHECKLIST.md`.

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
bun run dev
```

### Environment variables

Public values only. Never put private keys in `.env`.

- `VITE_SPLITPAY_ADDRESS`: deployed `SplitPayGroups` contract address.
- `VITE_SPLITPAY_DEPLOY_BLOCK`: block the contract was deployed in (where history scans start).
- `VITE_SPLITPAY_CHAIN_ID`: optional. Leave unset for Arc Testnet. `5042` switches the app to Arc mainnet (real USDC); read `docs/MAINNET_CHECKLIST.md` first.

### Scripts

```bash
bun run contracts:build   # compile contracts
bun run contracts:test    # Foundry tests
bun run test:lib          # split and share-link tests
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
