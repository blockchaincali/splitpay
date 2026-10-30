# Arc Microgrants (Built with Arc Studio): submission package

Prepared 28 October 2026. Items marked **[you]** can only be done by you. Items marked **[fill]** need your details. Nothing here has been submitted.

## 1. Read this first: the eligibility gap

The round's published rules (sources in section 9) require a project that is **built in Arc Studio, deployed to Arc mainnet, and has moved real USDC through its contract and app**. Testnet-only builds are listed as not eligible. The deadline is **1 November 2026**.

**Update, 30 October 2026: the gap is closed on-chain.** The owner deployed the unchanged contract to Arc mainnet (`0x5E02A090D6fbEADeF2cAb310Da64C222677A809a`, block 28666906) and two real payments of 0.25 USDC went through it into one group. I confirmed this read-only against the chain: the deployed code matches this repository's build, `usdc()` is the official USDC, and both payments emitted `ContributionReceived` from the contract (`docs/DEPLOYMENTS.md`). What remains is not code: the video, your builder profile, pushing the final branch to the public repository, and submitting the form before the cutoff. The matrix in section 2 shows each requirement's state.

(For the record: Arc Studio did not and cannot deploy to, fund, sign for or transact on mainnet. Those steps are yours, from your own wallet, outside Arc Studio, and they involve real money and cannot be undone.)

You have three honest options:

| Option | What it means |
|--------|---------------|
| A. Go to mainnet before the deadline | Follow section 3. Tight (see timeline) and it needs your decision on the audit question below |
| B. Skip this round | Keep v1.0.0 as is; apply to a later round or to the Circle Developer Grants programme using `docs/GRANT_APPLICATION.md`, which is written to be truthful about testnet status |
| C. Submit anyway as testnet-only | The published rules say this is ineligible; expect rejection. Not recommended |

### The audit question you must decide

`docs/MAINNET_CHECKLIST.md` lists an independent audit as a gate. A third-party audit is unlikely to fit before 1 November. The contract has no owner, no admin, no fees, no upgrade path and holds no funds (each payment goes straight from payer to recipient), which limits the damage a bug could do to the amount of a single in-flight payment. That does not remove the risk. If you go ahead without an audit, record the decision yourself, keep the first mainnet amounts small (for example 1 to 2 USDC across two wallets you control), say "unaudited, small-value pilot" in the submission and the app, and do not promote the link widely. That is your call and your responsibility.

## 2. Requirements matrix

| # | Required by the round | State | Who | Where |
|---|-----------------------|-------|-----|-------|
| 1 | Built in Arc Studio | Ready. Project history and plan are preserved | you provide URL | Arc Studio project URL **[you]**; `docs/BUILD_HISTORY.md`, `arc-studio-plans/PLAN.md`, `AGENTS.md` |
| 2 | Arc Studio project URL | Ready | done | In `README.md`: https://studio.arc.io/app/b48c1672-5469-4cc3-9277-20e5e45cd5e8 |
| 3 | Live app link | Ready, checked read-only | done | https://splitpay-sepia.vercel.app (`docs/DEPLOYMENTS.md`) |
| 4 | Deployed to Arc mainnet | **Done** (30 Oct 2026) | done | `docs/DEPLOYMENTS.md` |
| 5 | Contract address(es) | Mainnet `0x5E02A090D6fbEADeF2cAb310Da64C222677A809a`; testnet `0xd7f9c3823e81fe27300693c060a6418ad3eed806` | done | `docs/DEPLOYMENTS.md` |
| 6 | One example transaction hash (real USDC moved on mainnet) | Ready: `0x2271805f7af74b98f79385dd5cb8703602cc28d485c37c73821e6eca8cbb2b0d` (and a second, `0x20c05490…f8a6`) | done | `docs/DEPLOYMENTS.md` |
| 7 | Public repository | https://github.com/blockchaincali/splitpay exists. Push the final branch (`arc-studio-release-3`) so the submitted code includes the mainnet record | you (GitHub) | `docs/RELEASE_CHECKLIST.md` section A |
| 8 | Video walkthrough | **Missing** | you | Section 5 gives the script |
| 9 | Short description | Draft ready | you review | Section 4 |
| 10 | Public builder profile (GitHub, X or Farcaster) | **[fill]** | you | Your profile URL |
| 11 | Real USDC moving through app and contract | **Done on-chain**: 2 payments of 0.25 USDC. That they came through the live app is your statement; the chain cannot show the front end | done | `docs/DEPLOYMENTS.md` |
| 12 | Working product | Verified on testnet and on the live mainnet site | done | `docs/TEST_EVIDENCE.md`, `docs/DEPLOYMENTS.md` |

Scoring weights as published: real USDC on mainnet 30%, use of Arc Studio across the build 25%, working product 25%, potential to go further 20%. Honest self-assessment today: the mainnet criterion now has on-chain evidence (a deployed contract and two real 0.25 USDC payments; breadth of use is still tiny); the working-product and Arc Studio criteria are well supported by the evidence in this repository; the "go further" case is in `docs/GRANT_APPLICATION.md` and `docs/PRODUCTION_ARCHITECTURE.md`.

## 3. Mainnet steps (yours alone)

Read the warning and checklist in `docs/MAINNET_CHECKLIST.md` first. Condensed order:

1. **[you]** Confirm the facts at the source before using them: chain ID, RPC and explorer on Arc's official documentation, and the mainnet USDC address (the checklist lists what the app's data module holds; verify it independently).
2. **[you]** Prepare a deployer wallet you control. Use a Foundry keystore or hardware wallet. Never paste a private key into chat, a file or the repository.
3. **[you]** Put a small amount of USDC on Arc mainnet in that wallet. On Arc, gas is paid in USDC.
4. **[you]** Dry-run the deployment script without broadcasting and read the output.
5. **[you]** Deploy `SplitPayGroups` with the mainnet USDC address as the constructor argument. Note the address, transaction hash and block number.
6. **[you]** Verify the source on the Arc explorer and check that the on-chain `usdc()` value matches.
7. **[you]** Create a mainnet release configuration. Do not edit `v1.0.0`. Create a new branch from the docs release (`v1.0.1`) and change only `vercel.json`: set `VITE_SPLITPAY_ADDRESS`, `VITE_SPLITPAY_DEPLOY_BLOCK` and add `VITE_SPLITPAY_CHAIN_ID` set to `5042`. Redeploy on Vercel. The app shows a "real USDC" banner on mainnet.
8. **[you]** Run a small supervised test with two wallets you control: create a group with a goal of 1 USDC, pay half from each wallet, confirm both receipts on the explorer. Keep the transaction hashes. One of them is the "example transaction hash" for the form.
9. **[you]** Do not use funds you cannot afford to lose. Transactions are irreversible.

Suggested timeline for a 1 November cutoff (check the exact cutoff time on the official page): 28 to 29 October repository, hosting and video preparation; 30 October mainnet deployment and small test; 31 October final video and form review; 1 November submit early, not at the last hour.

## 4. Draft text (edit to your voice)

**Project name:** SplitPay

**One-line description:** Group payments in USDC on Arc: create a link, friends pay their share, funds go straight to the recipient.

**Short description:**
SplitPay helps friends, roommates and organisers collect shared expenses without chasing transfers. An organiser creates a payment group with a goal, deadline and receiving wallet, then shares one link (for example in WhatsApp). Contributors open it on their phone, connect any EVM wallet and pay their share in USDC. A small smart contract, `SplitPayGroups`, pulls the exact approved amount and sends it directly to the recipient on Arc. It holds no funds, has no admin and charges no fees. Progress and receipts are read from the chain, and the app only shows a payment as complete after the network has confirmed it. Paying needs no account.

**What it uses Arc for:** USDC settlement. Each contribution is a USDC transfer on Arc, gas is paid in USDC, and the interface handles Arc's 6-decimal USDC token view separately from the 18-decimal native gas view.

**Built with Arc Studio:** The contract, tests, security review, deployment, frontend, browser verification and documentation were produced in one Arc Studio project. See `docs/BUILD_HISTORY.md`.

**Status to state honestly:** **[fill after mainnet]** "Deployed on Arc mainnet at `0x...`; example transaction `0x...`. Unaudited small-value pilot." If you did not complete mainnet, do not write this.

**Fields you provide:** Arc Studio project URL **[you]**; live app URL **[you]**; mainnet contract address **[you]**; example mainnet transaction hash **[you]**; public repository URL **[you]**; video URL **[you]**; builder profile **[you]**.

## 5. Video walkthrough plan (about 2 to 3 minutes)

Record on mainnet if you have deployed it; otherwise any video is testnet-only and does not satisfy the rule. Never show seed phrases, keystore passwords or private keys. Wallet addresses and transaction hashes are public and fine.

1. (0:00) Title and one sentence: what SplitPay is.
2. (0:10) Home page on your public URL, on a phone-sized window.
3. (0:25) Create a group: title, 1 USDC goal, deadline, receiving wallet. Show the "I have checked the receiving wallet" step.
4. (0:55) Confirm in your wallet. Show "waiting for confirmation" then the created screen and the share link, QR and WhatsApp button.
5. (1:15) Open the link as a second person (second wallet). Show "Details verified".
6. (1:30) Pay: approve exactly the amount, then pay. Show the nickname field and the "public onchain" notice.
7. (1:55) Show "Payment confirmed", the progress update and the receipt with its explorer link. Open the explorer to show the real USDC transfer and the `ContributionReceived` event.
8. (2:20) Dashboard. Then one sentence on what the contract does not do: hold funds, charge fees, or have an admin.
9. (2:35) Close: repository link and Arc Studio project link.

## 6. How Arc Studio was used (for the 25% criterion)

Facts only; the full timeline is in `docs/BUILD_HISTORY.md`.

- Planned the product and contract design, then wrote the Solidity contract and its Foundry tests (70 tests, including fuzz and invariants) in the project.
- Ran a security review in the project, which found two high-severity issues (group id front-running and recipient self-payment). Both were fixed and retested.
- Deployed the contract to Arc Testnet from the project and verified the deployed state with reads.
- Built the React app (wallet connection, group creation, payment flow, receipts, dashboard) in the project, then diagnosed and fixed a styling problem found in review.
- Verified the running app in a real browser against Arc Testnet and reran the contract-level checks live.
- Wrote the README, security review, mainnet checklist and grant documents in the project.

## 7. Evidence index

| Evidence | File or command |
|----------|-----------------|
| Contract source (unchanged since release) | `contracts/SplitPayGroups.sol`, SHA-256 in `docs/RELEASE.md` |
| Contract tests | `bun run contracts:test` (70 passing) |
| Security review | `docs/SECURITY_REVIEW.md` |
| Live testnet checks | `bun run e2e:testnet`; `docs/e2e-testnet-report.json` |
| Browser verification | `docs/TEST_EVIDENCE.md`; scripts in `docs/ui-verification/` |
| Guest payment (no account) | `docs/ui-verification/guest-journey.ts.txt`; results in `docs/TEST_EVIDENCE.md` |
| Measured network fees | `docs/measured-gas-arc-testnet.json` |
| Mainnet readiness | `docs/MAINNET_CHECKLIST.md` |
| Frozen release | git tag `v1.0.0`, `docs/RELEASE.md` |

## 8. Outstanding requirements for mainnet (summary)

1. Mainnet deployment from your wallet and verified source.
2. A recorded decision on the independent audit (do it, or accept the small-value pilot risk in writing).
3. A supervised real-USDC test with transaction hashes.
4. Public app URL pointing at the mainnet configuration, with the "real USDC" banner.
5. A video recorded against mainnet.
6. Confirming the round's rules on the official page immediately before you submit.

## 9. Sources for the round's rules

I could not open the official DoraHacks page (it returned an error to my fetch), so these come from other public pages. Treat the official page as authoritative and re-read it before submitting.

- Official page named in Arc's announcement: https://dorahacks.io/hackathon/arc-microgrants-2/detail
- Arc's announcement of the round (mirrored): "Experiments must be built in Arc Studio and move real USDC on Arc Mainnet. Submissions close Nov. 1."
- Programme summary (eight grants of 500 USDC from a 4,000 USDC pool; required fields; scoring weights): https://devgrantsdaily.com/items/2026-10-25-arc-microgrants-built-with-arc-studio/
- First round's page, for the general rules (mainnet requirement, public repo, builder profile): https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq
