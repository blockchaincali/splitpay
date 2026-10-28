# SplitPay

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

## What this app does

SplitPay lets an organiser create a USDC payment group (title, goal, deadline, receiving wallet), share a link, and collect contributions. Funds go straight from contributors to the recipient through `SplitPayGroups`; the contract holds nothing. Onchain state is authoritative for every amount and for payment success.

## Tech stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, wagmi v2, viem, ConnectKit (injected wallets), Sonner
- Contracts: Solidity 0.8.28 + Foundry. `contracts/SplitPayGroups.sol`, tests in `contracts/test/`
- Chain: Arc Testnet (5042002). USDC ERC-20 (6 decimals) at `0x3600000000000000000000000000000000000000`. Gas is also USDC (18-decimal native view): never show or sum both views.

## Deployed contracts

- Arc Testnet: `SplitPayGroups` `0xd7f9c3823e81fe27300693c060a6418ad3eed806`
  - Deploy tx `0x7bf806f4ab7864f97b0a643b0f8f1a90b73ae8cf7d680da2249673f993c028cc`, block 69502501
  - Wired through `.env`: `VITE_SPLITPAY_ADDRESS`, `VITE_SPLITPAY_DEPLOY_BLOCK`
- Mainnet: NOT deployed. Do not deploy or send real USDC without the user's explicit approval in chat.

## Key decisions

- Group id = `keccak256(abi.encode(creator, salt))` (stops id front-running). Client derives it in `src/lib/useCreateGroup.ts`.
- Off-chain details (title, description, split plan, recipient, target, deadline) live in the share link query `?d=` as base64url JSON. Its keccak256 is stored onchain as `metadataHash`; `src/lib/metadata.ts` verifies it. A `?b=` block hint speeds log scans.
- Nicknames: at most 24 UTF-8 bytes, emitted in `ContributionReceived`, public and permanent. The UI says so.
- Recipient cannot contribute to its own group.
- Shareable pages use path routes (`/g/:id?d=...&b=...`), not hash routes. Share links come from `buildShareLink` in `src/lib/share.ts`.
- "Done" in the pay flow is only set after the receipt status is success AND the `ContributionReceived` log is decoded (`src/lib/usePayShare.ts`).
- Mainnet: the app targets Arc Testnet unless `VITE_SPLITPAY_CHAIN_ID=5042`. The user acknowledged the mainnet risk warning for documentation only. `docs/MAINNET_CHECKLIST.md` is documentation; nothing has been deployed to mainnet.
- Fonts are self-hosted (`@fontsource-variable/*`) so text renders even when third-party font CDNs are blocked.
- The Arc Studio watermark in `src/main.tsx` sits in page flow (not fixed) so it never covers content.

## Key files

- `src/lib/` deployment config, ABI (generated from `forge build`), metadata, splits, group data, pay/create hooks
- `src/pages/` Home, CreateGroup, GroupPage, Dashboard
- `src/components/` PayPanel, ProgressCard, SplitEditor, ShareLinkCard, ReceiptList, StatusSteps
- `contracts/test-integration/e2e-testnet.ts` live testnet check; `lib.test.ts` library tests
- `docs/SECURITY_REVIEW.md`, `docs/e2e-testnet-report.json`

## To run

```bash
bun install
bun run dev
bun run contracts:test
```

If the contract changes: `forge build`, regenerate `src/lib/splitpayAbi.ts` from `contracts/out/SplitPayGroups.sol/SplitPayGroups.json`, redeploy, update `.env`.

## consumer-v2 (branch)

- Frozen release: tag `v1.0.0` on `main`. Never edit `contracts/SplitPayGroups.sol` or redeploy it from this branch (`git diff v1.0.0 -- contracts/SplitPayGroups.sol contracts/test` must stay empty).
- API server in `server/` (Bun, SQLite in WAL mode, one process owns the file). Dev: `bun run server` on 3001, Vite proxies `/api`. Never delete and rebuild `server/data/*.db` to "fix" an integrity error: stop and tell the user.
- Truth rule: only Arc decides whether someone paid. Sandbox NGN intents are always `settledOnArc: false` and `countsTowardCollected: false`. Do not change that without a real provider integration and legal sign-off.
- Honest labels: every integration is `live`, `sandbox`, `needs-credentials` or `planned` (`server/payments.ts`, shown on the Account page). Do not describe sandbox flows as live.
- SplitPay testnet wallet (`src/wallet/embedded.ts`) is testnet only and disabled on mainnet. Do not market it as production custody.
- Secrets: provider keys live in server environment variables only. Never ask for them in chat, never put them in `VITE_` variables.
- Docs: `docs/V2_ARCHITECTURE.md`, `docs/INTEGRATIONS_RESEARCH.md`, `docs/GRANT_APPLICATION.md`, `docs/TEST_EVIDENCE.md`.
