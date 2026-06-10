# Roadmap

> **Last updated:** 2026-06-10 · maintained by Claude across sessions.

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
- Flags: `ai_assistant_enabled` (kill switch, F3), `ai_model` treatment by user tier — premium→sonnet,
  free→haiku (targeting, F4). Model id flows into `askAssistant`.
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

## Phase 2 — Experimentation + measurement 🧪
**Goal:** the headline differentiator — prove impact, not just toggle features. Must be
**audible-ready** (demoable on zero notice). See [DECISIONS.md](DECISIONS.md) D-008.

- Treatments for an A/B test: Haiku vs Sonnet (or prompt v1 vs v2).
- Metric capture (F6): thumbs up/down, latency, estimated token cost per treatment.
- **Traffic simulator** (`lib/sim/`): generates synthetic users, logs impressions via
  `getTreatment`, `track()`s the metric per-treatment; sized to actually cross the significance
  threshold (baseline rate, MDE, power 0.8, alpha 0.05). Feeds both paths below.
- **Path A — in-app results view (default, always works):** renders **pre-baked fixtures** in
  seconds; no FME/network dependency; works in mock mode and for cloners.
- **Path B — standing real-FME experiment (credibility upgrade):** seed the FME org once; results
  persist indefinitely. ⚠️ **Never hit Re-calculate** on an aged experiment — FME keeps raw events
  only 90 days, so re-calc after that recomputes against purged data and destroys the result.

**Demo moment:** "We didn't just ship a new model — we measured it. Sonnet got 18% more thumbs-up
but cost 3x more per response. *That's* the flags + attribution + experimentation story in one tool."
**Exit check (QA):** in-app results render instantly with no FME key; simulator output crosses the
significance threshold; (live mode) events attribute to the correct treatment.

---

## Phase 3 — Governed rollout: pipelines + policies 🛡️
**Goal:** the governance story and the bridge to other Harness modules.

- Progressively roll out a new assistant capability (e.g. proactive spending insights): 1% → 50% → 100%.
- Demonstrate approvals / policy guardrails (FME admin API and/or Harness pipelines + OPA policies).
- Document how this extends into other Harness modules over time.

**Demo moment:** "This AI capability rolled out behind an approval and an automated guardrail —
governed, auditable, progressive. And it's the same platform your CI/CD lives in."
**Exit check (QA):** rollout stages behave correctly; an unapproved/over-threshold change is blocked.

---

## Later / backlog
- Multi-provider LLM swap via flag (Claude ↔ OpenAI) — see [DECISIONS.md](DECISIONS.md) D-005.
- Hosted/deployed version for remote demos.
- Additional Harness modules (CI/CD, etc.) per Ryan's learning goals.
