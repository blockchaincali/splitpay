# Integration research: Circle Wallets, Arc App Kits, Yellow Card

Date of research: 28 October 2026. Sources are named for each finding. "Verified" means read in the vendor's published documentation. "Not verified" means we could not confirm it and it must be checked with the vendor before anyone relies on it.

## 1. Circle wallets (embedded sign-up without MetaMask)

Source: Circle's wallet comparison and the three wallet-type guides available to this project.

| | Developer-controlled | User-controlled | Modular (passkey) |
|---|---|---|---|
| Who holds keys | The developer (SplitPay would) | The user | The user |
| Sign-in | API key + entity secret (server) | Email OTP, social login or PIN | Passkey (WebAuthn) |
| Arc supported | Verified for modular. Check the others | Check per Circle's supported-blockchains page | Verified: Arc is on the modular supported list |
| Gas sponsorship | Via Circle Gas Station for smart accounts | Via Circle Gas Station for smart accounts | Via Circle Gas Station (`paymaster: true`) |

Findings:
- **Developer-controlled wallets would make SplitPay a custodian.** That contradicts the non-custodial promise of v1 and creates licensing questions. Not recommended for contributor wallets.
- **Modular (passkey) wallets are the best fit for "no MetaMask, user keeps control".** They are frontend-only, user-custodied, support Arc, and can sponsor gas. They need a Circle Console client key tied to the exact site hostname and a passkey domain. Passkeys also do not work inside an embedded preview frame, so they must be tested on the deployed site.
- **User-controlled wallets** support email OTP and social login, which matches the "familiar sign-up" goal, but need a Circle App ID, Console configuration and a backend using a Circle API key.
- **What is built now:** an honest testnet-only stand-in, the SplitPay testnet wallet (key encrypted in the browser with a PIN). It proves the flow end to end but is not production custody. Circle's passkey wallet is listed as "needs setup" in the app and is the planned replacement.

Needed from the team to build it: a Circle Console account, a client key and passkey domain for the real hostname, and a decision on gas sponsorship budget.

## 2. Arc App Kits

Source: Circle's App Kit onramp guide and the project's Arc references.

- **Onramp (fiat to crypto widget).** Verified: users can buy crypto with bank transfer, and with card, Apple Pay and Google Pay after Circle's business verification (about 48 hours, production only). The purchased crypto lands in a wallet address the app specifies, and the app must confirm arrival onchain rather than trust browser events. Sandbox uses a testnet API key and needs no business verification. Not verified: whether Nigerian bank transfer is offered, and whether USDC on Arc is in the catalogue. The widget shows its live catalogue, so this is checked by running it in sandbox.
- **Bridge, swap and unified balance** exist in the same kit. They are relevant later for cross-chain contributors, not for the MVP.
- **Fit for SplitPay:** the onramp helps a contributor with no USDC get some, which is an on-ramp to the existing USDC flow. It does not collect NGN for a group's recipient by itself.
- Needed: a Circle API key (testnet for sandbox, mainnet key and business verification for production).

## 3. Yellow Card (NGN rails)

Source: docs.yellowcard.engineering (Getting Started, Authentication, Webhooks, Glossary, Accept Local Currency Payments, Submit Receive Request).

Verified facts:
- Business API. Sandbox base URL `https://sandbox.api.yellowcard.io/business`.
- Request signing: `Authorization: YcHmacV1 {apiKey}:{signature}` and `X-YC-Timestamp` (ISO 8601). Message = timestamp + full path (including `/business`) + HTTP method in capitals + (POST and PUT only) base64 of the SHA-256 of the body. Signature = HMAC-SHA256 with the secret key, base64 encoded. Query strings are not signed. Requests more than five minutes off in time are rejected.
- Collections ("receives"): a receive request locks a rate and awaits approval. For bank transfer, Yellow Card returns an account number for the customer to pay into. On success the partner's USD stablecoin float balance is credited and a webhook is sent.
- Webhooks carry `X-YC-Signature`, a base64 HMAC-SHA256 of the request body using the API secret. Event states run created, process, pending, complete.
- Production needs business verification (KYB), static IP allowlisting and per-transaction KYC details for the customer. The portal enforces two-factor sign-in.
- Settlement to a crypto wallet goes only to addresses Yellow Card has screened and whitelisted in advance.
- Coverage includes Nigeria (the glossary and guides cover Africa-wide bank transfer and mobile money; per-channel status must be filtered because channels have outages).

Not verified (ask Yellow Card):
- Whether Arc is a supported stablecoin network for top-ups or payouts.
- Fees, minimums and maximums for NGN bank transfer collections.
- Whether a reseller model like SplitPay's is permitted without SplitPay holding a licence.

What this means for the product:
- **Direct domestic bank transfer** (a contributor pays the organiser's own NGN account) does not need Yellow Card or Arc. SplitPay can provide instructions and tracking, but it cannot see or confirm the bank transfer unless the organiser marks it. v2 does not offer this as a confirmed payment.
- **NGN to Arc USDC** means SplitPay would collect NGN, hold stablecoin float at Yellow Card, and send USDC to a recipient on Arc. That is custody and money transmission and needs legal sign-off first (milestone M7). It is not built.
- **What is built:** the signing and webhook-verification code, tested against the documented format, plus a clearly labelled sandbox provider for the UI and status model. Nothing has been run against Yellow Card.

## 4. Recommended order

1. Create Yellow Card sandbox credentials and run the adapter against their sandbox (M5).
2. Pilot Circle passkey wallets on the deployed testnet site (M6).
3. Run Circle's onramp widget in sandbox and record whether Nigerian bank transfer and USDC on Arc are offered.
4. Take legal advice on NGN custody before any live NGN flow (M7).
5. Independent audit and the mainnet checklist before any real-money use (M8).
