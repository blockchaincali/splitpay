# Test evidence

Run on 28 October 2026 against the `consumer-v2` branch. Nothing here involved mainnet or real money.

## Unchanged from v1.0.0

| Check | Result |
|-------|--------|
| `contracts/SplitPayGroups.sol` and `contracts/test/` vs tag `v1.0.0` | Identical (`git diff v1.0.0` is empty). SHA-256 `b904dc88...f42bc` |
| `bun run contracts:test` | 70 passed, 0 failed (unit, fuzz, invariants) |
| `bun run test:lib` | 10 passed |
| `bun run e2e:testnet` (live Arc Testnet, contract level) | 31 of 31 checks, rerun after the v2 work. Hashes in `docs/e2e-testnet-report.json` |

The live rerun found one test-script problem: the public RPC rejected a roughly 14,000-block log query ("requested range too large"). The app already reads logs in smaller chunks and halves on error; the test script was updated to do the same.

## New in v2

| Check | Result |
|-------|--------|
| `bun run test:server` | 38 passed |
| `bun run check` (lint and types) | 0 warnings, 0 errors |
| `bun run build` | Succeeds |
| Production server (`APP_ENV=production`) | Serves the built app and `/api`, falls back to the app shell for deep links, path traversal returns the app shell, security headers set, `/dev/outbox` is 404, email sending fails loudly (503) until a mail provider is configured |

### What the server tests cover

- Email sign-in: code stored hashed, 10 minute expiry, 5 wrong attempts lock the code, one use only, per-email rate limit, JSON-only requests, protected routes need a session.
- Wallet linking: a signature from another key is refused, a challenge cannot be replayed, a wallet cannot belong to two accounts.
- Group index: saved only if the group exists on Arc, was created by a linked wallet, and the details match the onchain hash. Saving twice is idempotent. Another account cannot take it.
- Invitations: tokens stored hashed, invite view reveals no email, claiming needs a linked wallet and is exclusive, expired or unknown invites refused.
- Reminders: skip people who paid onchain, people without email, and repeats within 24 hours. None after the deadline. Participant "paid" comes from the chain reader, not a stored flag.
- Payments: quote maths rounds in the safe direction, intents cannot be moved by another user, sandbox payments are always `settledOnArc: false` and `countsTowardCollected: false`, invalid status changes refused, integration statuses are honest.
- Yellow Card adapter: request signature, `YcHmacV1` header and webhook signature checked against the documented format. The webhook endpoint is off until credentials exist.

### Browser run of the real app (Arc Testnet, throwaway wallets)

17 of 17 checks passed on two consecutive runs (before and after a polish pass). Scripts: `docs/ui-verification/`.

1. Email sign-in through the UI returns to the page.
2. A group is created onchain by the signed-in organiser.
3. Wallet ownership is proven by signature and the group is saved after the Arc check.
4. Invitations are created, with links shown once.
5. The invite page shows the group and the invitee's share.
6. The SplitPay testnet wallet unlocks with its PIN and connects, with no browser extension.
7. The invitee joins and lands on the verified group page.
8. The NGN quote shows the demo rate, fee and recipient amount.
9. The NGN sandbox completes and is labelled as not paying the group.
10. Group progress is unchanged after the sandbox payment.
11. A USDC payment is confirmed onchain through the embedded wallet (exact allowance, then the payment, each with a plain-language approval screen).
12. Progress becomes 25% from Arc.
13. The organiser sees the person as "Paid on Arc", derived from the chain.
14. A reminder goes only to the unpaid person.
15. A second reminder inside 24 hours is blocked.
16. Sandbox requests are shown to the organiser as not counted.
17. The organiser's groups appear on a second device after signing in.

The only browser console error in the run is an expected 404 when the organiser opens the people page for a group that is not yet saved.

## Not tested

- Real email delivery (no provider configured).
- Anything against Yellow Card or Circle services (no credentials).
- The wallet-picker modal of third-party wallets (the stand-in wallet connects automatically).
- Load or scale testing, and SQLite behaviour across many users.

## Release-readiness checks (added 28 October 2026)

| Check | Result |
|-------|--------|
| `v1.0.1` (v1.0.0 plus hosting config and documents) production build from a clean checkout with only the two public contract variables | Succeeds; contract address present in the bundle |
| Local production preview of that build: `/` and a `/g/<id>` deep link | Both return the app |
| Guest-payment journey on the v1 release build | All 19 payment, verification and dashboard checks passed. The guest made no API calls (there is no server in v1) |
| The same journey on `consumer-v2` | The same 19 checks passed. The guest made exactly one API call, `GET /api/auth/me` (the session check), no writes, and saw no sign-in screen |
| Layout at 360, 390, 768 and 1280 px wide for `/`, `/new`, `/dashboard` on the v1 release build | 12 of 12 without horizontal overflow; no page errors |
| Mainnet-configured build (`VITE_SPLITPAY_CHAIN_ID=5042`, **placeholder** address, local only, never deployed) | Shows the real-USDC banner, no testnet wording, no page errors |

The guest-journey script ended with a timeout at its last step on both runs because it used an outdated field label for the custom-amount form; that step is a script defect, not an app defect (the screen was verified at four widths separately, above). The script has been corrected in `docs/ui-verification/`.

Browser runs used a stand-in wallet with throwaway testnet keys. They did not exercise a real browser-extension wallet.

## GitHub sync and wallet-first change (29 October 2026)

Merged `github/main` (PR #1 security hotfix, PR #2 landing page) into `consumer-v2`, ported `fe9168f` (RPC failover, clearer errors), then made accounts optional. The contract and `contracts/test/` are identical to `v1.0.0`.

| Check | Result |
|-------|--------|
| `forge build`, `forge test` | Build succeeds, 70 of 70 tests pass |
| `bun run typecheck`, lint | 0 errors, 0 warnings |
| `bun run build` (accounts flag unset, as on a static host) | Succeeds |
| `bun run test:lib` (includes the RPC failover and error-classification tests) | 21 passing |
| `bun run test:landing` | 18 passing |
| `bun run check:landing` (real browser, built site) | 61 passed, 0 failed |
| `bun run test:security` (includes real-browser checks that the production build leaves the wallet, fetch and console alone) | 8 passing |
| `bun run test:accounts` (new) | 10 passing: health check rejects HTML, wrong shapes and network failures; no Google; account pages gated; session request gated |
| `bun run test:server` | 39 passing (new health test, Google route gone) |

Browser runs (stand-in wallet, throwaway testnet key, Arc Testnet):
- **Static host, accounts flag off** (a server that rewrites every unknown path to the app, like Vercel, with no API): no sign-in, Google, invite or reminder text on the home, create, dashboard or group page; zero requests to `/api`; the sign-in, account, invite and people pages show a calm "Your wallet is all you need" message; "Your groups" shows from the wallet alone; the full journey passed (create, share link, verify, overpayment blocked, pay, confirmed only after the network confirms, recipient received exactly 0.25 USDC, receipt, dashboard 0.25 of 1.00).
- **Accounts flag on, API up:** Sign in appears, email sign-in works end to end, the account page has no Google.
- **Accounts flag on, API unreachable, or `/api/health` answering HTML:** account features disappear with no error.

Found and fixed during this work: the dev proxy stripped `/api` while the production-style server expected it, which broke the API after a restart. The dev proxy now keeps the prefix, so development and production take the same path.

Not run: the landing check on a real phone; real email, Circle or Yellow Card. `fix/group-creation-rpc` commits `e79fc5a` (overlaps the security hotfix) and `ca8077d` (report-only CSP) were not brought in.

## Group data loading fix (29 October 2026)

**Bug 1, slow group page.** The group page now renders from `getGroup` and the share link alone; the payment list loads behind it. History is read several block windows at a time, spread over the RPC endpoints, starting at the creation block (the `?b=` hint, or the block of the GroupCreated event, or the contract's first block as a last resort). The history and the last scanned block are saved per group, so a revisit fetches only newer blocks. A failed window is retried on a different endpoint with backoff and never discards what already loaded. The percentage counter is gone; a plain "Loading payment history..." line sits under the list.

**Bug 2, new group missing from "Your groups".** A group is saved with its block the moment its creation is confirmed, so it is listed at once. The dashboard then looks for other groups in the background with the same resumable scanner, saving the cursor after every chunk, retrying by itself, and showing an error only if nothing at all could load (otherwise a small "Still syncing" note). Addresses and group ids are compared without regard to letter case.

Measured on Arc Testnet from the sandbox on 29 October 2026 (these are observations of today's public endpoints, not guarantees, and the scanner learns them per endpoint instead of hardcoding them):

| Endpoint | Log range | Parallel calls |
|----------|-----------|----------------|
| `rpc.testnet.arc.io` | accepted up to 9,999 blocks, refused 10,000+ with a "rate limit exceeded" message (same text as a real rate limit) | rate-limits bursts |
| `rpc.blockdaemon.testnet.arc.io` | accepted 50,000, refused 200,000 ("max block range 100000") | 10 at once, no errors |
| `rpc.quicknode.testnet.arc.io` | accepted 5,000, refused 10,000 ("requested range too large") | rate-limits bursts |
| `rpc.drpc.testnet.arc.io` | refused every log query tried ("free plan") | n/a |

An earlier version of this fix (one global range limit) mistook rate limits for range limits, shrank the window to a few hundred blocks and made 2,078 calls to scan 200,000 blocks. The per-endpoint version makes 30.

| Check | Result |
|-------|--------|
| `bun run test:lib` (adds `history-scan.test.ts`, 19 tests) | 40 passing |
| `bun run test:landing`, `test:accounts`, `test:server`, `test:security` (real browser), `check:landing` | 18, 10, 39, 8, 61 passing |
| `forge test` | 70 passing; contract and `contracts/test/` identical to `v1.0.0` |
| lint, types, `bun run build` | clean |

Browser run on Arc Testnet (stand-in wallet, throwaway key; `docs/ui-verification/speed-journey.ts.txt`):
- Create a group, then "Go to my groups": the new group is listed in 57 ms, with no scan.
- Open the group page: title, goal, progress and Pay button in 1.3 s; payment history finished loading 0.1 s later (9 `eth_getLogs` calls).
- Pay 0.25 USDC: confirmed by the network, and the payment appears in the list 12 ms later.
- Reload the group page: the payment is shown from the saved history in 0.7 s using 1 `eth_getLogs` call.
- New browser with empty storage, same wallet: the dashboard finds the wallet's groups by background scan in 2.8 s (30 calls) with no error.
- A bare link with no creation hint on a new device: page content in 1.2 s, payment history 1.3 s later.
- No page errors.

Regression tests: BUG 1 (parallel windows, growth, per-endpoint limit learning, endpoint failover and cooldown, partial results kept, contiguous resume point, revisit fetches only new blocks, cursor saved after every chunk, no percentage counter) and BUG 2 (created group listed at once, case-insensitive address and id matching, cursor and groups saved per chunk, errors only when nothing loaded). A simulation of the four real endpoint behaviours finishes a 200,000-block scan in under 40 calls.
