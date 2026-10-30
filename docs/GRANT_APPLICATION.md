# SplitPay: Circle Developer Grants application pack

Prepared 28 October 2026. Every capability below carries exactly one of four status labels. If a claim is not backed by evidence in this repository, it is not labelled "verified".

Repository: tag `v1.0.0` (frozen Arc Microgrants MVP) and branch `consumer-v2`. The deployed contract is identical in both and has not changed since deployment.

## 1. Summary

SplitPay lets friends, roommates and organisers collect shared expenses in USDC without chasing anyone. The organiser creates a group (goal, deadline, receiving wallet), shares a link, and contributors pay their share directly to the recipient on Arc. Whether someone has paid is read from the chain, never from a database. The contract holds no funds and has no admin.

Programme fit (from Circle's published description of what it looks for): Arc is the settlement layer; USDC is the unit of account; the use case is peer-to-peer payments. Circle wallets are the planned embedded-wallet building block, not yet integrated.

Traction: none beyond internal testing. There are no external users, pilots or revenue. We state this so reviewers can weigh the milestones accordingly.

Applicant and team details, the grant amount requested and public profiles are for the applicant to complete (marked **[applicant]** in `docs/submission/ARC_MICROGRANTS_SUBMISSION.md`). They are not invented here.

## 2. Status key

| Label | Meaning |
|-------|---------|
| **Verified on testnet** | Works against real Arc Testnet state. Evidence is in this repository and can be re-run. No real money. |
| **Sandbox demonstration** | Runs end to end inside SplitPay with simulated or demo data. Labelled as a demo in the app. No money moves and it never changes a group's total. |
| **Unavailable (production integration)** | Not connected to the real service. Needs credentials, an agreement or approval we do not have. May exist as code written to published documentation, never run against the live service. |
| **Future milestone** | Not built. Planned, with the gate that must be met first. |

Nothing in this pack is labelled "live in production". There is no production deployment.

## 3. Status matrix

### Verified on testnet

| Capability | Evidence |
|------------|----------|
| `SplitPayGroups` contract: immutable recipient, target, deadline; exact-amount pull; direct-to-recipient transfer; no custody | 70 Foundry tests incl. fuzz and invariants; deployed `0xd7f9c3823e81fe27300693c060a6418ad3eed806` on Arc Testnet |
| Security fixes from review (id front-running, recipient self-payment) | `docs/SECURITY_REVIEW.md`; tests added for both |
| Create group, share link (copy, WhatsApp, native share, QR), verified details | Browser run on testnet, `docs/TEST_EVIDENCE.md` |
| Equal and custom splits in 6-decimal USDC units | 10 library tests; browser run |
| Guest payment from an external wallet with no account | Browser journey `docs/ui-verification/v1-journey.ts.txt`; guest made no API writes |
| Exact-amount approval then payment; "confirmed" shown only after onchain confirmation | Browser run; 31 of 31 live contract-level checks, hashes in `docs/e2e-testnet-report.json` |
| Receipts with transaction hashes and explorer links; organiser dashboard | Browser run |
| Group fully funded by four contributors on testnet | Transaction hashes in the testnet record |
| Email sign-in (one-time code, hashed, expiring, attempt-limited), sessions | 38 API tests; browser run (code delivered through an in-app development outbox, not real email) |
| Wallet linking by signature; one wallet per account | API tests; browser run |
| Group index verified against Arc before saving; groups follow the account across devices | API tests; browser run (second device) |
| Invitations (single-use link or email), participant status derived from Arc, reminders (skip paid, once per 24 hours) | API tests; browser run |
| SplitPay testnet wallet (in-browser, PIN-encrypted, testnet only) lets a new user pay with no extension | Browser run, 17 of 17 checks on two runs |

### Sandbox demonstration

| Capability | What is simulated | Guardrail |
|------------|-------------------|-----------|
| NGN quote (rate, provider fee, you would pay, group receives) | Demo rate and fee from configuration | Banner on every screen; rate is not market data |
| NGN payment request and status timeline | Provider behaviour; the organiser simulates "received" and "completed" | `settledOnArc: false` and `countsTowardCollected: false` are enforced by the server and tested |
| Mock bank details | Entire instruction block | Labelled "sandbox, do not send money" |

### Unavailable (production integration)

| Integration | State | Blocker |
|-------------|-------|---------|
| Yellow Card collections and payouts | Request signing and webhook verification written to their published format and unit tested. **No call made to Yellow Card.** | Sandbox credentials, then KYB, IP allow-listing and a commercial agreement. Arc support as a settlement network unconfirmed |
| Circle user-controlled or passkey wallets | Not integrated | Circle Console configuration (App ID or client key tied to the deployed hostname) |
| Real email delivery | Adapter for a transactional provider written, never run | Provider account and a verified sending domain |
| Circle onramp | Not integrated | Console key; availability for Nigerian users unconfirmed |
| Mainnet deployment | Done by the owner on 30 Oct 2026 (`docs/DEPLOYMENTS.md`); unchanged contract, runtime code matches this repository's tested build | Independent audit still outstanding |

### Future milestones

See section 7.

## 4. Architecture

Summary below; full design for production in `docs/PRODUCTION_ARCHITECTURE.md`; current implementation in `docs/V2_ARCHITECTURE.md`.

```
Browser (React, mobile-first)
  |-- guest path: any EVM wallet --> Arc directly (no account, no server on the payment path)
  |-- optional: SplitPay testnet wallet (testnet only) | Circle wallets (planned)
  '-- optional: /api --> API server --> SQLite today (Postgres for production)
                |- email sign-in, sessions, wallet linking
                |- group index, invitations, reminders
                '- NGN sandbox (no money moves)
Arc: SplitPayGroups --> USDC (ERC-20, 6 decimals; gas is also paid in USDC)
```

Design rules that are enforced in code and tests:

1. A USDC payment counts only when `ContributionReceived` exists on Arc.
2. The server indexes and notifies; it never decides whether someone paid.
3. Money does not pass through SplitPay. The contract pulls the exact approved amount and sends it to the recipient.
4. Guest payment never requires an account (`docs/PRODUCTION_ARCHITECTURE.md` section 11).
5. Sandbox results are stored and shown separately from verified payments.
6. Arc detail: the USDC ERC-20 view has 6 decimals and the native gas view has 18. The app and contract use only the 6-decimal view for money.

## 5. Test evidence

| Area | Result | Reproduce |
|------|--------|-----------|
| Smart contract | 70 passing (unit, bad-token, fuzz, invariants); source unchanged since `v1.0.0` | `bun run contracts:test`; `git diff v1.0.0 -- contracts/SplitPayGroups.sol contracts/test` is empty |
| Security review | Two high findings fixed and retested; one medium accepted and documented; no third-party audit yet | `docs/SECURITY_REVIEW.md` |
| Library maths and link verification | 10 passing | `bun run test:lib` |
| API server | 38 passing | `bun run test:server` |
| Live Arc Testnet, contract level | 31 of 31 checks | `bun run e2e:testnet` |
| Browser, real app on Arc Testnet | 17 of 17 on two runs, plus a guest-payment run on the v1 release build and on `consumer-v2` | `docs/TEST_EVIDENCE.md`, `docs/ui-verification/` |
| Lint, types, production build | Clean on both refs | `bun run check && bun run build` |

Not tested: real email delivery, anything against Yellow Card or Circle services, load, third-party wallet pickers, and mainnet beyond the read-only checks and two payments in `docs/DEPLOYMENTS.md`.

## 6. Current limitations

1. **Mainnet history is short.** The unchanged contract went live on Arc mainnet on 30 October 2026 and has seen two real payments of 0.25 USDC into one group (`docs/DEPLOYMENTS.md`). There is no usage beyond that, no independent audit, and the mainnet app has had no load or real-user testing.
2. **No independent audit.** The review was automated and tool-assisted. The contract holds no funds and has no admin, which limits impact, but it is not a substitute for an audit.
3. **NGN is a demonstration only.** No conversion, withdrawal or bank transfer exists. The demo rate is not a market rate.
4. **A live NGN to Arc USDC path is a custody question.** It needs legal advice and a licensed partner before release (`docs/PRODUCTION_ARCHITECTURE.md` section 6).
5. **The testnet wallet is not production custody.** A 6-digit PIN protects a key in the browser. It refuses to run on mainnet.
6. **Email is a development outbox** until a provider is configured; in production mode the server refuses to send rather than pretend.
7. **Single-process SQLite and in-memory rate limits** are development choices.
8. **Reminders are manual.** There is no scheduler.
9. **Smart-contract wallets** cannot be linked yet (standard accounts only).
10. **History reads do not scale as written.** The public RPC rejected a log query of about 14,000 blocks, so reads are chunked. An indexer is milestone M8.
11. **A recipient that USDC refuses to pay** (for example a blocklisted address) makes payments to that group fail without moving money. The group must be recreated. Accepted and documented.
12. **Nicknames are public and permanent** onchain. The app warns before payment.
13. **No users yet,** and no operational history.

## 7. Milestones

Proposed, not committed; durations depend on third parties. Each has acceptance criteria so payment can be tied to evidence.

| # | Milestone | Needs from others | Acceptance criteria | Proposed time |
|---|-----------|-------------------|---------------------|---------------|
| M0-M4 | v1 freeze, accounts, testnet wallet, invites, sandbox payments | none | **Done** (section 3) | Done |
| M5 | Mainnet pilot of the unchanged contract (deployment and first two payments done; supervised pilot with more users remains) | Owner's wallet and funds, audit decision | Deployed address, verified source, one supervised small USDC group, transaction hashes published | Owner-led, days |
| M6 | Real email and hosted beta | Mail provider, hosting | Domain authenticated, bounce handling, Postgres, shared rate limits, public testnet beta | 2 to 3 weeks |
| M7 | Circle wallet pilot | Circle Console config | A new user creates a wallet and pays on testnet without an extension; token handling reviewed | 2 to 3 weeks |
| M8 | Event indexer and scheduled reminders | Hosting | Restart-safe indexer, nightly consistency job green, reminders on a schedule with unsubscribe | 2 to 3 weeks |
| M9 | Yellow Card sandbox integration | Sandbox keys | Quote and collection against their sandbox, signed webhook handled, daily reconciliation with no unexplained breaks for two weeks | 2 to 3 weeks |
| M10 | Compliance position | Legal counsel | Written position on flows B, C and D (`docs/PRODUCTION_ARCHITECTURE.md` section 6), disclosures drafted | 4 to 6 weeks, parallel |
| M11 | Independent audit | Audit firm | Report with all high findings fixed | Depends on audit slot |
| M12 | Live fiat pilot, if M9-M11 allow | Provider agreement, approval | First real NGN-funded contribution with full reconciliation, limited cohort | After M9-M11 |

## 8. Projected operational costs

Only items we measured have numbers. Everything else needs a vendor quote and says so.

### Measured: Arc Testnet network fees

Six real transactions (`docs/measured-gas-arc-testnet.json`). Fees on Arc are paid in USDC.

| Action | Gas used | Fee at the observed price |
|--------|----------|---------------------------|
| Create a group | 140,010 | about 0.0032 USDC |
| Approve exact amount | 55,438 | about 0.0013 USDC |
| First payment by a wallet | 138,518 | about 0.0032 USDC |
| Later payment by a wallet | 78,796 | about 0.0018 USDC |

A group with N payers costs about `0.0032 + N x 0.0045` USDC in network fees at that price (about 0.021 USDC for four). One day's testnet observation.

Measured on Arc mainnet, 30 October 2026 (`docs/DEPLOYMENTS.md`, effective gas price about 21.5 gwei): deploying the contract cost about 0.0149 USDC (691,687 gas); two payments cost about 0.0023 USDC (113,434 gas) and 0.0020 USDC (96,346 gas). These are three data points on one day, not a fee schedule; re-measure before pricing anything.

### Needs a quote

| Item | Driver |
|------|--------|
| Hosting (container, persistent volume) | Users, uptime |
| Managed Postgres and backups | Data volume, retention |
| Dedicated RPC (public RPC rate-limited and rejected wide log ranges in our runs) | Read volume |
| Transactional email | Codes, invites and reminders per active group |
| Circle wallets, gas sponsorship, onramp | Circle's pricing for the chosen products |
| Yellow Card fees and minimums | Commercial terms after KYB |
| Wallet and sanctions screening vendor | Volume |
| Independent smart-contract audit | Scope, firm |
| Legal and compliance counsel | Jurisdictions |
| Support and monitoring | Team time |

SplitPay charges no platform fee in v1 or v2. Adding one needs a new contract version and a new review.

## 9. Use of funds

Priority order: independent audit; Circle wallet pilot; hosted beta with real email; Yellow Card sandbox and legal review; mainnet pilot gas and support. The requested amount and the split are for the applicant to set (**[applicant]**), after the quotes above are collected.

## 10. Honest answers to likely reviewer questions

- **Is anything live?** No production system exists. The contract and app run on Arc Testnet.
- **Do you hold user funds?** No. The contract moves funds payer to recipient. No SplitPay wallet or account holds customer funds in any shipped flow.
- **Can Nigerians pay in naira today?** No. The naira flow is a sandbox demonstration.
- **Does an account block paying?** No. Guests pay from any EVM wallet.
- **What stops a bad link?** The group page recomputes the metadata hash against the onchain record, shows the creator and recipient, and flags any mismatch.
