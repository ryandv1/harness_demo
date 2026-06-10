# File Map

> **Last updated:** 2026-06-10 (Phase 2) · maintained by Claude. **Update this whenever files are added,
> moved, or meaningfully change responsibility.** This is the fast-context index for future sessions.

**Current state:** Phase 2 complete and verified (experimentation: seeded traffic simulator +
pre-baked fixtures + live thumbs feedback blended into an in-app results dashboard with honest
two-proportion stats). Runs in mock mode with no keys. Phase 3 (governance) not yet started.

---

## Exists today

```
demo project/
├── .git/                       # local repo, main branch (no remote yet — D-009)
├── .gitignore                  # secrets-safe (.env*, *.key, node_modules/, .next/, data/*.sqlite)
├── .env.example                # ANTHROPIC_API_KEY, FME_SDK_KEY — all optional (mock mode runs without them)
├── package.json                # next 14.2.35, react 18, better-sqlite3, @anthropic-ai/sdk
├── next.config.mjs             # marks better-sqlite3 as a server external package
├── tsconfig.json               # paths: "@/*" → repo root
├── .claude/
│   └── launch.json             # preview/dev server config (npm run dev on :3000)
├── app/                        # Next.js App Router
│   ├── layout.tsx              # root layout, imports globals.css
│   ├── globals.css             # dark theme (tokens mirror the PG decks: navy/blue)
│   ├── page.tsx                # "use client" dashboard; fetches users + active user's data
│   ├── components/
│   │   ├── AccountOverview.tsx # total balance + per-account balances (F1)
│   │   ├── TransactionList.tsx # color-coded recent transactions (F1)
│   │   ├── UserSwitcher.tsx    # free vs premium switch (demo targeting groundwork) — F4
│   │   ├── AssistantPanel.tsx  # AI chat UI; kill-switch banner; 👍/👎 feedback per reply — F2/F3/F6
│   │   ├── DemoPanel.tsx       # mode pill + per-flag treatments, describe, eval latency (µs) — F5
│   │   └── ExperimentResults.tsx # in-app A/B dashboard: rate/latency/cost, lift, p-value — F6, D-008
│   └── api/
│       ├── users/route.ts          # GET list of users
│       ├── users/[id]/route.ts     # GET one user's accounts + transactions
│       ├── assistant/route.ts      # POST { userId, message }; evals flags; returns treatment+latency+cost — F2/F3
│       ├── flags/
│       │   ├── route.ts            # GET ?userId → { mode, evaluations[] } — F5
│       │   └── override/route.ts   # POST { flag, treatment }; mock-only (409 in fme mode) — F5
│       ├── feedback/route.ts       # POST { userId, treatment, rating } → records live metric — F6
│       └── experiment/route.ts     # GET → fixtures blended with live feedback — D-008
├── lib/
│   ├── types.ts                # shared User/Account/Transaction/UserData types
│   ├── format.ts               # formatUSD(cents)
│   ├── db.ts                   # better-sqlite3 singleton, schema, self-seed; feedback table + queries
│   ├── ai/
│   │   └── claude.ts           # Anthropic call (model by treatment) + deterministic no-key fallback — D-007, N4
│   ├── flags/                  # mock-first flag layer — N1, D-004
│   │   ├── types.ts            # FlagMode, FlagEvaluation, FlagClient (sync getTreatment)
│   │   ├── flags.ts            # FLAGS, FLAG_DEFS, MODEL_BY_TREATMENT — client-safe (no server imports)
│   │   ├── mockClient.ts       # MockFlagClient + override store on globalThis — N1
│   │   ├── fmeClient.ts        # FmeFlagClient wrapping splitio SplitFactory (live mode)
│   │   └── index.ts            # getFlagMode/getFlagClient factory + evaluateFlag (latency timing)
│   ├── experiment/             # experimentation engine — D-008
│   │   ├── types.ts            # ExperimentConfig/Result, TreatmentResult, Comparison
│   │   ├── stats.ts            # normal CDF/quantile, sample-size, two-proportion z-test (honest stats)
│   │   └── config.ts           # AI_MODEL_EXPERIMENT — Haiku vs Sonnet + ground-truth sim params
│   └── sim/                    # traffic simulator + fixtures — D-008 (Path A)
│       ├── rng.ts              # seeded PRNG (mulberry32) + stable 50/50 key-hash bucketing
│       ├── simulate.ts         # synthetic users → Bernoulli draws → aggregated ExperimentResult
│       └── fixtures.json       # committed pre-baked result (audible-ready; regen via npm run gen:fixtures)
├── scripts/
│   └── generate-fixtures.ts    # runs the seeded simulator, writes lib/sim/fixtures.json (tsx, dev-only)
└── data/
    └── demo.sqlite             # generated on first run; gitignored (incl. feedback rows)
```

## Planned (later phases) — not yet created

```
lib/governance/ or app/api/rollout/  # progressive rollout 1%→50%→100% + policy guardrails (Phase 3)
README.md                            # quickstart: clone → install → run (write before first share)
```

> When in doubt, trust the actual tree over this file, then update this file.

## Key entry points
- **Run:** `npm run dev` → http://localhost:3000 (or the preview tool with config `northwind-dev`).
- **Data/seed:** `lib/db.ts` — schema + seed (two users: `jordan` free, `riley` premium). DB
  self-seeds on first use; delete `data/demo.sqlite*` to reseed.
- **AI behavior + fallback:** `lib/ai/claude.ts` (+ `app/api/assistant/route.ts`).
- **Flag wiring:** `lib/flags/index.ts` is the entry point (factory + evaluateFlag). Start there for
  mock-vs-live. Flag names/defs live in `lib/flags/flags.ts`; mock rules + override store in
  `mockClient.ts`. Mock mode runs with no key; set `FME_SDK_KEY` to switch to `fmeClient.ts`.
- **Experiment:** `lib/experiment/config.ts` defines the A/B (Haiku vs Sonnet) + ground truth;
  `lib/sim/simulate.ts` produces results; `lib/sim/fixtures.json` is the committed pre-baked result;
  `app/api/experiment` blends fixtures with live `feedback` rows; `ExperimentResults.tsx` renders it.
  Regenerate fixtures with `npm run gen:fixtures`.
