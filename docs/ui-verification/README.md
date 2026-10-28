# Browser verification scripts

The files end in `.txt` so they are not linted or type-checked with the app. Rename each to `.ts` and keep them together in one folder inside the project to run them.

These drive the real app in headless Chromium against Arc Testnet, using a stand-in wallet that signs with throwaway test keys. They are evidence tooling, not part of the product.

Requirements: `playwright-core` and a Chromium build, test keys in `/tmp/e2e/keys.json` (`organiser`, `payer`, `recipient`, funded with test USDC), the dev server on 5173 and the API on 3001.

- `wallet.ts` stand-in EIP-1193 wallet (testnet keys only)
- `stage1-create-wallet.ts` creates the SplitPay testnet wallet through the UI and saves browser state
- `stage2-full-journey.ts` sign-in, create, invite, join, link, NGN sandbox, USDC payment, reminders, second device
- `v1-journey.ts` the original v1 journey (create, share, pay, dashboard)

Never put real funds or real keys in these scripts.
