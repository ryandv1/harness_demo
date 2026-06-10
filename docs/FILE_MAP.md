# File Map

> **Last updated:** 2026-06-10 · maintained by Claude. **Update this whenever files are added,
> moved, or meaningfully change responsibility.** This is the fast-context index for future sessions.

**Current state:** Phase 0 complete and verified (runs in mock mode with no keys). Phase 1 (FME
flags) not yet started.

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
│   │   └── AssistantPanel.tsx  # AI chat UI; shows source label (Claude vs computed) — F2
│   └── api/
│       ├── users/route.ts          # GET list of users
│       ├── users/[id]/route.ts     # GET one user's accounts + transactions
│       └── assistant/route.ts      # POST { userId, message } → assistant reply — F2
├── lib/
│   ├── types.ts                # shared User/Account/Transaction/UserData types
│   ├── format.ts               # formatUSD(cents)
│   ├── db.ts                   # better-sqlite3 singleton, schema, self-seed, queries
│   └── ai/
│       └── claude.ts           # Anthropic call + deterministic no-key fallback — D-007, N4
└── data/
    └── demo.sqlite             # generated on first run; gitignored
```

## Planned (later phases) — not yet created

```
lib/flags/
├── FlagClient.ts               # interface (bool/string/treatment variations) — D-004 (Phase 1)
├── mockClient.ts               # mock implementation, no FME needed — N1 (Phase 1)
└── fmeClient.ts                # real FME server-side SDK implementation (Phase 1)
app/components/
├── DemoPanel.tsx               # active treatments + flag-eval latency — F5 (Phase 1)
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
- **Flag wiring:** `lib/flags/` — *not built yet*; arrives in Phase 1 (start here for mock-vs-live).
