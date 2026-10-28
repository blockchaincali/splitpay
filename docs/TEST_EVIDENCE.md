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
- Google sign-in (no credentials).
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
