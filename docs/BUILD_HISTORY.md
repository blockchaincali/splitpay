# Build history

This project was built in Arc Studio. This file records how, so a reviewer can follow the work without access to the original conversation. It states plainly what is and is not preserved.

## What is preserved, and where

| Record | Where | Notes |
|--------|-------|-------|
| The Arc Studio project and its conversation | Your Arc Studio account | The original, complete record of prompts, decisions and tool runs. **Keep the project; do not delete it.** Link it in the README and the submission. **[you]** |
| Approved product plan | `arc-studio-plans/PLAN.md` | The plan approved before building |
| Project memory and decisions | `AGENTS.md` | Deployed addresses, invariants, rules for future changes |
| Source history | git history | **Starts at the v1.0.0 export.** The Arc Studio workspace was not under version control before that, so there are no earlier commits to show. This is not a rewritten history |
| Security review | `docs/SECURITY_REVIEW.md` | Findings, fixes, accepted risks |
| Test and verification evidence | `docs/TEST_EVIDENCE.md`, `docs/e2e-testnet-report.json`, `docs/ui-verification/` | Re-runnable |

Do not try to recreate earlier git history. A reviewer who asks for it should be pointed to the Arc Studio project.

## Timeline (all work on 28 October 2026 unless stated)

| Stage | What happened | Outcome |
|-------|---------------|---------|
| 1. Plan | Product, storage and nickname decisions made; plan approved | `arc-studio-plans/PLAN.md` |
| 2. Contract | `SplitPayGroups` written; first test suite written | 55 tests passing |
| 3. Review | Automated security review. High findings: group id front-running, recipient self-payment. Fixed; suite extended | 70 tests passing |
| 4. Testnet deploy | Contract deployed to Arc Testnet; state verified by reads | `0xd7f9c382...ed806`, block 69502501 |
| 5. Frontend | Library layer (metadata hash, splits, chain reads) and screens: create, share, pay, receipts, dashboard | Typecheck and lint clean |
| 6. Live testing | Contract-level checks on Arc Testnet with throwaway wallets | 31 of 31 |
| 7. Styling fix | Preview reported as unstyled. Fonts were loaded from a third-party service with no fallback; the Arc Studio watermark overlapped content. Fonts bundled, watermark moved, layout polished. App then verified in a real browser | Fixed; evidence in `docs/TEST_EVIDENCE.md` |
| 8. Mainnet readiness docs | Checklist written after the mainnet warning was acknowledged | `docs/MAINNET_CHECKLIST.md` |
| 9. Release freeze | `v1.0.0` tagged and exported; v2 started on its own branch | `docs/RELEASE.md` |
| 10. Consumer v2 | Accounts, testnet wallet, invitations, reminders, NGN sandbox, server | 38 API tests; 17 of 17 browser checks |
| 11. Submission preparation | Grant pack, production architecture, submission package, release checklist | These documents |

## Decisions worth knowing

- Group details live in the share link with a hash committed onchain, so there is no server for v1 and no way to alter details silently.
- Nicknames are limited to 24 UTF-8 bytes and are public onchain; the app says so before payment.
- Money amounts use the 6-decimal USDC token view only. Gas, also paid in USDC on Arc, is never added to balances.
- v1.0.0 contract and tests are frozen. New work cannot change them without a new version and review.
- Mainnet was never touched from Arc Studio.
