# Governance Demo Script (Phase 3)

> **Last updated:** 2026-06-10 · maintained by Claude. The narrative/script for the Phase 3
> governance story. Built from Ryan's *Evolving FME* whitepaper, the client governance proposal,
> and Ryan's OPA policy-as-code response. See [ROADMAP.md](ROADMAP.md) Phase 3 and
> [DECISIONS.md](DECISIONS.md).

## 0. Purpose & audience

A live demo for **prospects and clients** showing the **governance differentiation** of Harness FME
vs. LaunchDarkly, Optimizely, and in-house flag systems. Ryan (Harness employee) has full platform
access, so this demo uses the **real FME/Harness console** — OPA policies, approvals, audit log —
not a simulation. The Northwind Bank app supplies the **runtime payoff** (a flag change actually
changes the product) and a small **read-only governance mirror** so the audience sees the same
governance metadata reflected inside the app.

**The one-breath thesis (what the audience should leave believing):**
> *"In FME, governance isn't a wiki page people are supposed to follow — it's enforced by the platform
> at save-time. Bad flags are prevented, not policed. The audit is a query, not an archaeology project.
> And it's the same platform your CI/CD already runs on."*

The spine is Ryan's whitepaper pipeline: **Create → Validate → Deploy → Measured Rollout → Learn →
Clean Up.** Every scene below is one stage.

Each scene is tagged **SAY** (the line) · **DO** (console/app action) · **SHOW** (what the room sees) ·
**WHY FME** (the differentiation vs LaunchDarkly / Optimizely / in-house — the competitive takeaway).

---

## 1. Prerequisites & setup (do once, before the room)

**In the FME org (console):**
- [ ] Policy engine (OPA) enabled. *(Ryan has OPA today.)*
- [ ] Tier-1 metadata policies authored (use the appendix prompts in the OPA doc → Harness AI release
      agent): require category tag, require squad tag, require Jira ref, require team owner,
      require hypothesis+keyMetric for experiments.
- [ ] **Default-off-in-production** policy **with a `category-operational` exemption** (see Scene 3 —
      this nuance is a deliberate demo beat).
- [ ] **Demo-first gate** + **category-to-approver routing** (Tier 3) configured.
- [ ] Each new policy run at **Warn** first to surface edge cases, then flipped to **Error** for the
      live demo so saves actually block.
- [ ] Approvals configured to route by category tag (PM team ← release/experimental; EM ← operational).
- [ ] An **Admin API key** provisioned (distinct from the runtime SDK key in `.env.local`) — needed
      for the app's governance mirror and for the "rejected save via API" beat.

**In the Northwind app (repo):**
- [ ] The three demo flags exist and are compliant exemplars (see Cast below).
- [ ] Read-only **Governance panel** wired to the FME Admin API (planned app work — shows each flag's
      category, owner, tags, last-modified, policy-compliance).
- [ ] Runtime wiring for `rel_assistant_spendingInsights_web` (the new capability to roll out).

> Keep a **deliberately broken flag draft** ready (no category tag, individual owner, experimental
> with no metric) — that's the hero "rejected save" moment.

---

## 2. Cast — the three flags (one per category)

| Flag | Category | Default | Role in demo | Governance hooks it exercises |
|---|---|---|---|---|
| `ops_assistant_killSwitch_web` | **Operational Control** | **ON** | Kill switch | Default-off **exemption**; EM-approver routing; quarterly health-check |
| `exp_assistant_modelChoice_web` | **Experimental** | OFF | Phase 2 A/B (Haiku vs Sonnet) | Hypothesis + keyMetric policy; PM-approver routing; significance-based cleanup |
| `rel_assistant_spendingInsights_web` | **Release Management** | OFF | The capability we progressively roll out | Full Create→Cleanup lifecycle; default-off; TTL/staleness; demo-first gate |

These three span the client's whole category model and let one demo touch every governance control
without inventing contrived flags.

### Naming convention (the flags eat their own dog food)

Because the demo *shows OPA rejecting non-compliant flags*, the demo's own flags must be exemplars.
We adopt **prefix + category tag** (belt-and-suspenders, so the demo can show both the
naming-convention policy and the category-tag policy):

- **Name format:** `<prefix>_<area>_<descriptor>_<platform>` — prefix ∈ {`rel_`, `exp_`, `ops_`},
  area = `assistant`, descriptor in camelCase, platform = `web`. (Matches the client governance doc's
  secondary naming example, e.g. `ops_core_circuitBreaker_backend`.)
- **Required tags on every flag:** exactly one `category-*` tag **and** a `squad-*` tag.

| Flag | `category-*` tag | `squad-*` tag |
|---|---|---|
| `ops_assistant_killSwitch_web` | `category-operational` | `squad-ai` |
| `exp_assistant_modelChoice_web` | `category-experimental` | `squad-ai` |
| `rel_assistant_spendingInsights_web` | `category-release` | `squad-ai` |

> **Heads-up — this renames the two flags already wired in Phases 1–2.** `ai_assistant_enabled` →
> `ops_assistant_killSwitch_web` and `ai_model` → `exp_assistant_modelChoice_web`. That's a small code
> change (the `FLAGS` string values in `lib/flags/flags.ts`, plus anywhere the raw key is referenced)
> and a doc sync. **Do it before creating the splits in FME** so there's no recreate. The earlier
> `.env.local` setup guidance referenced the old names — use these names instead.

---

## 3. The narrative arc

### Cold open — the problem (≈60s)
- **SAY:** "Most teams don't lack feature flags. They lack a way to keep hundreds of flags across
  dozens of teams from turning into debt, outages, and audit scrambles. Adding more flag *capability*
  doesn't fix that — it adds more for developers to manage. Let me show you the other way to scale."
- **SHOW:** the whitepaper's **two-ways-to-scale** contrast (capability-without-automation vs
  capability-with-automation). Frame the whole demo: *governance encoded in the platform.*

### Scene 1 — CREATE: metadata enforced at save (the hero beat) (≈3 min)
- **SAY:** "Watch me try to create a flag the sloppy way."
- **DO:** Attempt to save the **deliberately broken** `rel_assistant_spendingInsights_web` draft — no category tag,
  an *individual* owner, no Jira reference.
- **SHOW:** FME **rejects the save** with the exact OPA deny messages:
  *"Flag must include exactly one category tag…"*, *"Flag owner must be a team, not an individual…"*,
  *"Flag description must include a linked Jira ticket reference."*
- **SAY:** "That's not a code review someone forgot to do. The platform refused to persist a
  non-compliant flag. Now the compliant version."
- **DO:** Add `category-release`, `squad-<name>`, a team owner, description with `ALG-1234`. Save
  succeeds.
- **WHY FME:** LD/Optimizely enforce naming/ownership through *convention and review*; in-house systems
  through tribal memory. FME enforces it as **policy-as-code at save-time** — "governance without
  gatekeepers."

### Scene 2 — VALIDATE: the rules that protect the *experiment* (≈2 min)
- **DO:** Try to save `exp_assistant_modelChoice_web` (experimental) without a hypothesis or key metric.
- **SHOW:** Reject — *"Experimental flags must include a Hypothesis in the description"* /
  *"…must have at least one key metric defined to measure success."*
- **SAY:** "An experiment with no hypothesis and no metric is just a flag with extra steps. The policy
  makes the discipline structural — it reads the `keyMetrics` field, not a sentence someone typed."
- **WHY FME:** Structural metric enforcement (first-class `keyMetrics` field), not text-parsing or honor
  system.

### Scene 3 — DEPLOY: default-off, and the *smart* exemption (≈2 min)
- **SAY:** "Every release flag must enter production **off** — no feature ever ships on by accident."
- **DO:** Show `rel_assistant_spendingInsights_web` is forced to default-off in prod by policy.
- **SAY:** "But a blunt 'everything off' rule would be wrong. A kill switch is *supposed* to be on."
- **DO:** Show `ops_assistant_killSwitch_web` (operational) saving fine with default **ON** — because the
  policy **exempts `category-operational`.**
- **SHOW:** Same policy, two outcomes, driven by the category metadata from Scene 1.
- **WHY FME:** This is the payoff of category-aware policy: prevention that's smart, not just strict.
  Knight-Capital-class "a flag flipped on by accident" incidents become structurally impossible for
  release flags — *without* hamstringing operational ones.

### Scene 4 — MEASURED ROLLOUT: console drives, the app responds (≈3 min)
- **DO:** Run the **reusable rollout pipeline** (`pipelines/governed-fme-rollout.yml`) with
  `flagName = rel_assistant_spendingInsights_web` and the prod environment. The same flag-agnostic
  pipeline rolls out *any* flag: **Guardrail → Approval (routed to `team_pm_ai`) → ramp**. Approve at
  the gate.
- **DO:** The pipeline ramps `1% → 50% → 100%` via `FmeFlagDefaultAllocation`, with an approval gate
  between stages and an `FmeFlagKill` rollback on failure.
- **DO (the guardrail beat):** Try to run the same pipeline against `exp_assistant_modelChoice_web` →
  the OPA Policy step (`block_experiment_flag_rollout`) **hard-blocks** it: a routine rollout can't
  touch an experiment flag and orphan its live metric window. "Same pipeline, but governance won't let
  me break my experiment." (See `pipelines/README.md`, D-017.)
- **SHOW — switch to the Northwind app:** spending-insights UI appears for targeted users; flip the
  ramp and it spreads. **Then open the app's Governance panel** — category, owner, tags, last-modified,
  and **policy-compliance pulled live from the FME Admin API**. "The product reflects the same
  governance state you just enforced."
- **WHY FME:** Approval + environment-ordering enforced as **system controls**, not Slack threads. The
  decoupling of deploy from release is real and visible.

### Scene 5 — LEARN: prove impact, not just absence of errors (≈2 min)
- **SAY:** "Rolling out safely is table stakes. Did it *work*?"
- **DO/SHOW:** The Phase 2 experiment on `exp_assistant_modelChoice_web` — Sonnet +~16% thumbs-up, p<0.001, at 3.3× cost.
- **SAY:** "Same platform: the flag, who's allowed to change it, *and* whether it moved the metric —
  flags + attribution + experimentation in one tool."
- **WHY FME:** The only platform combining feature management + attribution + experimentation natively.

### Scene 6 — CLEAN UP: debt is the metric, audit is a query (≈2 min)
> Director's note (verbal, optional): if the room is governance-savvy, this is where Ryan riffs on the
> "target debt, not concurrency" point — i.e. arbitrary per-team flag caps (the AbbVie 10-flag rule)
> are an anti-pattern that punishes legitimate activity; stale-flag limits + TTLs + cleanup throttles
> hit the real problem. Not scripted; landed live.
- **SAY:** "The expensive flags are the ones nobody remembers. So cleanup is governed too."
- **DO:** Show staleness/TTL — `rel_assistant_spendingInsights_web` carries an expected lifespan; once past 100% and
  TTL, it's flagged for archive. The block-archive-on-active-traffic policy prevents retiring a flag
  still serving.
- **DO:** Open the **audit log** — filter to "who changed `ops_assistant_killSwitch_web` and when."
- **SAY:** "Auditors don't ask whether you have a policy. They ask whether it was *enforced*. That
  evidence is generated continuously — the audit is a query, not an archaeology project."
- **WHY FME:** Detective controls (monthly manual audits) become **preventative** (save-time) — the
  manual audit shrinks to lightweight exception review.

### Close — the bridge (≈45s)
- **SAY:** "Everything you saw — create, validate, deploy, measure, retire — was governed by the
  platform, not by people remembering to. And it's the same Harness platform your pipelines, CD, and
  IaCM run on. ADP cut flag lead time from weeks to days; DigiCert went from three nines to four.
  Not from a new flag feature — from making the release process itself automated and governed."

---

## 4. Differentiation cheat-sheet (have these ready for Q&A)

| They ask… | The FME answer |
|---|---|
| "Doesn't LaunchDarkly have approvals/audit too?" | Yes — but governance lives in *review and convention*, enforced by humans. FME enforces at **save-time via OPA/Rego**, and the same governance spans pipelines/CD. |
| "We enforce naming/ownership in code review." | Code review gets skipped under deadline pressure. A policy can't be skipped. |
| "How is this different from our in-house flags?" | You'd be rebuilding policy engine + approvals + audit + experimentation. This is out-of-the-box and integrated. |
| "Won't policies slow developers down?" | Inverse: developers interact with flags *less*. The policy does the remembering. Run policies at **Warn** first so nothing's a surprise. |
| "Can policies be too strict?" | The default-off-with-operational-exemption beat (Scene 3) shows category-aware prevention — strict where it matters, exempt where it shouldn't apply. |

---

## 5. Variations
- **Runtime-first opener (for mixed/skeptical or eng-led rooms):** swap the cold open for a *live
  kill-switch flip* — toggle `ops_assistant_killSwitch_web` in the console and the AI assistant dies
  in the Northwind UI instantly, no deploy. Then pivot: *"That felt like magic — but at enterprise
  scale that power is dangerous unless it's governed. Here's how FME makes it safe."* Enter the
  pipeline at **Scene 1 (Create)** and run the rest unchanged. Leads with the visceral payoff and uses
  the tension to *motivate* the governance half, rather than opening on rules. (Keep the default
  governance-first order for compliance/CISO-led rooms who came for control.)
- **5-minute version:** Cold open → Scene 1 (rejected save) → Scene 4 (rollout + app payoff) → Close.
- **Governance-deep-dive (CISO/compliance):** lead with Scene 6 (audit-as-query, preventative vs
  detective) and the HIPAA/audit-posture framing; lighter on runtime.
- **Audible-ready (zero prep):** if the org isn't pre-configured, fall back to the in-app governance
  mirror + the committed Phase 2 results, and *narrate* the console policies from screenshots.

## 6. Open build items this script implies
**Done:**
- ✅ FME save-time governance Rego (`policies/*.rego`) + flag naming convention (D-010/D-011/D-014).
- ✅ Reusable rollout pipeline + experiment guardrail authored in repo (`pipelines/`, D-017) **and
  created live** in Harness via MCP (policy + Custom policy set `onstep`/`error` + pipeline
  `governed_fme_rollout`).

**Still open:**
- `rel_assistant_spendingInsights_web` flag + its runtime UI in the Northwind app (Release-category
  exemplar). Flag left to create live during Scene 1.
- The read-only **Governance panel** in the app (FME Admin API → category/owner/tags/compliance).
- A live end-to-end pipeline run (needs the `rel_*` flag + the project's FME connector verified).
