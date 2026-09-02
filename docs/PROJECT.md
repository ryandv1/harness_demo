# Northwind Bank — FME AI Demo

> **Status:** Two features live (AI assistant + mortgage refinance servicing), governance in
> progress · **Last updated:** 2026-09-01
> **Working name:** `fme-ai-bank-demo` (fictional brand: "Northwind Bank" — rename freely)

This is the single source of truth for *what we're building and why*. Claude maintains this file
across sessions. For *how it's sequenced* see [ROADMAP.md](ROADMAP.md); for *why we chose things*
see [DECISIONS.md](DECISIONS.md); for *where the code lives* see [FILE_MAP.md](FILE_MAP.md).

---

## 1. Vision

A downloadable, runnable demo application that shows how **Harness FME (Feature Management &
Experimentation)** differentiates from other tools (LaunchDarkly, Optimizely, in-house flags) —
specifically in the context of **AI feature development**.

The app is a mock consumer **banking app** with an **AI financial assistant** (chatbot, powered by
Anthropic Claude). Every AI behavior — whether the assistant is on, which model it uses, which
prompt it runs, how it's rolled out — is controlled by Harness FME. This turns abstract feature-
management concepts into something a prospect can *watch happen live*.

## 2. Who it's for

| Audience | What they need from it |
|---|---|
| **Prospects / customers** (Ryan demoing) | A vivid, believable story: "watch me change the AI with a flag flip, then prove it worked." |
| **Other Harness engineers** (cloning it) | A working copy they can run locally in minutes, with or without an FME account. |
| **Ryan (learning)** | A real, growing codebase to learn full-stack + AI app development, and a base to add other Harness modules over time. |

## 3. The differentiation story (three pillars)

The demo is built to land these three FME differentiators. Everything we build should serve at
least one of them.

1. **Architecture** — FME evaluates flags **locally / in-memory** in the SDK (no network call per
   check), is **privacy-by-default** (user data doesn't leave your systems), and adds
   ~microseconds of latency. This matters doubly for AI, where you're already paying for an LLM
   round-trip. *Demo angle: show flag-check latency and that targeting happens without shipping PII.*
2. **Experimentation** — flags + attribution + experimentation in **one platform**. You can A/B a
   model or prompt and **measure the real impact** (quality, cost, latency, engagement).
   *Demo angle: run an experiment, then show results tied to a metric.*
3. **Flag operations & governance** — automate rollouts with **pipelines + policies** (approvals,
   guardrails, progressive delivery). *Demo angle: govern an AI feature's release; this is also the
   bridge to other Harness modules later.*

## 4. The features

Two feature areas anchor the demo, deliberately owned by **two different squads** so the
governance story (Phase 3) has more than one team's flags to point at, and so the demo covers
more than one FME flag category end-to-end (operational + experimental + release).

### 4.1 AI financial assistant (squad-ai)

An **AI financial assistant**: a chat interface inside the banking app that answers questions about
the user's (mock) finances — e.g. "How much did I spend on dining last month?", "Can I afford a
$2,000 purchase?", "Summarize my spending." Powered by Anthropic Claude.

This feature is the canvas for the *architecture* + *experimentation* pillars:
- **Kill switch** (`ops_assistant_killSwitch_web`) — turn the assistant off instantly if it misbehaves.
- **Targeting** — give premium-tier users a stronger model (Sonnet) and others a faster/cheaper one (Haiku).
- **Model experiment** (`exp_assistant_modelChoice_web`) — A/B Haiku vs Sonnet, with Dynamic
  Configuration (model, temperature, prompt variant, context size) beyond just the model id, and a
  real hydrated FME experiment (D-016).
- **Release flag** — `rel_assistant_spendingInsights_web` exists as a governance-policy exemplar
  (name/tags/description only; no app-side runtime wiring — see D-019).

### 4.2 Mortgage refinance servicing (squad-payments)

A second, non-AI surface: a promotional refinance banner on the dashboard and a two-step
application flow. Built to give the *governance* pillar a second squad to point at, and to prove
the release-flag + experiment patterns generalize beyond the AI assistant (D-019).

- **Release flag** (`rel_mortgage_refinanceBanner_web`, default **on**) — a dashboard banner
  (`MortgageBanner.tsx`) whose copy, promoted rate, and fee-formula parameters are all **Dynamic
  Configuration**, editable in the FME UI with no redeploy — the same "beyond flip a switch"
  story as the AI model flag's config (D-013), for a non-AI feature.
- **Experiment flag** (`exp_mortgage_applicationFlow_web`) — A/B a **single-screen** vs. **guided
  2-page** application flow (`MortgageApplyClient.tsx`). Riley/Jordan are pinned to opposite
  variants via deterministic individual-key targeting, mirroring the AI model flag's tier
  targeting.
- **Real runtime behavior:** `POST /api/mortgage/apply` re-derives the fee **server-side** (never
  trusts a client-supplied number) via `lib/mortgage/fees.ts`, fed by the banner's live Dynamic
  Config, persists the application, and fires two FME events.
- **A genuine trade-off result:** single-screen wins on raw submission rate, but the 2-page flow's
  guided pricing step nudges more submitters to the higher-fee option, so 2-page wins on average
  fee — a business trade-off, not a simple win/lose. Pre-populated via the same Experiment
  Hydrator pattern as the AI model experiment (D-016 Path B); no in-app results dashboard for this
  one — FME console only. Full runbook: [EXPERIMENT_HYDRATOR.md](EXPERIMENT_HYDRATOR.md).

## 5. Requirements

### Functional
- **F1** Mock banking UI: account overview, balances, transaction list (seeded, realistic data).
- **F2** AI assistant chat panel that answers questions grounded in the user's mock transaction data.
- **F3** All AI behavior gated by FME flags: on/off, model selection, prompt version, rollout %.
- **F4** A way to **switch the "current user"** (e.g. free vs premium) to demo targeting live.
- **F5** Visible **demo affordances**: surface which flag values/treatments are active and (where
  relevant) flag-eval latency, so a viewer can *see* FME working. (A small "demo panel" / debug overlay.)
- **F6** Metric capture for experimentation: thumbs up/down on AI responses, latency, token/cost
  estimate, per treatment.

### Non-functional
- **N1 Mock-first:** the app runs **end-to-end with no FME credentials** via a built-in mock flag
  client; supplying a real `FME SDK key` switches it to live FME with no code change.
- **N2 Low setup friction:** `git clone` → install → run, with `.env.example` documenting keys.
  SQLite (file-based) so there's no database server to stand up.
- **N3 Teachable:** code and docs explain the "why" — this doubles as Ryan's learning project.
- **N4 Safe AI:** Anthropic key stays server-side; the app degrades gracefully if the AI key is
  absent (canned responses) so the *FME* story still demos without an LLM key.

### Out of scope (for now)
- Real authentication / real money / real bank integrations.
- Multi-provider LLM (Anthropic only for now — model-swapping is Claude-tier to Claude-tier). See
  [DECISIONS.md](DECISIONS.md) D-005.
- Production deployment / hosting (local-run demo first).

## 6. Success criteria

- A newcomer can clone the repo and have it running locally in **under 10 minutes** with no FME or
  Anthropic key (mock mode).
- Ryan can perform each "demo moment" in [ROADMAP.md](ROADMAP.md) live, in front of a prospect,
  without editing code.
- Each phase visibly advances at least one of the three differentiation pillars.

## 7. Glossary

- **FME** — Harness Feature Management & Experimentation (the Split-based platform).
- **Flag / Split** — a named feature toggle with one or more **treatments**.
- **Treatment** — a possible value of a flag (e.g. `on`/`off`, or `haiku`/`sonnet`).
- **Targeting** — rules that decide which treatment a given user gets.
- **Experiment** — a flag whose treatments are compared against a metric to measure impact.
- **Mock mode** — our local flag client that returns flag values without contacting FME.
