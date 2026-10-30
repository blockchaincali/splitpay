# SplitPay deployments

Every deployment of `SplitPayGroups`, with how it was made and how it was checked. The contract source is unchanged since `v1.0.0`:
`contracts/SplitPayGroups.sol`, SHA-256 `b904dc88280a74a9e615d63bd14bd1f58f1bb7cc808b0db598ee81a03f5f42bc`.

Checks below were made read-only on 30 October 2026 (no transaction was sent). They can be repeated with
`docs/verification/verify-mainnet-deployment.ts.txt`.

## Arc mainnet (chain ID 5042): production

| Item | Value |
|------|-------|
| Contract | `0x5E02A090D6fbEADeF2cAb310Da64C222677A809a` ([explorer](https://explorer.arc.io/address/0x5E02A090D6fbEADeF2cAb310Da64C222677A809a)) |
| Constructor argument | USDC `0x3600000000000000000000000000000000000000` |
| Deploy transaction | `0xdb5807f12cff462ce71b09562f808a1f1f84c72c7fa70ba608de261a5d75bcab` ([explorer](https://explorer.arc.io/tx/0xdb5807f12cff462ce71b09562f808a1f1f84c72c7fa70ba608de261a5d75bcab)) |
| Deploy block | 28666906 (2026-10-30 15:20:00 UTC) |
| Deployer | `0x9fc79e370c3c37de07b42513e13e7f1d4db8d223` (the owner's wallet) |
| Deploy fee | 691,687 gas at an effective 21.5 gwei, about 0.0149 USDC |
| Live app | https://splitpay-sepia.vercel.app (Vercel production, `VITE_SPLITPAY_CHAIN_ID=5042`) |

### How it was deployed

Deployed by the owner, outside Arc Studio, from the owner's own wallet (Arc Studio does not deploy to or sign for mainnet):

1. Remix IDE with the unchanged `contracts/SplitPayGroups.sol`.
2. Compiler: solc 0.8.28, optimizer on with 200 runs, EVM version cancun.
3. Constructor: the official Arc USDC address above.
4. MetaMask connected to Arc mainnet, one deployment transaction signed by the owner.
5. Source verification on the Arc explorer, completed by the owner (explorer shows the source as verified).

This is a different route from the Foundry and keystore steps in `docs/MAINNET_CHECKLIST.md`. Both routes compile the same source with the same settings,
and the result below shows the deployed code is the same.

### Verification results (read-only)

| Check | Result |
|-------|--------|
| Three mainnet endpoints (`rpc.mainnet.arc.io`, Blockdaemon, QuickNode) all report chain ID 5042 | Yes |
| The three endpoints return the same runtime bytecode: 2,840 bytes, keccak-256 `0xa31489ce870c04b7d4f5b7e2d9c7bc391216387dc977a53071a6f9be992373e5` | Yes |
| Runtime bytecode equals this repository's build of `SplitPayGroups.sol` (solc 0.8.28, cancun, optimizer 200), ignoring the trailing metadata hash and the three immutable `usdc` slots | **Identical** (2,787 bytes compared) |
| The immutable `usdc` value stored in the code is the official USDC | Yes (`0x3600…0000`) |
| `usdc()` | `0x3600000000000000000000000000000000000000` |
| `MAX_NAME_BYTES()` | `24` |
| Deploy receipt | status success, block 28666906, `contractAddress` equals the address above |
| Same code as the testnet grant contract (`0xd7f9…ed806`), ignoring metadata | Identical |
| Total events ever emitted by the contract (deploy block to head) | 4: 2 `GroupCreated`, 2 `ContributionReceived` |

How to read the bytecode result. The compiler appends a metadata hash that depends on file paths and import names, so a Remix build and a Foundry
build of the same source always differ in that last part. Everything before it, including all logic, is identical. The `usdc` immutable is written into the code
at deployment, so it is compared separately against the official address. I could not re-check the explorer's "verified" badge automatically: the explorer's API
returned a bot-protection page (HTTP 403) to this environment. The bytecode comparison above is the independent confirmation.

### First real USDC payments (through the contract on mainnet)

Both calls went to the contract above, succeeded, and emitted `ContributionReceived` from this contract. Each moved exactly 0.25 USDC straight from the payer to the
group's recipient; the contract held nothing.

| | Payment 1 | Payment 2 |
|---|---|---|
| Transaction | [`0x2271805f…2b0d`](https://explorer.arc.io/tx/0x2271805f7af74b98f79385dd5cb8703602cc28d485c37c73821e6eca8cbb2b0d) | [`0x20c05490…f8a6`](https://explorer.arc.io/tx/0x20c0549036ed7393c7b1c5603c9fd0b0fa1a6f28ce377d9b31e063fbad49f8a6) |
| Block and time | 28679064, 2026-10-30 17:02:45 UTC | 28679234, 2026-10-30 17:04:11 UTC |
| Payer (`from`) | `0x31220bdb…db67` | `0x9fc79e37…d223` |
| Nickname emitted | `Jax` | `jane` |
| Amount | 0.25 USDC | 0.25 USDC |
| Running total in the event | 0.25 | 0.50 |
| USDC `Transfer` | payer to `0x49505dcd…8988`, 250000 units | payer to `0x49505dcd…8988`, 250000 units |
| Fee | about 0.0023 USDC (113,434 gas) | about 0.0020 USDC (96,346 gas) |

The group they paid (`0x8074c665…c362`, created in block 28678839, tx `0x1f3481b4…aa46`): target 0.50 USDC, deadline 2026-10-31 16:59 UTC, collected 0.50, remaining 0,
so it is fully funded. Creator and recipient are the same wallet (`0x49505dcd…8988`); two different wallets paid it. The deploying wallet (`0x9fc79e37…d223`) is
also the payer of payment 2. The second group on the contract (target 1 USDC, created in block 28677183) has no payments yet.

What the chain proves, and what it does not. The chain proves these were successful calls to this contract that moved real USDC. It cannot show which website or
tool sent a transaction; that they were made through the live app is the owner's statement.

### Live app check (read-only, 30 October 2026)

| Check | Result |
|-------|--------|
| https://splitpay-sepia.vercel.app loads and deep links such as `/g/<id>` return the app (rewrite works) | Yes |
| Production bundle contains the mainnet contract address and deploy block 28666906 | Yes |
| Production bundle contains the old testnet contract address or testnet deploy block | No |
| Home page "Network" section in a real browser (desktop and phone size) | Shows the real-USDC warning and "View the contract" linking to `https://explorer.arc.io/address/0x5E02…809a` |
| Any testnet wording, faucet, sign-in prompt or `/api` request on the page | None |
| Horizontal scrolling at 390 and 1280 px, page errors | None |
| Response headers | `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: strict-origin-when-cross-origin` |

### Not covered by these checks

- **Independent security audit**: none is recorded in this repository. `docs/SECURITY_REVIEW.md` is an automated review, not an audit. The contract has no owner, no admin, no fees, no upgrade path, and holds no funds, which limits what a flaw could do to the amount in a single in-flight payment.
- **Source-verification badge**: stated by the owner, not independently re-checked (see above).
- **Which front end sent each payment**: see above.

## Arc Testnet (chain ID 5042002): development and evidence

| Item | Value |
|------|-------|
| Grant contract | `0xd7f9c3823e81fe27300693c060a6418ad3eed806` ([explorer](https://explorer.testnet.arc.io/address/0xd7f9c3823e81fe27300693c060a6418ad3eed806)) |
| Deploy transaction and block | `0x7bf806f4ab7864f97b0a643b0f8f1a90b73ae8cf7d680da2249673f993c028cc`, block 69502501 |
| How | Deployed from Arc Studio's testnet deploy tool, from the platform's shared testnet deployer |
| Verification copy | `0x9299b7b9091e41C9F52666Bc3d979c48eD5d7bc8`, tx `0x5f852c4109e298d4640f3aa3ba27e0117c0c6342f8c2ca365d35b03c18454ce3`, block 69704858 |
| How | Arc Foundry (`arc-forge script`) with an encrypted keystore, dry run first, source verified on the testnet explorer. Rehearsal of the Foundry route; its runtime code is identical to the grant contract and `bun run e2e:testnet` passed 31 of 31 against it |

Testnet details and results: `docs/TEST_EVIDENCE.md`, `docs/e2e-testnet-report.json`.

## Environment values for the front end

The app reads three public values from the build environment (Vercel project settings, not the repository):

| Variable | Mainnet production |
|----------|--------------------|
| `VITE_SPLITPAY_CHAIN_ID` | `5042` |
| `VITE_SPLITPAY_ADDRESS` | `0x5E02A090D6fbEADeF2cAb310Da64C222677A809a` |
| `VITE_SPLITPAY_DEPLOY_BLOCK` | `28666906` |

The Arc Studio preview and the local `.env` stay on testnet and are unchanged.
