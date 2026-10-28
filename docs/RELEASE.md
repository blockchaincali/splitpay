# SplitPay v1.0.0 (Arc Microgrants MVP): frozen release

This is the stable, submission-ready release. It is tagged `v1.0.0` in git and must not change. All new work happens on the `consumer-v2` branch.

## What is frozen

| Item | Value |
|------|-------|
| Contract | `SplitPayGroups` on Arc Testnet (5042002): `0xd7f9c3823e81fe27300693c060a6418ad3eed806` |
| Deploy transaction | `0x7bf806f4ab7864f97b0a643b0f8f1a90b73ae8cf7d680da2249673f993c028cc`, block 69502501 |
| Source SHA-256 | `b904dc88280a74a9e615d63bd14bd1f58f1bb7cc808b0db598ee81a03f5f42bc` (`contracts/SplitPayGroups.sol`) |
| Solidity / EVM | 0.8.28 / cancun, optimizer 200 runs |
| Contract tests | 70 passing |
| Library tests | 10 passing |
| Live testnet check | 31 of 31 (`docs/e2e-testnet-report.json`) |

Rules for this release:
- The contract is never edited or redeployed here. A contract change means a new version and a new review.
- No mainnet deployment without explicit approval and independent review (`docs/MAINNET_CHECKLIST.md`).

## Verify the release yourself

```bash
git checkout v1.0.0
sha256sum contracts/SplitPayGroups.sol     # must equal the value above
bun install
bun run check && bun run build
bun run contracts:test                      # 70 passing
bun run test:lib                            # 10 passing
```

## Run it

```bash
cp .env.example .env
bun run dev
```

## Publish it

The v1 app is a static site (no server). Use a host that rewrites unknown paths to `index.html`, because group pages live at `/g/<id>`:

- Netlify: `public/_redirects` is included. Build command `bun run build`, publish directory `dist`.
- Vercel: `vercel.json` is included.
- Hugging Face static Spaces have no path fallback, so reloading a group link would fail there. Use Netlify or Vercel.

Set `VITE_SPLITPAY_ADDRESS` and `VITE_SPLITPAY_DEPLOY_BLOCK` from `.env.example` in the host's environment settings (public values only).

## Push to GitHub

```bash
git remote add origin git@github.com:<you>/splitpay.git
git push -u origin main --tags
```

`.gitignore` already excludes `.env`, keys, build output and local databases. Check `git status` shows no secrets before pushing.

## v1.0.1 (documents and hosting configuration only)

`v1.0.1` is `v1.0.0` plus: `vercel.json` (framework, rewrite, security headers, public contract address and deploy block), and documents (`docs/`, `README.md`). Verify that no code changed:

```bash
git diff v1.0.0 v1.0.1 --stat -- . ':!docs' ':!README.md' ':!vercel.json'    # prints nothing
git diff v1.0.0 v1.0.1 -- contracts/SplitPayGroups.sol contracts/test        # prints nothing
```

`v1.0.0` itself is never moved or edited.
