# SplitPay mainnet readiness checklist and deployment instructions

**Status: NOT deployed to mainnet. Preparation only.**

Arc Studio does not deploy to, transact on, sign for, fund, or otherwise interact with mainnet on your behalf. Its deploy tool is testnet-only and cannot sign with your wallet. Everything below is for you to review and run yourself, outside Arc Studio. Mainnet transactions use real USDC and are irreversible. You are solely responsible for what you deploy and operate.

Last checked against Arc's official documentation on 29 October 2026 (links in section 2). Re-check before you deploy.

## 0. What is still outstanding for mainnet

| # | Requirement | Who | Status |
|---|-------------|-----|--------|
| 1 | Independent professional audit of `contracts/SplitPayGroups.sol` (the automated review in `docs/SECURITY_REVIEW.md` is not an audit) | You | Open |
| 2 | Deploy the contract to Arc mainnet from a wallet you control (section 4) | You | Open |
| 3 | Set the three build variables in Vercel and redeploy (section 5) | You | Open |
| 4 | One small real-USDC rehearsal with wallets you control (section 6) | You | Open |
| 5 | Record the mainnet address, deploy transaction and first payment transaction in `README.md` (marked spaces) | You | Open |

## 1. Sign-off gates (all must be "yes" before deploying)

| # | Gate | Status |
|---|------|--------|
| 1 | Independent audit completed and every High/Medium finding resolved or formally accepted in writing | ☐ |
| 2 | You have read `docs/SECURITY_REVIEW.md` and understand the accepted limits (blocked recipients, public nicknames, split amounts are guidance only) | ☐ |
| 3 | `arc-forge test --network arc` passes on the exact commit you will deploy (70 expected). It runs the tests on Arc's own runtime | ☐ |
| 4 | `bun run test:lib` and `bun run test:mainnet` pass | ☐ |
| 5 | A fresh end-to-end run on Arc Testnet passes: `bun run e2e:testnet` (31 checks) | ☐ |
| 6 | You have paid through the web app in a real browser wallet on testnet (create, share, pay, confirm, dashboard) | ☐ |
| 7 | `contracts/SplitPayGroups.sol` still has SHA-256 `b904dc88280a74a9e615d63bd14bd1f58f1bb7cc808b0db598ee81a03f5f42bc` (the audited, frozen v1.0.0 source) | ☐ |
| 8 | Compiler settings in `foundry.toml` are the ones you audited (`solc 0.8.28`, `evm_version = cancun`, optimizer 200 runs). Arc's EVM baseline is Osaka, which runs Cancun bytecode | ☐ |
| 9 | Dependency versions pinned and reviewed (`@openzeppelin/contracts 5.6.1`) | ☐ |
| 10 | Legal, terms-of-use and privacy review done for your jurisdiction (payments between people; nicknames are public onchain) | ☐ |
| 11 | Incident plan agreed (section 7) | ☐ |

## 2. Network facts (verified against Arc's docs on 29 October 2026)

| Item | Value in this repo | Official source |
|------|--------------------|-----------------|
| Chain ID | `5042` (testnet `5042002`) | https://docs.arc.io/arc/references/rpc-endpoints.md |
| Primary RPC | `https://rpc.mainnet.arc.io` (anonymous, open CORS) | same page |
| Other public RPCs the app fails over to | `https://rpc.blockdaemon.mainnet.arc.io`, `https://rpc.drpc.mainnet.arc.io`, `https://rpc.quicknode.mainnet.arc.io` | same page |
| Explorer | `https://explorer.arc.io` (testnet `https://explorer.testnet.arc.io`) | same page |
| USDC ERC-20 view | `0x3600000000000000000000000000000000000000`, 6 decimals (the native gas view has 18) | https://docs.arc.io/arc/references/contract-addresses.md |
| `eth_getLogs` range | up to 10,000 blocks per call (the app reads in smaller windows and learns each endpoint's limit) | RPC endpoints page |
| Fees | Paid in USDC. Minimum base fee 20 Gwei | https://docs.arc.io/arc/references/gas-and-fees.md |
| Tooling | Arc Foundry (`arc-forge`, `arc-cast`, `arc-anvil`) | https://docs.arc.io/arc/tutorials/install-arc-foundry.md |

`bun run test:mainnet` fails if the values in the code stop matching the list above. Open the explorer, look up the USDC address, and confirm it is the official USDC before it goes into a constructor: a wrong token address is permanent.

Read-only checks run on 29 October 2026 against the four public mainnet endpoints: all answer chain ID 5042; the primary and QuickNode accept log ranges up to 9,999 blocks; Blockdaemon accepts 50,000; dRPC refused every log query on its free plan. The app's scanner finished a 200,000-block mainnet scan in 29 requests. These are observations of public endpoints, not guarantees.

## 3. Wallet and key hygiene

- Use a dedicated deployer wallet. A hardware wallet is best. Otherwise use an encrypted Foundry keystore created on a machine you control (section 4).
- Never paste a private key into chat, into `.env`, into a command-line flag, or into this repository. `arc-cast wallet import ... --interactive` asks for the key in a hidden prompt and stores it encrypted under a password you choose.
- The contract has no owner, admin or upgrade path, so the deployer wallet has no special powers afterwards. You can retire the key once deployed and verified.
- Fund the deployer with only the USDC needed for gas. A dry run on Arc Testnet estimated about 0.04 USDC at roughly 44 Gwei. The mainnet fee level is not measured here, so read the "Estimated amount required" line in your own dry run and fund about twice that.

## 4. Deploy the contract yourself (Windows-friendly: use WSL)

Arc Foundry's Windows support is through WSL (Windows Subsystem for Linux). Everything below after step 4.1 runs inside the Ubuntu window. These exact commands (dry run, then broadcast with an encrypted keystore, then source verification) were run on Arc Testnet on 29 October 2026 and produced a contract with runtime code identical to the grant contract. The mainnet run differs only in the RPC URL, chain ID and explorer URL.

### 4.1 Install WSL (once, in Windows PowerShell as Administrator)

```powershell
wsl --install -d Ubuntu
```

Restart if asked, open "Ubuntu" from the Start menu, and create a Linux username and password.

### 4.2 Install Arc Foundry (in Ubuntu)

```bash
mkdir -p ~/arcf && cd ~/arcf
V=v0.8.0-2   # the version tested here; use the newest release on https://github.com/circlefin/arc-foundry/releases if you prefer
curl -LO https://github.com/circlefin/arc-foundry/releases/download/$V/arc-foundry-$V-x86_64-unknown-linux-gnu.tar.gz
curl -LO https://github.com/circlefin/arc-foundry/releases/download/$V/arc-foundry-$V-x86_64-unknown-linux-gnu.tar.gz.sha256
sha256sum -c arc-foundry-$V-x86_64-unknown-linux-gnu.tar.gz.sha256      # must say OK
tar -xzf arc-foundry-$V-x86_64-unknown-linux-gnu.tar.gz
mkdir -p ~/.local/bin
mv forge ~/.local/bin/arc-forge && mv cast ~/.local/bin/arc-cast && mv anvil ~/.local/bin/arc-anvil
export PATH="$HOME/.local/bin:$PATH"   # add this line to ~/.bashrc too
arc-forge --version
```

(On an ARM Windows PC use the `aarch64-unknown-linux-gnu` archive instead.)

### 4.3 Get the audited code and build it

```bash
sudo apt-get update && sudo apt-get install -y git unzip curl
curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH"
git clone https://github.com/blockchaincali/splitpay.git && cd splitpay
git checkout arc-studio-release          # or the commit you audited
sha256sum contracts/SplitPayGroups.sol   # must equal the value in gate 7
bun install --frozen-lockfile
arc-forge build
arc-forge test --network arc             # expect: 70 tests passed
```

### 4.4 Create the encrypted keystore (once)

```bash
arc-cast wallet import splitpay-mainnet-deployer --interactive
```

Paste the private key at the hidden prompt, then choose a keystore password. It is stored encrypted in `~/.foundry/keystores/`. Check the printed address is your deployer wallet and send it the USDC for gas on Arc mainnet. For a hardware wallet, replace `--account NAME` below with `--ledger` or `--trezor`.

### 4.5 Point at mainnet and check it

```bash
export RPC_URL=https://rpc.mainnet.arc.io
export USDC_ADDRESS=0x3600000000000000000000000000000000000000
arc-cast chain-id --rpc-url "$RPC_URL"                 # must print 5042
arc-cast call "$USDC_ADDRESS" "decimals()(uint8)" --rpc-url "$RPC_URL"   # must print 6
arc-cast balance <YOUR_DEPLOYER_ADDRESS> --rpc-url "$RPC_URL"            # shows the gas balance (18-decimal native view)
```

### 4.6 Dry run (nothing is sent)

```bash
arc-forge script contracts/script/DeploySplitPayGroups.s.sol:DeploySplitPayGroups \
  --rpc-url "$RPC_URL" --account splitpay-mainnet-deployer
```

It asks for the keystore password. Read the output before going further:
- `Script ran successfully.`
- `Chain 5042` (if it says anything else, stop)
- `deployed: contract SplitPayGroups 0x...` is the address the real run will create
- `Estimated amount required` is within the USDC you funded

### 4.7 Real deployment (only after you have reviewed the dry run)

```bash
arc-forge script contracts/script/DeploySplitPayGroups.s.sol:DeploySplitPayGroups \
  --rpc-url "$RPC_URL" --account splitpay-mainnet-deployer --broadcast
```

It ends with `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.` Get the three values to record:

```bash
python3 - <<'EOF'
import json
j = json.load(open('broadcast/DeploySplitPayGroups.s.sol/5042/run-latest.json'))
print('contract address :', j['transactions'][0]['contractAddress'])
print('deploy tx hash   :', j['receipts'][0]['transactionHash'])
print('deploy block     :', int(j['receipts'][0]['blockNumber'], 16))
EOF
```

The `broadcast/` folder is ignored by git. Do not commit it.

### 4.8 Read-only checks of what you deployed

```bash
export CONTRACT=<ADDRESS from 4.7>
arc-cast call "$CONTRACT" "usdc()(address)" --rpc-url "$RPC_URL"            # must be the official USDC above
arc-cast call "$CONTRACT" "MAX_NAME_BYTES()(uint256)" --rpc-url "$RPC_URL"  # must be 24
arc-cast code "$CONTRACT" --rpc-url "$RPC_URL" | head -c 80                 # must not be empty (0x)
```

### 4.9 Publish the source on the explorer

Arc's explorer runs Blockscout. The same command succeeded on Arc Testnet (explorer.testnet.arc.io). For mainnet use the mainnet chain ID and explorer:

```bash
arc-forge verify-contract "$CONTRACT" contracts/SplitPayGroups.sol:SplitPayGroups \
  --chain-id 5042 --verifier blockscout --verifier-url https://explorer.arc.io/api/ \
  --constructor-args $(arc-cast abi-encode "constructor(address)" "$USDC_ADDRESS") --watch
```

Open `https://explorer.arc.io/address/<CONTRACT>` and confirm the Contract tab shows verified source. If the mainnet verifier URL is rejected, use the explorer's contract verification page instead (the testnet docs mention this fallback).

### 4.10 If something goes wrong

- A failed dry run costs nothing. Stop and read the error.
- Do not retry a broadcast blindly. Check your deployer address on the explorer first to see whether the transaction landed.
- "transaction underpriced" means the fee was below Arc's 20 Gwei minimum. The dry run estimates were well above that, so treat it as unexpected and stop.
- Never paste a private key into a chat or ticket when asking for help. Share the error text and the transaction hash only.

## 5. Point the app at mainnet (Vercel)

`vercel.json` no longer contains any network, contract address or block. Set these in the Vercel project: Settings, Environment Variables.

| Variable | Production value | Notes |
|----------|------------------|-------|
| `VITE_SPLITPAY_CHAIN_ID` | `5042` | Leave unset for Arc Testnet |
| `VITE_SPLITPAY_ADDRESS` | the mainnet contract address from 4.7 | Public value |
| `VITE_SPLITPAY_DEPLOY_BLOCK` | the deploy block from 4.7 | Where history scans start |

Do not set `VITE_ACCOUNTS_ENABLED` (the static site has no server). To keep test links away from real ones, set the testnet values (`VITE_SPLITPAY_ADDRESS=0xd7f9c3823e81fe27300693c060a6418ad3eed806`, `VITE_SPLITPAY_DEPLOY_BLOCK=69502501`, no chain ID) for Preview deployments only. Redeploy after changing variables; Vite reads them at build time.

Then check the live site:
1. A banner reads "Arc mainnet: payments use real USDC and cannot be reversed", the page says real USDC, and there is no test-network wording or faucet link.
2. Explorer links open `explorer.arc.io`.
3. The wallet prompt asks for Arc (chain 5042). The browser-held SplitPay testnet wallet is not offered on mainnet.
4. Do not reuse testnet share links. Group IDs and links are network-specific.

## 6. First real-money rehearsal (small, supervised)

Do this with money you can afford to lose, from wallets you control.

1. Create a group with a goal of about 0.10 USDC, and a receiving wallet you control that is **not** the organiser or payer wallet.
2. Open the share link in a different browser profile or device with a second wallet.
3. Pay 0.05 USDC with a nickname. In the explorer confirm: the transfer goes from payer to recipient, the contract holds no USDC, and the allowance used was exactly 0.05 (no leftover approval).
4. Pay the rest, confirm the group shows fully paid, and try one more payment to confirm it is refused.
5. Check "Your groups" lists the group and the amounts match the explorer.
6. Put the contract address, the deploy transaction and the first payment transaction into the marked spaces in `README.md`.

## 7. Operating and incident notes

- There is no pause switch and no admin key by design. If a serious bug is found, the only response is to stop sharing links, take the app down, tell users to revoke any open allowances, and deploy a fixed contract at a new address.
- Allowances are exact and are consumed by each payment. Users can revoke any leftover allowance for the contract address in their wallet.
- A recipient wallet that USDC refuses to pay (for example a blocklisted address) makes payments to that group revert. Arc's docs note that a reverted blocklist check still consumes gas. No money moves. Create a new group with a different wallet.
- Nicknames are public and permanent. Do not accept or display nicknames as verified identity.
- The public RPCs can rate-limit. The app spreads reads over four public endpoints, but for real traffic use a dedicated provider and update the RPC list.
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
