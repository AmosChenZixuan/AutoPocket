# CLAUDE.md

Working agreement for coding agents in this repo. Assume you have no prior conversation context; everything you need is in this repository.

## What this is

autopocket: a self-hosted personal finance autopilot. Open-source tools sync accounts and transactions; a custom planning service turns balances into a month-by-month "waterfall" plan (debt → emergency buckets → retirement → investing) and pushes actionable notifications. Personal use or open source; no commercial goals.

Current state: **prototype only.** `prototype/index.html` is a single-file web page that runs offline; `prototype/engine.js` is its pure simulation engine; `tests/` locks the engine's behavior. Nothing is deployed yet.

## Read first, in order

1. `docs/prd.md` — goals, requirements, architecture, roadmap, open questions (Chinese)
2. `docs/prototype-spec.md` — exact engine rules, data schema, test vectors, UI spec (Chinese)
3. `prototype/engine.js` and `tests/engine.test.js`

## Hard rules

- **Never commit real personal financial data.** The repo only contains the fictional example user (`config/example-settings.json`). Real settings live in `config/settings.json`, which is git-ignored. Before every commit, check the diff for names, employers, account numbers and real balances.
- **Never move money.** No code path may initiate transfers, trades or payments. The system recommends; the user acts (or configures recurring transfers at the bank).
- **No plaintext credentials** in code, config or logs. Services are reachable only over a private network.
- **Engine changes must keep `npm test` green.** If a rule change is intentional, update `docs/prototype-spec.md` and the test vectors in the same commit, and say why in the commit message.

## Commands

```sh
npm test                      # node --test; engine behavior lock (Node 18+)
open prototype/index.html     # run the prototype (example user; edits saved to browser storage)
```

## Conventions

- Docs are in Chinese; code, identifiers, commit messages and this file are in English.
- Money in USD as plain numbers; months as `YYYY-MM`; dates as `YYYY-MM-DD` (no time zones in domain logic).
- The engine stays pure: no I/O, no clock, no randomness. Inputs are config + starting balances.
- Mark any number that is not synced data as an estimate, with its source and as-of date.

## Before starting new work

`docs/prd.md` §9 lists open decisions (engine language, ledger tool, default data source, hosting, license). Confirm them with the user before building on them. The recommended defaults are TypeScript, Actual Budget, SimpleFIN, and a private-network deployment.
