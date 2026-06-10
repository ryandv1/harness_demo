# Decision Log

> **Last updated:** 2026-06-10 · maintained by Claude. Append-only; supersede rather than delete.

Lightweight ADRs (Architecture Decision Records). Each entry: the decision, why, and alternatives.

---

### D-001 — App domain: mock fintech/banking app
**Decided:** 2026-06-09 · **Status:** Accepted
A consumer banking app. Matches Ryan's FS/FinTech focus and resonates with the enterprises he sells
to. *Alternatives:* e-commerce (more universal but less aligned), SaaS dashboard (too generic),
to-do app (too trivial for a sales demo).

### D-002 — Core feature is an AI financial assistant (chatbot)
**Decided:** 2026-06-09 · **Status:** Accepted
The demo centers on AI feature development, per Ryan's specific interest in FME × AI use cases. A
chatbot is the most demo-friendly AI surface for showing prompt/model experiments and kill switches.
*Alternatives considered:* spending insights, fraud/risk check, loan advisor — all viable later
capabilities (Phase 3 uses "spending insights" as the new rolled-out capability).

### D-003 — Stack: Next.js (full-stack) + TypeScript + SQLite + Anthropic Claude
**Decided:** 2026-06-09 · **Status:** Accepted
Full-stack (not front-end only) because LLM calls and the FME **server-side** SDK belong on the
backend, and it's a better base for adding Harness modules later. SQLite (file-based) keeps setup
frictionless — no DB server. Next.js/TS is familiar to Ryan (fme-messaging) which aids the learning
goal. *Alternatives:* front-end only (can't host secrets/server SDK), a brand-new stack (slower
start, less reuse of existing knowledge).

### D-004 — Mock-first flag client (`FlagClient` interface)
**Decided:** 2026-06-09 · **Status:** Accepted
A `FlagClient` interface with a **mock implementation** so the app runs with zero FME credentials;
a real FME SDK key swaps in the live implementation with no code change (req N1, N2). Maximizes
shareability for other engineers cloning the repo. *Alternative:* require a real FME key — higher
friction, worse for sharing.

### D-005 — Anthropic only for now (defer multi-provider)
**Decided:** 2026-06-09 · **Status:** Accepted
Start with Claude only; demo model-swapping between Claude tiers (Haiku ↔ Sonnet). Avoids a second
API key and extra setup for cloners. *Trade-off:* the flashier "swap LLM provider via a flag"
(Claude ↔ OpenAI) demo is deferred to backlog. We will still **architect the model behind a flag**
so adding a provider later is cheap.

### D-006 — Phase the FME story (Control → Experimentation → Governance)
**Decided:** 2026-06-09 · **Status:** Accepted
Lead with kill switch + targeting (easiest to grasp), then experimentation (headline
differentiator), then governance/pipelines (bridge to other Harness modules). Each phase is
independently demoable. See [ROADMAP.md](ROADMAP.md). *Alternative:* lead with experimentation —
rejected because it's hard to land before the audience understands basic flagging.

### D-007 — Graceful AI degradation (canned fallback without an Anthropic key)
**Decided:** 2026-06-09 · **Status:** Accepted
If no `ANTHROPIC_API_KEY` is present, the assistant returns canned responses so the **FME** story
still demos. Keeps the *feature-management* narrative independent of the *AI* dependency (req N4).

### D-008 — Experimentation data: on-demand traffic simulator + two demo paths
**Decided:** 2026-06-09 · **Status:** Accepted
A live experiment needs statistically meaningful event volume that 1–2 manual users can't produce,
and FME computes results on a calculation cadence — so we cannot generate a fresh significant result
live in the room. We must be **"audible ready"** (demoable on zero notice), so we build **one
reusable traffic simulator** that feeds **two on-demand paths**:

1. **Instant in-app results view (default, always works).** The simulator generates results **once**,
   committed as **pre-baked fixtures**; an in-app experiment dashboard renders them in seconds. No
   FME calc cadence, no network/FME dependency, works in mock mode and for cloners. This is the
   reliable audible-ready path for unplanned demos.
2. **Standing real-FME experiment (credibility upgrade).** Seed the experiment in the FME org
   **once**; FME computes it once and the **results persist indefinitely** with no per-demo prep and
   **no keep-alive trickle needed**.

The simulator calls `getTreatment` per synthetic user (logs impressions) and `track()`s the metric
with a per-treatment probability, and is **sized to actually cross the significance threshold** given
the configured settings (baseline rate, minimum detectable effect, power 0.8, alpha 0.05) — honest
stats, not faked numbers.

**Critical operational guardrail (FME mechanic, confirmed by Ryan):** FME persists computed
experiment *results* indefinitely, but retains the underlying **raw event data for only 90 days**,
then purges it. **Never press "Re-calculate"** on a standing/aged seeded experiment: re-calc
recomputes from raw data, so it's safe *within* 90 days but *after* 90 days the events have aged out
and re-calc destroys the seeded result. To refresh, re-seed and recompute within the 90-day window,
or create a **new** experiment/version and re-seed.

*Rejected:* (a) rely on live traffic simulation to produce results in the room — won't work due to
calc cadence; (b) per-demo pre-seeding days ahead — fails the audible-ready requirement; (c) in-app
chart only with no real-FME path — loses the credibility of showing the actual product.

**Implementation note (2026-06-10, Phase 2):** Built and verified. The simulator allocates synthetic
users 50/50 by a **stable key hash** (`lib/sim/rng.ts`) rather than calling the mock client's
`getTreatment` — the mock `ai_model` rule targets by *tier* (Phase 1), which wouldn't produce the
even A/B split an experiment needs. Key-hash bucketing is exactly how an FME percentage rollout
allocates traffic, so this stays faithful to the live behavior while keeping the simulator
self-contained. Stats are honest (`lib/experiment/stats.ts`): real Bernoulli draws, a two-proportion
z-test, and a power-analysis sample-size target. The committed fixture (`lib/sim/fixtures.json`,
seed 42, 6,000 users) yields Sonnet +10pt / p<0.001; live 👍/👎 feedback blends on top via
`app/api/experiment`.

### D-009 — Source control: local-first, private→public later, secrets-safe from commit #1
**Decided:** 2026-06-09 · **Status:** Accepted
Start with a **local git repo** (`main` branch); pick a remote later. When we do, the repo starts
**private/invite-only** and flips to **public** later (GitHub/Harness Code allow this with no
recreate). Remote host is **undecided** — candidates: Ryan's personal GitHub, Harness company GitHub
org, or Harness Code Repository; whichever we pick is also what Harness pipelines connect to in
Phase 3.

**Guardrail:** because the repo will eventually be public, **treat it as public from the first
commit** — git *history* exposes anything ever committed. No secrets ever enter history: keys live
in git-ignored `.env.local`; we ship a blanks-only `.env.example`. `.gitignore` enforces this
(`.env*`, `*.key`, `*.pem`, `node_modules/`, `.next/`, `data/*.sqlite`). Mock-first architecture
(D-004, D-007) means the app runs with zero secrets, so a public clone is safe by construction.
