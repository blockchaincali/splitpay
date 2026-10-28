# SplitPay mainnet readiness checklist and deployment instructions

**Status: NOT deployed to mainnet. Documentation only.**

Arc Studio does not deploy to, transact on, sign for, fund, or otherwise interact with mainnet on your behalf. Everything below is for you to review and run yourself, outside Arc Studio. Mainnet transactions use real USDC and are irreversible. You are solely responsible for what you deploy and operate.

## 1. Sign-off gates (all must be "yes" before deploying)

| # | Gate | Status |
|---|------|--------|
| 1 | Independent professional audit of `contracts/SplitPayGroups.sol` completed and every High/Medium finding resolved or formally accepted in writing | ☐ |
| 2 | You have read `docs/SECURITY_REVIEW.md` and understand the accepted limits (blocked recipients, public nicknames, split amounts are guidance only) | ☐ |
| 3 | Contract tests pass on the exact commit you will deploy: `bun run contracts:test` (70 expected) | ☐ |
| 4 | Library tests pass: `bun run test:lib` | ☐ |
| 5 | A fresh end-to-end run on Arc Testnet passes against a freshly deployed copy: `bun run e2e:testnet` | ☐ |
| 6 | You have manually paid through the web app in a real browser wallet on testnet (create, share, pay, confirm, dashboard) | ☐ |
| 7 | Compiler, optimiser and EVM settings in `foundry.toml` are the ones you audited (`solc 0.8.28`, `evm_version = cancun`, optimizer 200 runs) | ☐ |
| 8 | Dependency versions are pinned and reviewed (`@openzeppelin/contracts 5.6.1`) | ☐ |
| 9 | Legal, terms-of-use and privacy review done for your jurisdiction (the app handles payments between people, and nicknames are public onchain) | ☐ |
| 10 | Incident plan agreed (see section 7) | ☐ |

## 2. Network facts to confirm yourself (do not trust this file blindly)

Re-check each against Arc's official documentation immediately before deploying.

| Item | Value in this repo | Confirm at |
|------|--------------------|------------|
| Chain ID | `5042` | Arc docs, network details |
| RPC URL | `https://rpc.mainnet.arc.io` | Arc docs, RPC endpoints |
| Explorer | `https://explorer.arc.io` | Arc docs |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` (6 decimals) | Arc docs, contract addresses |
| Gas | Paid in USDC (18-decimal native view). Your deployer needs a USDC balance for gas | Arc docs |

These values come from `src/onchain-facts.ts`. Open the explorer, look up the USDC address, and verify it is the official USDC before passing it to the constructor. A wrong token address would deploy a contract that is permanently wired to the wrong token.

## 3. Wallet and key hygiene

- Use a dedicated deployer wallet. Prefer a hardware wallet. Otherwise use a Foundry keystore created on a machine you control:
  ```bash
  cast wallet import splitpay-mainnet-deployer --interactive
  ```
- Never paste a private key into chat, into `.env`, into a command-line flag, or into this repository.
- The contract has no owner, admin or upgrade path, so the deployer wallet has no special powers after deployment. You can retire the key once deployed and verified.
- Fund the deployer with only the USDC needed for gas.

## 4. Deploy the contract (run yourself)

From a clean checkout of the audited commit:

```bash
bun install
forge build
forge test

export USDC_ADDRESS=0x3600000000000000000000000000000000000000   # confirm in section 2
export RPC_URL=https://rpc.mainnet.arc.io                         # confirm in section 2
export KEYSTORE_NAME=splitpay-mainnet-deployer

# 1) Dry run (no broadcast). Read the output, confirm chain ID 5042 and the constructor argument.
forge script contracts/script/DeploySplitPayGroups.s.sol:DeploySplitPayGroups \
  --rpc-url "$RPC_URL" --account "$KEYSTORE_NAME"

# 2) Real deployment. Only after you have reviewed the dry run.
forge script contracts/script/DeploySplitPayGroups.s.sol:DeploySplitPayGroups \
  --rpc-url "$RPC_URL" --account "$KEYSTORE_NAME" --broadcast
```

Write down the deployed address, the transaction hash and the block number.

### Post-deploy verification of the contract (read-only checks)

```bash
cast call <ADDRESS> "usdc()(address)" --rpc-url "$RPC_URL"            # must equal the official Arc USDC
cast call <ADDRESS> "MAX_NAME_BYTES()(uint256)" --rpc-url "$RPC_URL"  # must be 24
cast chain-id --rpc-url "$RPC_URL"                                    # must be 5042
cast code <ADDRESS> --rpc-url "$RPC_URL"                              # must not be empty
```

Then publish the source on the Arc block explorer by following the explorer's current verification instructions, using the same compiler settings as `foundry.toml`. Check that the explorer shows the contract as verified and the code matches the repository commit you audited.

## 5. Point the app at mainnet

The app targets testnet unless told otherwise. In the environment of your mainnet build set:

```bash
VITE_SPLITPAY_CHAIN_ID=5042
VITE_SPLITPAY_ADDRESS=<mainnet contract address>
VITE_SPLITPAY_DEPLOY_BLOCK=<mainnet deploy block>
```

Then:

1. Run `bun run check` and `bun run build`.
2. Open the built app. A banner must show "Arc mainnet: payments use real USDC and cannot be reversed", the footer must say real USDC, and explorer links must point to `explorer.arc.io`.
3. Keep the mainnet build on a separate deployment from the testnet build so test links never mix with real ones.
4. Do not reuse testnet share links. Group IDs and links are network-specific.

## 6. First real-money rehearsal (small, supervised)

Do this with money you can afford to lose, from wallets you control.

1. Create a group with a goal of about 0.10 USDC, and a receiving wallet you control that is **not** the organiser or payer wallet.
2. Open the share link in a different browser profile or device with a second wallet.
3. Pay 0.05 USDC with a nickname. Confirm in the explorer: the transfer goes from payer to recipient, the contract holds no USDC, and the allowance used was exactly 0.05 (no leftover approval).
4. Pay the rest, confirm the group shows fully paid, and try one more payment to confirm it is refused.
5. Check the dashboard lists the group and the amounts match the explorer.
6. Record the transaction hashes for your grant submission.

## 7. Operating and incident notes

- There is no pause switch and no admin key by design. If a serious bug is found, the only response is to stop sharing links, take the app down, tell users to revoke any open allowances, and deploy a fixed contract at a new address.
- Allowances are exact and are consumed by each payment. Users can revoke any leftover allowance for the contract address in their wallet.
- A recipient wallet that USDC refuses to pay (for example a blocklisted address) makes payments to that group revert without moving money. Create a new group with a different wallet.
- Nicknames are public and permanent. Do not accept or display nicknames as verified identity.
- The public RPC can rate-limit. If you expect real traffic, use a dedicated RPC provider and update the RPC URL in your build.
- Monitor the contract address on the explorer. Re-run section 6 after any redeploy.

## 8. Known limits to disclose to users

- Individual split amounts are guidance in the share link. The contract enforces only the group total, the deadline and the fixed recipient.
- Anyone with a group link can pay into it. The recipient wallet cannot pay into its own group.
- The contract is built for USDC. Do not point it at a fee-on-transfer or rebasing token.
- This documentation, the automated review, and the tests are not a substitute for an independent audit.

## 9. Final sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering owner | | | |
| Security reviewer | | | |
| Product / compliance owner | | | |

Only deploy when every gate in section 1 is checked and this table is complete.
