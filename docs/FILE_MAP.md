# File Map

> **Last updated:** 2026-09-01 (Phase 4 — Mortgage Refinance Servicing — reconciled to docs; D-019)
> · maintained by Claude. **Update this whenever files are added, moved, or meaningfully change
> responsibility.** This is the fast-context index for future sessions.

**Current state:** Phases 1–2 complete and verified; Phase 4 (second feature) complete; Phase 3
(governance) mostly complete. **Two features now live against real FME** (not just mock) in both
Staging and Production via the Harness MCP server:
- **AI financial assistant** (squad-ai): `ops_assistant_killSwitch_web`,
  `exp_assistant_modelChoice_web` (Dynamic Configuration — model, temperature, maxTokens,
  system-prompt variant, context size — read via `getTreatmentWithConfig`, applied with no
  redeploy, shown live in the DemoPanel — D-013), and the name/tags-only exemplar
  `rel_assistant_spendingInsights_web`.
- **Mortgage refinance servicing** (squad-payments, D-019): `rel_mortgage_refinanceBanner_web`
  (release flag, Dynamic Config drives banner copy + fee formula) and
  `exp_mortgage_applicationFlow_web` (experiment: singleScreen vs. twoPage application flow,
  deterministic riley/jordan targeting).

The app still runs fully in **mock mode** with no keys (blank `FME_SDK_KEY` → mock); adding a
server-side key flips it to live (D-012), for both features identically.
Experimentation (Phase 2 + Phase 4): the AI model experiment has an in-app results dashboard
(seeded traffic simulator + pre-baked fixtures + live thumbs feedback, honest two-proportion
stats) **and** a real hydrated FME experiment (D-016 Path B); the mortgage application-flow
experiment is hydrated the same way (D-016 pattern generalized, D-019) but has **no in-app
dashboard** — FME console only. Phase 3 (governance): OPA/Rego policies (`policies/`) authored
and reconciled to the real FME schema (D-014), a reusable rollout pipeline + experiment guardrail
created live in Harness (D-017); the read-only governance mirror panel is not yet built.

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
│   ├── globals.css             # dark theme (tokens mirror the PG decks: navy/blue); incl. .mortgage-* rules
│   ├── page.tsx                # "use client" dashboard; fetches users + active user's data; renders <MortgageBanner> — D-019
│   ├── mortgage/
│   │   └── apply/
│   │       ├── page.tsx                # thin async server wrapper (Next async searchParams); renders MortgageApplyClient — D-019
│   │       └── MortgageApplyClient.tsx # full application flow UI: singleScreen vs. twoPage branch on exp_mortgage_applicationFlow_web, live fee preview, submit, confirmation screen — D-019
│   ├── components/
│   │   ├── AccountOverview.tsx # total balance + per-account balances (F1)
│   │   ├── TransactionList.tsx # color-coded recent transactions (F1)
│   │   ├── UserSwitcher.tsx    # free vs premium switch (demo targeting groundwork) — F4
│   │   ├── AssistantPanel.tsx  # AI chat UI; kill-switch banner; 👍/👎 feedback per reply — F2/F3/F6
│   │   ├── DemoPanel.tsx       # mode pill + per-flag treatments, describe, eval latency (µs); renders live Dynamic Config payload for ANY FLAG_DEFS entry (generic — covers both features with no extra wiring) — F5, D-013, D-019
│   │   ├── MortgageBanner.tsx  # dashboard promo banner gated by rel_mortgage_refinanceBanner_web; hidden unless "on" + config.headline non-empty; links to /mortgage/apply — D-019
│   │   └── ExperimentResults.tsx # in-app A/B dashboard: rate/latency/cost, lift, p-value (AI model experiment only — mortgage experiment has no in-app dashboard) — F6, D-008
│   └── api/
│       ├── users/route.ts          # GET list of users
│       ├── users/[id]/route.ts     # GET one user's accounts + transactions
│       ├── assistant/route.ts      # POST { userId, message }; getTreatmentWithConfig → resolveModelConfig → Claude; returns treatment+config+latency+cost — F2/F3, D-013
│       ├── mortgage/
│       │   └── apply/route.ts      # POST { userId, treatment, pricingOption, refinanceAmountCents }; re-evaluates the banner flag + re-derives the fee server-side (never trusts the client), persists via recordMortgageApplication, fires both FME events — D-019
│       ├── flags/
│       │   ├── route.ts            # GET ?userId → { mode, evaluations[] } (uses evaluateAllFlags, generic over FLAG_DEFS) — F5
│       │   ├── stream/route.ts     # SSE: pushes evaluations on connect + on every onUpdate() fire; 25s ping heartbeat — F5, D-018
│       │   └── override/route.ts   # POST { flag, treatment }; mock-only (409 in fme mode) — F5
│       ├── feedback/route.ts       # POST { userId, treatment, rating } → records live metric — F6
│       └── experiment/route.ts     # GET → fixtures blended with live feedback (AI model experiment) — D-008
├── lib/
│   ├── types.ts                # shared User/Account/Transaction/UserData types + Mortgage/PricingOption/MortgageApplicationInput/MortgageApplication — D-019
│   ├── format.ts               # formatUSD(cents)
│   ├── db.ts                   # better-sqlite3 singleton, schema, self-seed; feedback table + queries; mortgages/mortgage_applications tables + recordMortgageApplication/getMortgage/getMortgageApplications — D-019
│   ├── ai/
│   │   └── claude.ts           # Anthropic call driven by ModelConfig (model/temp/maxTokens/system variant/context size) + no-key fallback — D-007, D-013, N4
│   ├── flags/                  # mock-first flag layer — N1, D-004
│   │   ├── types.ts            # FlagMode, FlagEvaluation(+config), FlagClient (getTreatment + getTreatmentWithConfig + onUpdate), TreatmentWithConfig — D-013, D-018
│   │   ├── flags.ts            # FLAGS, FLAG_DEFS (now 4 entries: kill switch, AI model, mortgage banner, mortgage flow), ModelConfig + MODEL_CONFIG_BY_TREATMENT + resolveModelConfig, MortgageBannerConfig + MORTGAGE_BANNER_CONFIG_BY_TREATMENT + resolveMortgageBannerConfig — client-safe — D-013, D-019
│   │   ├── mockClient.ts       # MockFlagClient + override store on globalThis; getTreatmentWithConfig parity for both Dynamic Configs; mortgage flow uses deterministic riley→singleScreen/jordan→twoPage individual-key targeting (mirrors tier targeting); onUpdate via a globalThis-cached listener Set notified by setOverride() — N1, D-013, D-018, D-019
│   │   ├── fmeClient.ts        # FmeFlagClient wrapping splitio SplitFactory; getTreatmentWithConfig (live Dynamic Config, any flag); onUpdate wraps the SDK's SDK_UPDATE event — D-013, D-018
│   │   └── index.ts            # getFlagMode/getFlagClient factory + evaluateFlag (latency timing, returns config) + evaluateAllFlags (generic over FLAG_DEFS; shared by /api/flags and /api/flags/stream, so new flags need no extra wiring) — D-018
│   ├── mortgage/                # mortgage refinance servicing — D-019
│   │   ├── fees.ts             # computeEstimatedFeeCents(pricingOption, refinanceAmountCents, config) — base fee + points% (lowRatePointsUpfront) or flat fee (zeroUpfrontHigherRate); fed by the banner's Dynamic Config; also zeroUpfrontQuotedRateBps() for display
│   │   ├── events.ts           # MORTGAGE_EVENT_IDS (mortgage_application_submitted, mortgage_estimated_fee_cents) + MORTGAGE_TRAFFIC_TYPE="user" — single source of truth shared by the apply route, seed script, and hydrator
│   │   └── experiment.ts       # ground truth for the flow experiment simulator/hydrator: MORTGAGE_FLOW_EXPERIMENT (singleScreen 36% submit/40% lowRatePoints vs. twoPage 30%/65%) + sampleMortgageSubmission() (computes the real fee via fees.ts)
│   ├── experiment/             # experimentation engine — D-008
│   │   ├── types.ts            # ExperimentConfig/Result, TreatmentResult, Comparison
│   │   ├── stats.ts            # normal CDF/quantile, sample-size, two-proportion z-test (honest stats)
│   │   ├── config.ts           # AI_MODEL_EXPERIMENT — Haiku vs Sonnet + ground-truth sim params
│   │   └── events.ts           # EXPERIMENT_EVENT_IDS (assistant_thumbs_up, assistant_response_latency_ms, assistant_response_cost_cents) + TRAFFIC_TYPE="user" — D-016
│   └── sim/                    # traffic simulator + fixtures — D-008 (Path A, AI model experiment only)
│       ├── rng.ts              # seeded PRNG (mulberry32) + stable 50/50 key-hash bucketing
│       ├── simulate.ts         # synthetic users → Bernoulli draws → aggregated ExperimentResult
│       └── fixtures.json       # committed pre-baked result (audible-ready; regen via npm run gen:fixtures)
├── scripts/
│   ├── generate-fixtures.ts    # runs the seeded simulator, writes lib/sim/fixtures.json (tsx, dev-only) — D-008
│   ├── seed-event-types.ts     # one bulk POST to the FME events ingestion API firing one event of every type (assistant + mortgage) so they appear in the metric-definition dropdown — npm run seed-events:staging|prod — D-016, D-019
│   └── experiment-hydrator.ts  # pushes real impressions + events into FME so results render in FME's Experimentation view; --experiment {assistant|mortgage} (default assistant); npm run hydrate:staging|prod — D-016 (Path B), generalized D-019
├── policies/                   # Phase 3 governance: OPA/Rego authored in the FME org — D-010/D-011
│   ├── README.md               # usage: Warn→Error, verify payloads, v1 embedded constants, demo mapping (now 5 compliant exemplars across both squads — D-019)
│   ├── RELEASE_AGENT_PROMPTS.md # copy-paste prompts (1 per policy) for the Harness AI release agent
│   ├── 01_require_category_tag.rego             # exactly one category-* tag (Tier 1)
│   ├── 02_require_squad_tag.rego                # squad-<name> from approved list, incl. squad-payments (Tier 1)
│   ├── 03_require_jira_reference.rego           # Jira ref PREFIX-123 in description, incl. SCRUM (Tier 1)
│   ├── 04_require_team_ownership.rego           # team owner; PM team for rel/exp (Tier 1)
│   ├── 05_require_experiment_hypothesis_metrics.rego # hypothesis on experiments (Tier 1; metric check dropped — payload gap G1, D-014)
│   └── 06_default_off_in_production.rego        # default-off, ops_ exempt (Tier 2; FF-Definition entity — D-014); mortgage banner exempt the same way (no meaningful "off" state) — D-019
├── docs/                        # maintainer docs (this file's own directory)
│   ├── PROJECT.md               # vision, audience, both features' requirements — §4
│   ├── ROADMAP.md               # phased plan; Phase 4 = mortgage refinance servicing
│   ├── DECISIONS.md             # ADR log, D-001..D-019
│   ├── FILE_MAP.md              # this file
│   ├── DEMO_GOVERNANCE.md       # Phase 3 governance demo script
│   └── EXPERIMENT_HYDRATOR.md   # runbook for both hydrated experiments (assistant + mortgage) — D-016, D-019
└── data/
    └── demo.sqlite             # generated on first run; gitignored (incl. feedback + mortgage_applications rows)
```

> **policies/ are repo artifacts, not app code.** They run in the FME console at flag
> save-time (create/update), never in the Next.js app or the SDK. Approved values are
> embedded as Rego constants (v1). `opa` isn't installed here, so they're not machine-checked.
> Field paths reconciled to the real FME policy input schema 2026-06-15 (D-014); known
> payload gaps are tracked in `policies/README.md` → "Gaps raised to product".

## Planned (later phases) — not yet created

```
lib/governance/ or app/api/rollout/  # progressive rollout 1%→50%→100% + read-only governance mirror (Phase 3)
README.md                            # quickstart: clone → install → run (write before first share)
```

> When in doubt, trust the actual tree over this file, then update this file.

## Key entry points
- **Run:** `npm run dev` → http://localhost:3000 (or the preview tool with config `northwind-dev`).
- **Data/seed:** `lib/db.ts` — schema + seed (two users: `jordan` free, `riley` premium). DB
  self-seeds on first use; delete `data/demo.sqlite*` to reseed.
- **AI behavior + fallback:** `lib/ai/claude.ts` (+ `app/api/assistant/route.ts`).
- **Flag wiring:** `lib/flags/index.ts` is the entry point (factory + evaluateFlag/evaluateAllFlags,
  generic over `FLAG_DEFS`). Start there for mock-vs-live. Flag names/defs live in
  `lib/flags/flags.ts`; mock rules + override store in `mockClient.ts`. Mock mode runs with no key;
  set `FME_SDK_KEY` to switch to `fmeClient.ts`. **Both features share this one layer** — adding a
  new flag to `FLAG_DEFS` is enough for `DemoPanel`/`/api/flags`/`/api/flags/stream` to pick it up
  with no extra wiring (see D-019's confirmation of this for the mortgage flags).
- **AI model experiment:** `lib/experiment/config.ts` defines the A/B (Haiku vs Sonnet) + ground
  truth; `lib/sim/simulate.ts` produces results; `lib/sim/fixtures.json` is the committed pre-baked
  result; `app/api/experiment` blends fixtures with live `feedback` rows; `ExperimentResults.tsx`
  renders it. Regenerate fixtures with `npm run gen:fixtures`. Real hydrated FME experiment via
  `scripts/experiment-hydrator.ts` (default mode) — D-016.
- **Mortgage refinance servicing** (D-019): `lib/mortgage/fees.ts` is the fee formula (shared by the
  live app and the simulator); `MortgageBanner.tsx` + `app/mortgage/apply/MortgageApplyClient.tsx`
  are the UI; `app/api/mortgage/apply/route.ts` is the write path. Its experiment has no in-app
  dashboard — ground truth lives in `lib/mortgage/experiment.ts`, hydrated via
  `scripts/experiment-hydrator.ts --experiment mortgage`; results are FME-console-only. Full runbook:
  [EXPERIMENT_HYDRATOR.md](EXPERIMENT_HYDRATOR.md).
