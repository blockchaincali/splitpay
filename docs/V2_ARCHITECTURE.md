# SplitPay v2: consumer architecture and implementation plan

Branch: `consumer-v2`. The frozen grant release is tag `v1.0.0` on `main` (see `docs/RELEASE.md`). The deployed `SplitPayGroups` contract is not changed or redeployed by anything in this plan.

## Principles

1. **Arc USDC is the settlement layer.** A group is only "paid" when `ContributionReceived` is on Arc. Everything else is a convenience layer around that fact.
2. **Onchain is authoritative, the server is an index.** Accounts, invites and reminders live in a database. Amounts and payment success never do.
3. **Functioning and demonstrated are different things.** Every integration reports one of `live`, `sandbox`, `needs-credentials` or `planned`. The UI and the docs show that status. A sandbox result can never raise a group's collected total.
4. **No secrets in the browser or in chat.** Provider keys, OAuth secrets and mail keys are server environment variables only.
5. **Testnet by default.** Mainnet needs explicit approval and an independent review (`docs/MAINNET_CHECKLIST.md`).

## System overview

```
Browser (React, mobile-first)
  |-- wallet adapters: injected (live) | embedded testnet wallet (live, testnet only) | Circle passkey (needs credentials)
  |-- reads/writes Arc directly via viem/wagmi  --> SplitPayGroups (unchanged) --> USDC ERC-20 (6 decimals)
  |
  '-- /api (Vite proxy in dev)
        API server (Bun) ---- SQLite (WAL) now, Postgres for production
          |- auth: email one-time code (live), Google sign-in (needs credentials)
          |- wallet linking: signed challenge, server verifies signature
          |- groups index: verified against Arc before saving
          |- invitations, participants, reminders (mail adapter)
          |- quotes + payment intents (provider adapters)
          '- webhooks: signature-verified, idempotent
Provider adapters (server only)
  |- FX / NGN: sandbox mock (live in sandbox) | Yellow Card (implemented from public docs, needs credentials)
  '- Circle: Wallets, App Kit onramp (investigated, needs credentials)
```

## Status of each capability

| Capability | Status in this branch | Notes |
|-----------|-----------------------|-------|
| Pay in USDC on Arc | live (testnet) | Unchanged v1 contract and flow |
| Email sign-up and sign-in | live | One-time code, hashed, expiring, rate limited. Codes are shown in an in-app dev outbox until a mail provider is configured |
| Google sign-in | needs-credentials | Server flow gated on `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` |
| Embedded wallet without MetaMask | live (testnet only) | Key generated in the browser, encrypted with the user's PIN. Demo-grade, disabled on mainnet. Not custodial |
| Circle passkey wallet | needs-credentials | Requires a Circle Console client key for the exact hostname |
| Persistent accounts and histories | live | Server index, cross-checked against Arc |
| Invitations and participants | live | Single-use invite links, hashed tokens |
| Reminders | live | Manual send, 24 hour per-participant limit, mail adapter |
| FX quote with fee breakdown | sandbox | Rate is a labelled demo rate, not a market quote |
| Pay with NGN bank transfer | sandbox | Mock provider. No money moves. Never counted as collected |
| NGN payout to a bank account | sandbox | Mock provider |
| Yellow Card adapter | needs-credentials | Request signing built to the published scheme and unit tested. Not run against Yellow Card |
| Circle App Kit onramp (fiat to USDC) | planned | Needs Circle API key and a supported region check |

## Data model (server)

- `users(id, email, email_verified_at, created_at)`
- `otp_codes(email, code_hash, expires_at, attempts, consumed_at)`
- `sessions(token_hash, user_id, expires_at, created_at)`
- `wallets(id, user_id, address, kind, verified_at)` with a unique address
- `groups(group_id, owner_user_id, creator_address, title, description, meta_text, chain_id, block, created_at)`
- `participants(id, group_id, name, email, expected_amount, wallet_address, invite_token_hash, status, last_reminder_at)`
- `reminders(id, group_id, participant_id, sent_at, channel)`
- `outbox(id, to_email, subject, body, created_at)` development mail sink
- `payment_intents(id, group_id, user_id, method, status, usdc_amount, local_amount, quote_json, provider, provider_ref, is_sandbox)`
- `webhook_events(id, provider, event_id, received_at)` for idempotency

Participant status is derived: `paid` only when Arc shows a contribution from the participant's verified wallet that covers their expected amount. Otherwise `invited`, `joined`, `reminded` or `intent pending (sandbox)`.

## Payment methods

| Method | Who pays | Settles on Arc? | Status |
|--------|----------|-----------------|--------|
| USDC on Arc | Contributor wallet | Yes, directly to recipient | live |
| NGN bank transfer | Contributor | Not in this release | sandbox |
| Direct domestic bank transfer to organiser | Contributor | No, off Arc by design | sandbox (instructions and tracking only) |

### Why NGN to Arc is not live

Yellow Card is a business API. A collection credits the partner's USD stablecoin float at Yellow Card, and settlement to a wallet needs a pre-whitelisted address. Getting that value onto a group's Arc recipient would mean the operator holds and forwards customer funds. That is custody and money transmission, which needs Yellow Card KYB and IP allowlisting, legal review in Nigeria and the operator's home jurisdiction, and a supported stablecoin network that includes Arc (to be confirmed with Yellow Card). Until that is approved, NGN flows are sandbox only and carry a permanent "Sandbox: no money moves" label.

## Security model

- Sessions: random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie; only a hash is stored.
- One-time codes: 6 digits, 10 minute expiry, 5 attempts, hashed with a server secret, per-email and per-IP rate limits.
- Wallet linking: server issues a nonce message; the wallet signs it; the server verifies the signature with viem. Address ownership is proven, never claimed.
- Group saving: the server reads the group from Arc and refuses unless the creator matches a wallet the user proved they own.
- Invites: 256-bit tokens, stored hashed, single use, expiring.
- Webhooks: HMAC verified, timestamp checked, idempotent by event id.
- No provider secret is ever returned to the browser or logged.

## Milestones

| # | Milestone | Done when |
|---|-----------|-----------|
| M0 | Freeze v1 | Tag `v1.0.0`, export, hosting config (done) |
| M1 | Accounts and persistence | Email sign-in, wallet linking, groups visible on a second device |
| M2 | Embedded testnet wallet | New user pays on testnet with no browser extension |
| M3 | Invites, participants, reminders | Organiser invites by email, sees status, sends a reminder |
| M4 | Payment methods and quotes | USDC and NGN options, fee breakdown, sandbox intent lifecycle |
| M5 | Provider integration | Yellow Card sandbox credentials tested end to end |
| M6 | Circle wallets pilot | Passkey wallet with a Console client key |
| M7 | Compliance and custody review | Legal sign-off before any live NGN flow |
| M8 | Mainnet readiness | Independent audit and checklist complete |

M0 to M4 are built in this branch (M4 in sandbox). M5 to M8 are blocked on credentials, approvals and third-party review.

## Testing approach

- Server: unit tests for auth, signature verification, group verification, invite rules, reminder limits, quote math, webhook idempotency.
- Provider adapters: contract tests with recorded-shape fixtures; request-signing test vectors.
- Frontend: library tests plus browser runs against the real app on Arc Testnet with throwaway wallets.
- Unchanged: 70 contract tests, 10 library tests, 31-check live run from v1 must still pass on this branch.
