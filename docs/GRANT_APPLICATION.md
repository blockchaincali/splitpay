# SplitPay: Circle Developer Grants application pack

Prepared 28 October 2026. This document separates what works from what is a demonstration. Where something is not live, it says so.

Repository state: tag `v1.0.0` (frozen Arc Microgrants MVP) and branch `consumer-v2` (this work). The deployed contract is the same in both.

## 1. What SplitPay is

SplitPay lets friends, roommates and organisers collect shared expenses in USDC without chasing anyone. The organiser creates a group with a goal, a deadline and a receiving wallet, shares a link, and contributors pay their share directly to the recipient on Arc. Payment status comes from the chain, not from a database.

## 2. Architecture

```
Browser (React, mobile-first)
  |-- wallets: browser extension wallets | SplitPay testnet wallet (in-browser) | Circle passkey wallet (planned)
  |-- reads and writes Arc directly --> SplitPayGroups contract --> USDC (ERC-20, 6 decimals)
  '-- /api --> API server (Bun) --> SQLite today, Postgres for production
                |- email sign-in, sessions
                |- wallet linking by signature
                |- group index (verified against Arc before saving)
                |- invitations, participants, reminders
                '- NGN sandbox quotes and payment requests (no money moves)
```

Design rules:
- Arc USDC is the settlement layer. A payment counts only when `ContributionReceived` is on Arc.
- The server is an index and a notifier. It never decides whether someone has paid.
- Money never passes through SplitPay: the contract pulls the exact approved amount and sends it straight to the recipient. The contract holds nothing.
- Every integration is labelled `live`, `sandbox`, `needs setup` or `planned`, in the app and in `docs/V2_ARCHITECTURE.md`.

Smart contract (`SplitPayGroups`, unchanged since v1):
- Immutable recipient, target, deadline per group. IDs are derived from the creator, which stops front-running.
- Exact-amount allowance and transfer through OpenZeppelin SafeERC20, with a reentrancy guard.
- Rejects overpayment, expired groups, self-payment by the recipient and nicknames over 24 UTF-8 bytes.
- No owner, no admin, no fees, no upgrade path.
- Arc detail handled: the USDC ERC-20 view has 6 decimals while the gas balance has 18. The app and contract only use the 6-decimal view.

## 3. Completed features

Live on Arc Testnet:
- Create a group, share a link (copy, WhatsApp, native share, QR), equal or custom splits, verified group details.
- Pay in USDC with an exact allowance and see confirmation, progress and receipts with explorer links.
- Organiser dashboard.
- Email sign-in with one-time codes, sessions, and groups that follow the account across devices.
- Wallet linking by signature (proves ownership, no transaction).
- Invitations by single-use link or email, participant list, payment status read from Arc, email reminders with a 24 hour per-person limit.
- SplitPay testnet wallet: new users can pay with no browser extension (testnet only).

Sandbox only (no money moves, labelled in the app):
- NGN quote with rate, fee, "you would pay" and "group receives" lines, and a payment request with a status timeline. The rate is a demo number. Sandbox payments are never counted in a group's total.

Built but not run against the real provider:
- Yellow Card request signing and webhook verification, built to their published format and unit tested.
- Google sign-in flow, disabled until credentials exist.

## 4. Test evidence

| Area | Result | How to reproduce |
|------|--------|------------------|
| Smart contract | 70 tests passing, including fuzz and invariants | `bun run contracts:test` |
| Security review | Two high findings (id squatting, recipient self-payment) fixed and re-tested. One medium accepted and documented | `docs/SECURITY_REVIEW.md` |
| Library maths and link verification | 10 passing | `bun run test:lib` |
| API server | 38 passing: auth, wallet linking, group index, invites, reminders, quotes, sandbox lifecycle, signing vectors | `bun run test:server` |
| Live Arc Testnet, contract level | 31 of 31 checks | `bun run e2e:testnet`, hashes in `docs/e2e-testnet-report.json` |
| Browser run of the real app on Arc Testnet | 17 of 17 checks on two runs: create, invite, join, unlock the testnet wallet, link wallet, NGN sandbox, USDC payment, reminders, second device | `docs/TEST_EVIDENCE.md`, scripts in `docs/ui-verification/` |
| Lint, types, production build | Clean | `bun run check && bun run build` |

Group completed on testnet: one group reached 1.00 USDC across four contributors, each payment confirmed onchain.

## 5. Current limitations (stated plainly)

1. **NGN payments are not live.** There is no real conversion, withdrawal or bank transfer. The NGN flow is a labelled sandbox.
2. **The testnet wallet is not production custody.** Its key is encrypted in the browser with a 6-digit PIN. It refuses to run on mainnet. Production needs Circle passkey wallets or an equivalent.
3. **Everything runs on Arc Testnet.** Nothing has been deployed to mainnet and no real USDC has moved. Mainnet needs an independent audit and the checklist in `docs/MAINNET_CHECKLIST.md`.
4. **Email is a development outbox** until a mail provider is configured. In production mode the server refuses to send mail rather than pretending.
5. **Single-process database.** SQLite is used for development. A hosted deployment needs Postgres and a shared rate limiter.
6. **Reminders are manual.** There is no scheduler yet.
7. **Pay-by-bank for NGN to Arc is a custody question.** It needs legal advice and a provider partnership before any live release.
8. **Smart-contract wallets** (ERC-1271 signatures) are not supported for linking yet. Wallets must be standard accounts.
9. **Provider facts not yet confirmed:** whether Yellow Card supports Arc, and its fees and limits.
10. **History scans will not scale as they are.** The public Arc testnet RPC rejected a log query of about 14,000 blocks, so the app reads in smaller chunks. A group's history is read from its creation block, which is fast today, but a dashboard that scans from the contract's first block gets slower as the chain grows. Signed-in users avoid this because the server stores each group's block. A server-side indexer is the real fix (M8).

## 6. Milestones

Dates are a proposed plan, not a commitment, and depend on third parties.

| # | Milestone | Needs | Done when | Proposed time |
|---|-----------|-------|-----------|---------------|
| M0 | Freeze v1 | none | Tag, export, hosting config | Done |
| M1 | Accounts and persistence | none | Done on testnet | Done |
| M2 | Testnet wallet | none | Done on testnet | Done |
| M3 | Invites, participants, reminders | none | Done on testnet | Done |
| M4 | Payment methods and quotes (sandbox) | none | Done as sandbox | Done |
| M5 | Yellow Card sandbox integration | Yellow Card sandbox keys | Quote and collection run against their sandbox, webhook handled | 2 to 3 weeks |
| M6 | Circle passkey wallet pilot | Circle Console client key, deployed hostname | A new user pays on testnet with a passkey | 2 to 3 weeks |
| M7 | Compliance and custody review | Legal counsel | Written position on NGN to USDC | 4 to 6 weeks, parallel |
| M8 | Hosting, Postgres, mail, scheduled reminders, event indexer | Hosting, mail provider | Public testnet beta | 2 to 3 weeks |
| M9 | Independent audit and mainnet readiness | Audit firm | Audit report, checklist signed | Depends on audit slot |
| M10 | Mainnet pilot with small amounts | M9 and explicit approval | First real USDC group, supervised | After M9 |

## 7. Projected operational costs

Only items we measured are given as numbers. Everything else needs a vendor quote and is marked so.

### Measured: Arc Testnet network fees

From six real transactions (`docs/measured-gas-arc-testnet.json`). Fees on Arc are paid in USDC.

| Action | Gas used | Fee at the observed price |
|--------|----------|---------------------------|
| Create a group | 140,010 | about 0.0032 USDC |
| Approve exact amount | 55,438 | about 0.0013 USDC |
| First payment by a wallet | 138,518 | about 0.0032 USDC |
| Later payment (storage already warm) | 78,796 | about 0.0018 USDC |

A group with N paying people costs about `0.0032 + N x 0.0045` USDC in network fees at that price. For a group of 4 that is about 0.021 USDC. These are testnet measurements from one day. The mainnet fee level must be measured again before pricing anything.

### Not measured: needs quotes

| Item | Driver | How to estimate |
|------|--------|-----------------|
| Hosting (one container with a persistent volume) | Users and uptime | Provider's published price at deployment |
| Managed Postgres | Data and backups | Provider quote |
| Dedicated RPC | Read volume. Our public RPC returned rate-limit responses under repeated polling | Provider quote |
| Email delivery | Codes, invitations, reminders per active group | Provider plan |
| Circle wallets and gas sponsorship | Active wallets and sponsored transactions | Circle's pricing for the chosen wallet type |
| Circle onramp | Volume and KYB status | Circle's pricing |
| Yellow Card | Collection and payout fees, minimums | Commercial terms after KYB |
| Independent smart-contract audit | Scope | Audit firm quote |
| Legal and compliance advice | Jurisdictions | Counsel quote |
| Monitoring and support | Team time | Internal |

Revenue model note: v1 and v2 charge no platform fee. If fees are introduced later they need a new contract version and a new review.

## 8. How funds would be used

Priority order: independent audit, Circle passkey wallet pilot, Yellow Card sandbox and legal review, hosting and managed services, mainnet pilot gas and support.
