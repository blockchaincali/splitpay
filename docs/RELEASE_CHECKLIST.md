# Release checklist

Prepared 28 October 2026. Legend: **Done** = finished and verified here. **You** = needs your direct action or decision. **Blocked** = cannot proceed until a **You** item is done.

## What needs you directly

| # | Action | Why only you | Needed for |
|---|--------|--------------|------------|
| 1 | Create the public GitHub repository and push (or connect GitHub so I can push for you) | Your account and your choice of owner/name | Public repo requirement |
| 2 | Choose and add a licence | Your ownership decision. I will not pick one | Public repo |
| 3 | Connect Vercel and deploy the release | Your Vercel account | Live app link |
| 4 | Paste your Arc Studio project URL into `README.md` | Only visible in your browser | Submission field |
| 5 | Decide the audit question (audit, or a written small-value-pilot decision) | Your risk and money | Mainnet |
| 6 | Deploy to Arc mainnet from your own wallet and keep the hashes | Real funds, irreversible; Arc Studio never does this | Mainnet requirement |
| 7 | Run the small real-USDC test with two wallets you control | Real funds | The example transaction hash |
| 8 | Record the video on the mainnet app | Needs your screen and wallets | Video field |
| 9 | Fill your builder profile and applicant details | Personal details | Form |
| 10 | Re-read the round's rules on the official page and submit | Only you can submit | Submission |
| 11 | For Circle Developer Grants: complete the applicant, team, amount and traction sections and apply through Circle's portal | Personal and commercial details | Second application |
| 12 | If you later pursue them: create Circle Console, Yellow Card sandbox, mail provider and Google OAuth accounts and put the keys in server environment variables yourself | Your accounts. Never paste keys into chat | v2 integrations |

## A. Repository and GitHub

| Step | State |
|------|-------|
| `v1.0.0` tag exists and is untouched | Done (`git rev-parse v1.0.0^{commit}` = `5181d67`) |
| `v1.0.1` = v1.0.0 plus hosting config and documents only | Done (verify: `git diff v1.0.0 v1.0.1 --stat` shows only `docs/`, `README.md`, `vercel.json`) |
| `consumer-v2` separate branch, never merged into `main` | Done |
| Contract and tests identical across all refs | Done (`git diff v1.0.0 consumer-v2 -- contracts/SplitPayGroups.sol contracts/test` is empty) |
| No secrets in any commit | Done: no tracked `.env`, keys, keystores or databases; history scan found no key material; `.gitignore` covers `.env*`, `server/data`, `.circle`, keystores |
| `.env.example` lists variable names only | Done |
| Build history documented | Done (`docs/BUILD_HISTORY.md`, `arc-studio-plans/PLAN.md`, `AGENTS.md`) |
| Create repo and push all branches and tags | **You** |
| Add a licence | **You** |
| Set the repo description and topics (arc, usdc, circle, payments) | **You** (optional) |

Push (replace the placeholder with your repository):

```bash
git remote add origin https://github.com/<your-account>/<repo>.git
git push -u origin main            # v1.0.1 release line
git push origin consumer-v2        # separate v2 work
git push origin --tags             # v1.0.0 and v1.0.1
```

Pushing tags and both branches preserves the history that exists. Alternatively say "connect to my github using the github-cli skill" in Arc Studio and I will guide you through signing in and push for you.

Before making the repository public, run a last scan on the machine you push from:

```bash
git log --all -p | grep -Ei "private[_ ]?key|secret|api[_-]?key|BEGIN .*PRIVATE" | head
git ls-files | grep -Ei "(^|/)\.env|keystore|recovery"
```

Expect only code references and `.env.example`.

## B. Vercel (v1 only)

Deploy `main` (the `v1.0.1` line). **Do not deploy `consumer-v2` to Vercel**: it needs a server and a database, which a static host does not provide.

| Step | State |
|------|-------|
| `vercel.json`: Vite framework, `dist` output, deep-link rewrite, security headers | Done |
| Public contract address and deploy block set in `vercel.json` `build.env` (no secrets) | Done (testnet values) |
| Production build from a clean checkout with only those variables | Done: succeeds; bundle contains the contract address |
| Deep link `/g/<id>` returns the app on reload | Done (verified on a local production preview) |
| Browser run against the release build: create, share, guest pay, receipt, dashboard, 12 viewport checks (360, 390, 768, 1280 wide; no horizontal scroll) | Done |
| Connect Vercel, import the repo, deploy | **You** |
| Repeat the browser smoke test on the live URL (below) | **You** (I can run it if you give me the URL) |

Smoke test on the live URL, from a phone:

1. Open the home page; it should show "Split shared costs".
2. Create a group on testnet with a small goal; the share link must start with your Vercel URL.
3. Open the link in a private tab; it must say "Details verified".
4. Pay from a second wallet as a guest with no sign-in; the receipt must appear after confirmation.
5. Reload the group page; it must still load.

For mainnet, `vercel.json` must be changed in a **new** branch (see the submission document, step 7). `v1.0.0` stays as it is.

## C. Arc Microgrants submission

| Item | State |
|------|-------|
| Package and requirements matrix | Done: `docs/submission/ARC_MICROGRANTS_SUBMISSION.md` |
| Draft description, video script, evidence index | Done |
| Eligibility: round requires mainnet and real USDC moved | **Blocked on you** (items 5 to 7) |
| Mainnet build configuration checked locally | Done: a build with `VITE_SPLITPAY_CHAIN_ID=5042` and a placeholder address shows the real-USDC banner and no testnet wording (placeholder only; nothing deployed) |
| Arc Studio URL, live app URL, mainnet address, example tx hash, repo URL, video URL, profile | **You** |

## D. Circle Developer Grants

| Item | State |
|------|-------|
| Application pack with status labels | Done: `docs/GRANT_APPLICATION.md` |
| Production architecture (wallets, email, histories, fiat, webhooks, reconciliation, compliance) | Done: `docs/PRODUCTION_ARCHITECTURE.md` |
| Integration research | Done: `docs/INTEGRATIONS_RESEARCH.md` |
| Applicant, team, amount requested, traction | **You** |
| Quotes for hosting, RPC, mail, audit, legal | **You** (needed to finish the cost table) |

## E. Mainnet requirements still open

1. Mainnet deployment from your wallet and verified source on the explorer.
2. Audit decision recorded.
3. Supervised real-USDC test with two wallets you control and saved transaction hashes.
4. Public app pointing at the mainnet configuration.
5. Your confirmation of chain ID, RPC, explorer and USDC address from Arc's official documentation.

## F. Do not

- Do not edit `v1.0.0`, the contract or its tests.
- Do not deploy `consumer-v2` to a static host or call its sandbox features live.
- Do not paste private keys, API keys or recovery files into chat or the repository.
- Do not describe the NGN flow, the testnet wallet or the dev email outbox as production features.
- Do not send real money to any address from these documents without checking it yourself first.

## G. Final verification before you submit

```bash
git checkout v1.0.1
sha256sum contracts/SplitPayGroups.sol    # b904dc88...f42bc
bun install && bun run check && bun run build
bun run contracts:test                     # 70 passing
bun run test:lib                           # 10 passing
```

On `consumer-v2` additionally: `bun run test:server` (38 passing).
