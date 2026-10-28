# SplitPay: production architecture

Status: design for review. Nothing in this document is built unless it says so. What exists today is in `docs/V2_ARCHITECTURE.md` and `docs/TEST_EVIDENCE.md`. This is not legal advice; every compliance statement needs confirmation from qualified counsel in each country where SplitPay operates.

## 1. Principles

1. **Arc is the ledger of truth for USDC.** A contribution is paid only when `SplitPayGroups` has emitted `ContributionReceived`. No database flag, provider message or user claim can mark a USDC payment as paid.
2. **Guest checkout always works.** Anyone with a group link and an external wallet can pay without an account (section 11). Accounts add convenience, never a gate on paying.
3. **Non-custodial by default.** The contract moves USDC from payer to recipient and holds nothing. Wallets that SplitPay offers must be user-controlled. Any flow where SplitPay (or a provider on its behalf) holds customer funds is a separate, licensed product decision (section 6).
4. **Sandbox and production never mix.** Every integration has one explicit state (`live`, `sandbox`, `needs-credentials`, `planned`). A sandbox result is stored and displayed separately and cannot change a group's collected total.
5. **Secrets stay on servers.** Provider keys live in a secrets manager and server environment, never in the repository, the browser bundle or chat.
6. **Money is integers.** USDC is 6-decimal ERC-20 units, NGN is kobo. No floating point on any money path.

## 2. System overview

```
 Browser / phone                                 External wallet (guest)
   |  React app (static)                            |  wagmi + viem, no account
   v                                                v
 ┌──────────────────────── Edge / CDN + WAF ───────────────────────────┐
 |  /            static app (SPA fallback)                              |
 |  /api/*       ───────────────►  API service (stateless, N replicas)  |
 └──────────────────────────────────────────────────────────────────────┘
                                   |            |             |
                       Postgres (primary +      |      Queue + workers
                       replica, PITR backups)   |   (webhooks, reminders,
                                   |            |    reconciliation, mail)
                                   |            |
        ┌──────────────────────────┴───┐   ┌────┴──────────────────────────┐
        | Chain indexer (Arc RPC,      |   | Provider adapters             |
        | confirmations, reorg-safe)   |   | Circle Wallets / Mail /       |
        └──────────────┬───────────────┘   | Yellow Card (or equivalent)   |
                       v                    └────┬──────────────────────────┘
               Arc mainnet / testnet             v
               SplitPayGroups + USDC       Provider webhooks ► /webhooks/*
```

Components that exist today on `consumer-v2`: static app, single API process with SQLite, sandbox quote/intent engine, Yellow Card signing/verification helpers, dev outbox. Everything else above is planned.

## 3. Identity and real email authentication

**Goal:** passwordless sign-in that works for people with no crypto knowledge, with abuse controls.

- **Email one-time code (primary).** Keep the current design: 6-digit code, stored only as a keyed hash, 10 minute expiry, single use, 5 attempts. Production changes:
  - Send through a transactional email provider (provider choice and price: to be quoted). Do not send from a personal mailbox.
  - Sending domain with SPF, DKIM and DMARC aligned. A dedicated subdomain for transactional mail.
  - Provider webhooks for bounces and complaints feed a suppression list; never keep mailing a bounced address.
  - Rate limits per email, per IP and per device, enforced in a shared store (Redis or Postgres), not in process memory as today.
  - Generic responses so the sign-in form never reveals whether an address has an account.
  - Plain text and HTML templates; the code is the only secret in the message; no links that log in directly (avoids link-scanner consumption).
- **Optional second methods.** Google sign-in (OIDC with PKCE, state, `email_verified` required) once an OAuth client exists; passkeys for returning users.
- **Sessions.** Random 256-bit token, stored hashed, `HttpOnly`, `Secure`, `SameSite=Lax`, rotating on sign-in, revocable list in the account page. JSON-only mutating requests plus `SameSite` as CSRF defence (current design), with an `Origin` allowlist added at the edge.
- **Step-up.** Sensitive actions (change email, link or unlink a wallet, export data, delete account) require a fresh email code.
- **Recovery.** Email is the recovery channel for the SplitPay account only. It cannot recover a wallet (section 4).

**Gate to go live:** domain authentication verified, bounce handling working, rate-limit store shared across replicas, abuse monitoring on code requests, privacy notice published.

## 4. User-controlled Circle wallets

Why this type: Circle user-controlled wallets are non-custodial. The user authorises each wallet creation, transfer and signature through Circle's hosted flow; SplitPay and Circle cannot move funds on the user's behalf. The alternative developer-controlled wallets give SplitPay custody and are not used for payers.

**Account model.** One SplitPay account maps to one random Circle `userId` (a UUID, never the email). Stored in `circle_users(user_id, circle_user_id, created_at)`.

**Flow (PIN first, then email OTP or social when configured in the Circle Console):**

1. Server: create the Circle user, then a `userToken` (short-lived) and `encryptionKey`.
2. Server: request wallet initialisation for Arc; Circle returns a `challengeId`.
3. Browser: Circle web SDK sets authentication and executes the challenge; the user sets a PIN and security questions in Circle's hosted UI.
4. Server: read the created wallet address, store it as a wallet on the account with `kind = 'circle-ucw'` and **mark it verified through Circle, not through our own signature challenge**.
5. To pay: server creates a contract-execution challenge for `approve(exactAmount)` then `contribute(groupId, amount, name)`; the browser executes each challenge; the server tracks the Circle transaction to a terminal state (`COMPLETE`, `FAILED`, `DENIED`, `CANCELLED`).
6. The UI says "paid" only when Arc shows `ContributionReceived`, even if Circle reports `COMPLETE` first.

**Design decisions to settle before building:**

- **EOA or smart account.** On Arc the gas asset is USDC, so an EOA needs a small USDC balance for fees. A smart contract account can use Circle's Gas Station sponsorship, which removes that friction for newcomers. Whether Gas Station sponsorship covers Arc, and its cost, must be confirmed with Circle before choosing.
- **Smart-account signatures.** `POST /wallets/link` currently verifies externally owned account signatures only. Circle smart accounts need ERC-1271 verification or Circle-attested ownership.
- **Token handling.** `userToken` and `encryptionKey` go in `HttpOnly` cookies, never `localStorage`.
- **Recovery honesty.** If a user loses their PIN and recovery answers, nobody (including Circle and SplitPay) can recover the wallet. Onboarding must say so plainly.
- **Email OTP and social login inside Circle** need the SMTP and OAuth settings configured in the Circle Console by the account owner. Those are separate from SplitPay's own email sign-in.

**Replaces:** the browser-held SplitPay testnet wallet, which stays testnet-only and is removed from production builds.

**Gate to go live:** Circle Console app configured, security review of token handling, testnet soak with real users, written recovery and support procedure, Gas Station decision documented.

## 5. Persistent group histories

Today: per-account group index in SQLite, with paid status read live from Arc; browser-side log scans in chunks (the public RPC rejects wide ranges).

Production:

- **Postgres** with point-in-time recovery and tested restores. Migrations versioned; no destructive migration without a verified backup.
- **Chain indexer service.** Reads `GroupCreated` and `ContributionReceived` from the contract's deploy block, in bounded ranges, with a persisted cursor, and writes `chain_events(tx_hash, log_index, block_number, block_hash, name, args, seen_at)` with a unique key on `(tx_hash, log_index)`. Replays are safe. It confirms a block depth before treating events as final and detects a changed block hash for the same height.
- **Derived tables, rebuildable from the chain:** `group_totals`, `contributions`. The contract view functions remain the authority; a nightly job compares totals with `getGroup` and `contributionOf` and raises an alert on any difference.
- **Off-chain tables:** accounts, wallets, participants, invitations, reminders, notification preferences, payment intents. Participant `paid` is never stored; it is derived from `contributions`.
- **History for guests:** a guest's payments exist on Arc and appear in the group page for everyone. If they later create an account and link the same wallet, their history appears under that account with no migration, because it is keyed by wallet address.
- **Export and deletion:** account export (JSON) and deletion that removes off-chain personal data. Onchain data, including public nicknames, cannot be deleted; the product tells users before they pay.

**Gate to go live:** indexer soak test including a forced restart and an RPC outage, nightly consistency job green, restore drill completed.

## 6. Fiat payment integrations

**What is built:** a sandbox NGN flow (quote, fees, status steps) and Yellow Card request signing and webhook verification helpers that pass unit tests. No call has been made to Yellow Card.

**Provider facts known from published documentation:** Yellow Card exposes a business API with a sandbox, HMAC-signed requests, channels and rates endpoints, a collection ("receive") request that locks a rate, bank-transfer instructions for the customer, and signed webhooks. Production needs a business verification (KYB), IP allow-listing and per-transaction customer information. Settlement is to a balance held with the provider and to allow-listed wallets on supported networks. **Not confirmed:** whether Arc is a supported settlement network, fees, limits and settlement times.

**Candidate flows, by risk:**

| Flow | Who holds customer funds | Fits non-custodial principle | Licensing exposure |
|------|--------------------------|------------------------------|--------------------|
| A. USDC payer, USDC recipient (today) | Nobody; contract passes funds straight through | Yes | Lowest |
| B. NGN payer, NGN recipient, both through the provider; SplitPay only instructs and records | The provider | Mostly (SplitPay never touches funds) | Depends on whether SplitPay is treated as arranging the payment; counsel decides |
| C. NGN payer, USDC to the recipient on Arc, funded from a SplitPay treasury wallet | SplitPay (in transit) | No | Highest; likely needs its own authorisation |
| D. USDC payer, NGN to a Nigerian bank account via the provider's payout | The provider, briefly | Mostly | Provider-dependent |

**Recommendation:** pursue B or D with a licensed provider first, keep C off until counsel and a licensed partner approve it, and always show fiat contributions as a separate line from "Paid on Arc" until reconciled.

**Intent state machine (production):** `created → awaiting_payment → processing → settled | failed | expired`. Transitions come only from verified provider events or reconciliation, are monotonic (a late "processing" cannot undo "settled"), and are stored with the provider reference and a hash of the raw event.

**FX and fees:** the quote is fetched from the provider (rate, provider fee, any SplitPay fee, recipient amount), stored with an expiry, and shown before the user commits. The user-visible total must equal the amount actually charged. Today's quote engine is arithmetically tested but uses a **demo rate**; production uses only provider rates.

**Gate to go live:** signed provider agreement, KYB passed, sandbox end-to-end run with the provider's test accounts, legal sign-off on the chosen flow, disclosures written, reconciliation (section 8) running.

## 7. Webhooks

Inbound (provider to SplitPay): `/webhooks/<provider>`.

1. Read the **raw body**; verify the provider signature over those exact bytes with a constant-time comparison, before any parsing. Reject if the secret is not configured (as today: 501).
2. Check a timestamp tolerance where the provider supplies one, to limit replay.
3. Insert into `webhook_events(provider, event_id, received_at, raw_body_hash, payload)` with a unique key on `(provider, event_id)`. A duplicate returns success without reprocessing (idempotency).
4. **Acknowledge fast**, then process on a worker. Processing is idempotent and order-tolerant (state changes are monotonic).
5. Failures retry with backoff; after the limit the event goes to a dead-letter queue and raises an alert. A replay tool re-runs stored events.
6. Rotate secrets on a schedule and on any suspected leak; support two active secrets during rotation.
7. Where the provider publishes source IPs, allow-list them at the edge as an extra layer, not the only check.

Provider webhooks are **hints**: for any amount that matters, a worker re-fetches the object from the provider API before changing state.

Circle Wallets and email-provider webhooks follow the same pattern (signature check, idempotency, queue).

## 8. Reconciliation

Three independent views must agree:

| View | Source | Cadence |
|------|--------|---------|
| Arc | Indexer and contract view functions | Continuous; nightly full comparison |
| SplitPay ledger | Postgres double-entry ledger (integer minor units) | Continuous |
| Provider | Provider API and daily statements | Hourly status poll; daily statement match |

Rules:

- Every fiat intent has ledger entries: customer pays, provider fee, SplitPay fee (if any), amount owed to the recipient. Entries balance to zero per intent.
- A fiat contribution is **settled** only when the ledger shows funds received from the provider and, for flow C, the onchain transfer has been seen on Arc.
- Breaks are classified (missing at provider, missing in ledger, amount mismatch, duplicate, timing) and have a runbook. Any break older than one business day pages a human. Funds are never auto-corrected.
- Month-end report: totals by provider, currency, status, fees, with unreconciled items listed.

**Gate to go live:** at least two weeks of daily runs with zero unexplained breaks on sandbox data.

## 9. Compliance and data protection

To be confirmed with counsel before any live fiat or custody-adjacent flow:

- **Licensing analysis** for each country (Nigeria first): whether SplitPay's role needs authorisation as a payment, virtual-asset or money-transfer business, or whether a licensed partner carries it. Marketing text must match the legal position.
- **KYC/KYB:** who verifies users (the provider or SplitPay), at what thresholds, and how results are stored. Guest USDC payments from external wallets involve no SplitPay KYC; the product must not imply otherwise.
- **Sanctions and wallet screening** on recipients and payers at creation and payment time (a screening vendor is a cost item). Circle's own screening applies to Circle wallets.
- **Transaction monitoring and reporting:** alert rules, case handling, suspicious activity reporting duties, record retention periods.
- **Travel-rule data** when a provider requires originator and beneficiary information.
- **Consumer disclosures:** fees, FX rate, estimated time, refund and failure policy, and the statement that onchain nicknames are public and permanent.
- **Data protection:** Nigeria Data Protection Act and, for EU or UK users, GDPR. Data inventory, lawful basis, minimisation (names and emails only where needed), processor agreements with every vendor, breach procedure, deletion and export.
- **Terms and acceptable use,** including a ban on using groups for fraud or unlicensed collection, and a takedown process for abusive group pages.

## 10. Security and operations

- **Contract:** independent third-party audit before mainnet use at scale; deployer key on a hardware wallet or keystore; verified source on the explorer; monitoring on contract events.
- **Application:** dependency scanning, CSP and security headers at the edge, regular penetration test, rate limits on every public endpoint.
- **Secrets:** managed store, per-environment, least privilege, rotation calendar, nothing in git (a scan runs in CI).
- **Observability:** structured logs without personal data or secrets, metrics (sign-in success, webhook lag, indexer lag in blocks, reconciliation breaks), alerts to an on-call.
- **Availability:** stateless API replicas, database failover, backups with restore drills, documented recovery time targets.
- **Environments:** local sandbox, staging on Arc testnet with provider sandboxes, production. Production configuration cannot enable sandbox providers.
- **Incident response:** runbooks for leaked keys, provider outage, indexer divergence and a suspected contract issue (the contract has no pause, so the mitigation is to stop promoting the affected group links and publish a notice).

## 11. Guest participation (permanent invariants)

1. The group page and the USDC pay flow never require sign-in. A person with a link and any EVM wallet can pay.
2. Accounts, invitations, reminders and fiat methods are optional layers around that flow.
3. The server is not on the USDC payment path. If the API is down, guests can still pay and see progress, because group data and progress come from the contract and the link.
4. A guest's payment is visible to the organiser the same way as an account holder's (read from Arc). Matching a payment to an invited person happens by wallet address if the person later links it.
5. The pay button is never hidden behind a prompt to register. Sign-in prompts appear only for features that need an account (NGN sandbox, saved history, invites).

Evidence: the browser journey `docs/ui-verification/v1-journey.ts.txt` pays as a guest; the `consumer-v2` run records that the guest made no API calls other than the session check.

## 12. What must be true before each integration leaves sandbox

| Integration | Today | Required before live |
|-------------|-------|----------------------|
| USDC on Arc, external wallet (guest) | Verified on testnet | Mainnet deployment by the owner, audit decision recorded, small supervised test |
| Email sign-in | Works with an in-app dev outbox | Real mail provider, domain authentication, shared rate limits |
| Circle user-controlled wallets | Not built (needs credentials) | Section 4 gate |
| Persistent histories | SQLite index per account | Postgres, indexer, restore drill |
| NGN collection | Sandbox only, demo rate | Section 6 gate |
| NGN payout | Sandbox only | Section 6 gate |
| Reminders | Manual, rate-limited, dev mail | Real mail, scheduler, unsubscribe handling |
| Google sign-in | Disabled (no credentials) | OAuth client, privacy notice |
