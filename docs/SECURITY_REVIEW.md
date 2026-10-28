# SplitPayGroups: security review notes

Scope: `contracts/SplitPayGroups.sol` (Solidity 0.8.28, OpenZeppelin 5.6.1). Reviewed at the most thorough level available in Arc Studio: a rule-based review, an independent functional and adversarial review, and Slither static analysis. This is not a substitute for a third-party audit.

## Design in one paragraph

Anyone can create a group. The group id is `keccak256(creator, salt)`, so nobody else can register an id you chose. Recipient, target, deadline and metadata hash are fixed at creation. `contribute` records the payment, then uses `SafeERC20.safeTransferFrom` to move USDC from the contributor directly to the recipient. The contract never holds tokens, has no owner, no pause, no fees and no payable functions.

## Findings and outcomes

| # | Finding | Severity | Outcome |
|---|---------|----------|---------|
| 1 | Group ids were a shared namespace, so someone could register a pending id with their own recipient (front-running) | High | Fixed: id is derived from creator and salt. Tests prove another wallet cannot take over an id. |
| 2 | A recipient could pay their own group, inflating "collected" with no new money | High | Fixed: `RecipientCannotContribute`. Tests included. |
| 3 | A recipient that USDC refuses to pay (blocklisted) or a reserved address makes every payment revert | Medium | Accepted and documented. No funds are ever held or lost; the organiser creates a new group. The UI warns organisers to check the address. |
| 4 | Some errors do not carry parameters (`GroupNotFound`, `InvalidDeadline`, `NameTooLong`) | Low | Accepted. `GroupExpired` and `TargetExceeded` do carry context. |
| 5 | Slither: timestamp comparisons for the deadline | Informational | Expected. Deadlines are second-level and miners cannot meaningfully shift them. |

## Tests

- Foundry: 70 passing across unit, bad-token (false-returning, reverting, blocklisted recipient, re-entrant), fuzz and invariant suites. Invariants: contract USDC balance stays 0, collected never exceeds the target, per-wallet totals sum to collected, recipient balance equals collected.
- Live Arc Testnet check (`bun run e2e:testnet`): 31 of 31 passing, covering exact allowances, direct delivery to the recipient, overpayment, expiry, nickname limits, front-run protection, and log scans. Transaction hashes are in `docs/e2e-testnet-report.json`.
- Frontend library tests (`bun run test:lib`): split arithmetic and share-link verification.

## Known limits

- Individual split amounts are guidance in the share link. The contract enforces only the group total.
- Nicknames are public and permanent.
- Fee-on-transfer or rebasing tokens are not supported; the contract is meant for USDC.
- The review did not exercise real USDC blocklist behaviour; that can only be confirmed on the live token.
