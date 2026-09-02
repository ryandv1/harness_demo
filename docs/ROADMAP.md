# Roadmap

> **Last updated:** 2026-09-01 (Phase 4 — mortgage refinance servicing — reconciled to docs; see D-019) · maintained by Claude across sessions.

Phased so each phase is independently demoable, builds on the last, and advances the three
differentiation pillars (see [PROJECT.md](PROJECT.md) §3). We build and validate one phase before
starting the next.

Legend — Pillars: 🏛️ Architecture · 🧪 Experimentation · 🛡️ Governance

---

## Phase 0 — Foundation (no FME yet) ✅ COMPLETE (2026-06-10)
**Goal:** a running mock banking app + AI assistant, so we have something to wrap flags around.

- Next.js + TypeScript project scaffold; SQLite seeded with mock accounts + transactions.
- Banking UI: account overview, balances, transaction list (F1).
- AI assistant chat panel grounded in the user's transactions (F2), via a server-side Claude call.
- "Switch user" control (free vs premium) (F4); graceful fallback if no Anthropic key (N4).

**Demo moment:** "Here's a banking app with an AI assistant." (Baseline — no FME magic yet.)
**Exit check (QA):** app runs with zero keys; assistant answers from seeded data or canned fallback.

---

## Phase 1 — Control: kill switch + targeting 🏛️ ✅ COMPLETE (2026-06-10)
**Goal:** introduce FME with the most visceral, easy-to-grasp capability, and establish the
mock-first integration architecture.

- Integrated FME server-side SDK (splitio) behind a `FlagClient` interface with a **mock
  implementation** (N1); factory in `lib/flags/index.ts` picks mock vs live by `FME_SDK_KEY`.
- Flags: `ops_assistant_killSwitch_web` (kill switch, F3), `exp_assistant_modelChoice_web` treatment by user tier — premium→sonnet,
  free→haiku (targeting, F4). Model id flows into `askAssistant`. (Flags renamed to the project naming
  convention in Phase 3 prep — see [DECISIONS.md](DECISIONS.md) D-010.)
- **Demo panel** (F5): shows mode (mock/live FME), active treatments, and per-flag eval latency (µs).
  In mock mode, treatment buttons flip flags live via an override store; in live mode they're
  read-only (change in the FME UI).

**Demo moment:** "Watch me turn the AI off for everyone — instantly, no deploy. Now watch premium
users get a smarter model while free users don't. And notice the flag check added microseconds —
that's the local-evaluation architecture."
**Exit check (QA):** ✅ flipping a flag (mock override) changes app behavior with no restart —
verified live in browser (kill switch → assistant banner + disabled input); ✅ targeting differs by
user (riley/premium→sonnet, jordan/free→haiku); ✅ latency reported 1–14 µs; live mode wired (untested
without a key).

---

## Phase 2 — Experimentation + measurement 🧪 ✅ COMPLETE — IN-APP + LIVE FME (2026-06-16)
> **Path A** (in-app fixtures + simulator + live feedback) and **Path B** (a real experiment executed
> through FME) are both **done**. Path B ran live in **Staging and Production** on 2026-06-16: real
> impressions + events hydrated, all three metrics render in FME's Experimentation view (thumbs-up
> significant up; latency + cost significant guardrail regressions). See D-016. ⚠️ Don't Re-calculate
> the aged experiment and don't edit the flag (orphans the metric window).
**Goal:** the headline differentiator — prove impact, not just toggle features. Must be
**audible-ready** (demoable on zero notice). See [DECISIONS.md](DECISIONS.md) D-008.

- A/B test on the `exp_assistant_modelChoice_web` flag: **Haiku (baseline) vs Sonnet (variant)**.
- Metric capture (F6): 👍/👎 on each assistant reply → `/api/feedback` → SQLite, attributed to the
  treatment that produced the answer; latency + estimated token cost recorded too.
- **Traffic simulator** (`lib/sim/`): synthetic users allocated 50/50 by stable key hash (mirrors an
  FME % rollout), **real Bernoulli draws** per arm; honest two-proportion z-test + power-analysis
  sample sizing (`lib/experiment/stats.ts`). Sized above the ~991/arm requirement (6,000 users).
- **Path A — in-app results view (default, always works):** committed **`fixtures.json`** rendered by
  `ExperimentResults.tsx` in milliseconds; no FME/network; live feedback is *blended* on top.
- **Path B — real experiment in FME (credibility upgrade):** the **Experiment Hydrator**
  (`scripts/experiment-hydrator.ts`, `npm run hydrate:staging|prod`) pushes real impressions +
  events into FME so the result renders in FME's **Experimentation / Metrics-impact view**.
  Parameterized + repeatable (staging → prod); non-destructive (drives the 50/50 split via the
  flag's existing `tier=premium→sonnet` rule). Three metrics: thumbs-up rate (primary), latency,
  cost. Full runbook + console metric spec: [EXPERIMENT_HYDRATOR.md](EXPERIMENT_HYDRATOR.md).
  ⚠️ **Never hit Re-calculate** on an aged experiment — FME keeps raw events only 90 days, so
  re-calc after that recomputes against purged data and destroys the result.
  **Status:** ✅ live run complete in Staging + Production (2026-06-16); results render in FME (D-016).

**Demo moment:** "We didn't just ship a new model — we measured it. Sonnet got ~16% more thumbs-up
(p<0.001) but cost 3.3x more per response. *That's* the flags + attribution + experimentation story
in one tool."
**Exit check (QA):** ✅ in-app results render instantly with no FME key (verified); ✅ simulator
crosses significance (+10pt, p<0.001, z=8.25, n=6,000); ✅ live 👍/👎 blends into the dashboard and
updates rates/latency/cost live (verified in browser); ✅ clean `tsc --noEmit`. Path B (live FME)
documented; untested without a key.

---

## Phase 3 — Governed rollout: pipelines + policies 🛡️ 🚧 IN PROGRESS
**Goal:** the governance story and the bridge to other Harness modules.

- **Reusable, flag-agnostic rollout pipeline** (`pipelines/governed-fme-rollout.yml`): flag +
  environment are runtime inputs; standard gates for *any* flag — Guardrail → Approval → progressive
  `FmeFlagDefaultAllocation` ramp **1% → 50% → 100%** with approval gates and an `FmeFlagKill` rollback.
- **Experiment guardrail** (`pipelines/policies/block_experiment_flag_rollout.rego`): OPA Policy step
  hard-blocks `exp_*` flags so a routine rollout can't orphan a live experiment's metric window. This
  is a **Harness pipeline-time** policy — distinct from the **FME save-time** `policies/*.rego` set.
- **(done, Phase 3 prep)** FME save-time governance policies (`policies/*.rego`) + flag naming
  convention (D-010/D-011/D-014).
- **(superseded by Phase 4 / D-019)** App-side runtime payoff — originally planned as
  `rel_assistant_spendingInsights_web` wiring + a deterministic spending-insights UI. Delivered
  instead as the **Mortgage Refinance Servicing** feature (Phase 4 below), which gives the
  governance demo a second squad/flag-category to point at. `rel_assistant_spendingInsights_web`
  remains a name/tags-only compliant exemplar in the policy set.
- **(still open)** Read-only Governance mirror panel (FME Admin API).
- Document how this extends into other Harness modules over time.

**Demo moment:** "This AI capability rolled out behind an approval and an automated guardrail —
governed, auditable, progressive. And the same pipeline can't even touch my experiment flags. It's the
same platform your CI/CD lives in."
**Exit check (QA):** rollout stages behave correctly; pointing the pipeline at an `exp_*` flag is
blocked by the guardrail before any change.

**Status:** ✅ pipeline + guardrail authored in repo **and created live** in Harness via MCP (D-017).
Remaining: read-only Governance mirror panel (FME Admin API) and a live end-to-end pipeline run.
App-side runtime payoff delivered via Phase 4 below instead of spending insights (D-019).

---

## Phase 4 — Second feature: Mortgage Refinance Servicing 🛡️🧪 ✅ COMPLETE (2026-06-16)
**Goal:** give Phase 3's governance story a second squad/flag-category to point at, and prove the
Experiment Hydrator pattern (D-016) generalizes beyond the AI model flag. Supersedes the
originally-planned `rel_assistant_spendingInsights_web` runtime payoff — see
[DECISIONS.md](DECISIONS.md) D-019.

- **Release flag** `rel_mortgage_refinanceBanner_web` (squad-payments, default **on**): a
  dashboard promo banner (`MortgageBanner.tsx`) whose copy, promoted rate, and fee-formula
  parameters are all **Dynamic Configuration** — editable in the FME UI with no redeploy, the
  same "beyond flip a switch" story as D-013 but for a non-AI feature.
- **Experiment flag** `exp_mortgage_applicationFlow_web` (squad-payments): A/B a
  **single-screen** vs. **guided 2-page** application flow (`app/mortgage/apply/
  MortgageApplyClient.tsx`). Riley/Jordan deterministically pinned to opposite variants in mock
  mode (mirrors the AI model flag's tier targeting); live individual-key targeting via
  `{type:"IN_LIST_STRING", strings:[...]}` matchers (no `attribute` field).
- **Real runtime behavior:** `POST /api/mortgage/apply` re-derives the fee **server-side**
  (`lib/mortgage/fees.ts`, fed by the banner's live Dynamic Config — never trusts a
  client-supplied number), persists the application, fires two FME events consumed by the
  experiment's metrics.
- **Second Experiment Hydrator run** (D-016 Path B pattern, generalized): `scripts/experiment-
  hydrator.ts --experiment mortgage` hydrated both Staging and Production with a genuine
  **business trade-off** ground truth — singleScreen wins submission rate (~37% vs ~30%) but
  twoPage's guided pricing step nudges more submitters to the higher-fee option, so twoPage wins
  on **average fee** (~$27 vs ~$40). Full runbook: [EXPERIMENT_HYDRATOR.md](EXPERIMENT_HYDRATOR.md)
  §"Second experiment: mortgage application flow". No in-app results dashboard for this one —
  FME console only.
- **Governance-compliant from day one** (Phase 3 payoff): both flags pass all six save-time
  policies as documented in `policies/README.md`'s compliant-exemplars table, including the live
  `Jira: SCRUM-401`/`SCRUM-402` references that drove adding `SCRUM` to `approved_jira_prefixes`.

**Demo moment:** "Here's a second team's flags — payments, not AI — governed by the exact same
policy set. And the same hydrator that proved out our AI experiment just proved out a completely
different one, with a real business trade-off instead of a simple win."
**Exit check (QA):** ✅ banner + apply flow render and behave identically in mock and live FME
mode; ✅ riley/jordan deterministically see opposite flow variants; ✅ fee computed server-side
matches the live Dynamic Config; ✅ both flags created + verified in Staging and Production via
MCP; ✅ event types seeded, experiment hydrated, results render in FME's Experimentation view in
both environments; ✅ both flags pass the full governance policy set (`policies/README.md`).

**Status:** ✅ Complete in both Staging and Production (2026-06-16). Docs reconciled 2026-09-01.

---

## Later / backlog
- Multi-provider LLM swap via flag (Claude ↔ OpenAI) — see [DECISIONS.md](DECISIONS.md) D-005.
- Spending-insights UI on `rel_assistant_spendingInsights_web` — deferred; the flag stays a
  name/tags-only governance exemplar (D-019). Would be a third feature if ever revisited.
- Read-only Governance mirror panel (FME Admin API) — carried from Phase 3.
- Hosted/deployed version for remote demos.
- Additional Harness modules (CI/CD, etc.) per Ryan's learning goals.
