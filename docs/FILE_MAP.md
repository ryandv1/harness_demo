# File Map

> **Last updated:** 2026-06-10 (Phase 1) · maintained by Claude. **Update this whenever files are added,
> moved, or meaningfully change responsibility.** This is the fast-context index for future sessions.

**Current state:** Phase 1 complete and verified (kill switch + tier targeting, mock-first; runs in
mock mode with no keys, goes live with `FME_SDK_KEY`). Phase 2 (experimentation) not yet started.

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
│   │   ├── AssistantPanel.tsx  # AI chat UI; `enabled` prop → kill-switch banner; source label — F2/F3
│   │   └── DemoPanel.tsx       # mode pill + per-flag treatments, describe, eval latency (µs) — F5
│   └── api/
│       ├── users/route.ts          # GET list of users
│       ├── users/[id]/route.ts     # GET one user's accounts + transactions
│       ├── assistant/route.ts      # POST { userId, message }; evaluates AI_ASSISTANT_ENABLED + AI_MODEL — F2/F3
│       └── flags/
│           ├── route.ts            # GET ?userId → { mode, evaluations[] } — F5
│           └── override/route.ts   # POST { flag, treatment }; mock-only (409 in fme mode) — F5
├── lib/
│   ├── types.ts                # shared User/Account/Transaction/UserData types
│   ├── format.ts               # formatUSD(cents)
│   ├── db.ts                   # better-sqlite3 singleton, schema, self-seed, queries
│   ├── ai/
│   │   └── claude.ts           # Anthropic call (model by treatment) + deterministic no-key fallback — D-007, N4
│   └── flags/                  # mock-first flag layer — N1, D-004
│       ├── types.ts            # FlagMode, FlagEvaluation, FlagClient (sync getTreatment)
│       ├── flags.ts            # FLAGS, FLAG_DEFS, MODEL_BY_TREATMENT — client-safe (no server imports)
│       ├── mockClient.ts       # MockFlagClient + override store on globalThis — N1
│       ├── fmeClient.ts        # FmeFlagClient wrapping splitio SplitFactory (live mode)
│       └── index.ts            # getFlagMode/getFlagClient factory + evaluateFlag (latency timing)
└── data/
    └── demo.sqlite             # generated on first run; gitignored
```

## Planned (later phases) — not yet created

```
app/components/
└── ExperimentResults.tsx       # in-app results view from fixtures (audible-ready) — D-008 (Phase 2)
app/api/feedback/route.ts       # thumbs up/down + metric capture — F6 (Phase 2)
lib/sim/
├── simulate.ts                 # synthetic users → impressions + track() events; significance-sized (Phase 2)
└── fixtures.json               # pre-baked experiment results (Phase 2)
README.md                       # quickstart: clone → install → run (write before first share)
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
