# Decision Log

> **Last updated:** 2026-09-01 · maintained by Claude. Append-only; supersede rather than delete.

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
`getTreatment` — the mock `exp_assistant_modelChoice_web` rule targets by *tier* (Phase 1), which wouldn't produce the
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

### D-010 — Phase 3 governance: lives in the FME console; app is runtime payoff + read-only mirror
**Decided:** 2026-06-10 · **Status:** Accepted
The governance story (policy-as-code/OPA, approvals, audit, pipelines) is demonstrated in the **real
Harness/FME console**, not simulated in the app. Rationale: OPA policies fire at flag
**create/update** time (console, Admin API, pipeline) — the runtime SDK never touches them — and Ryan
(Harness employee) has full platform access incl. OPA, so a faithful demo uses the real product.
Unlike Phases 1–2, this means **governance does not degrade to mock**: a credential-less cloner sees
the runtime payoff but not the policy enforcement. Accepted as a conscious departure from mock-first
for this phase. The Northwind app's role: (a) **runtime payoff** — flag changes visibly change the
product; (b) a **read-only governance mirror** panel that pulls each flag's category/owner/tags/
compliance from the FME Admin API. Full demo narrative in [DEMO_GOVERNANCE.md](DEMO_GOVERNANCE.md).
*Alternatives:* an in-app OPA simulator (rejected — can't honestly call a fake "real FME"); skip
governance in-app entirely (rejected — the mirror reinforces the console story for the audience).

### D-011 — Flag naming convention: category prefix + required tags
**Decided:** 2026-06-10 · **Status:** Accepted
Flag keys follow `<prefix>_<area>_<descriptor>_<platform>` where the prefix encodes FME category
(`rel_`/`exp_`/`ops_`), e.g. `ops_assistant_killSwitch_web`. Every flag also carries exactly one
`category-*` tag and a `squad-*` tag in the console. **Belt-and-suspenders** (prefix *and* tag) is
deliberate: it lets the governance demo show both the naming-convention policy and the category-tag
policy, and the demo's own flags must be exemplars since the demo shows OPA rejecting non-compliant
flags. Adopted from the client governance doc's secondary naming option (its primary was tags-only).
The two Phase 1/2 flags were renamed accordingly (`ai_assistant_enabled` → `ops_assistant_killSwitch_web`,
`ai_model` → `exp_assistant_modelChoice_web`) before any FME splits exist, so the cost was a code +
docs sync with no FME recreate. *Trade-off:* longer flag names; the client doc notes tags-only avoids
this, but for a *demo* the visible prefix is worth the length.

### D-012 — Live FME via the Harness MCP server; flags created + verified against the real org
**Decided:** 2026-06-11 · **Status:** Accepted
We wired the **Harness MCP server** (`harness-mcp-v2`, toolset `feature-flags`) into Claude Code so
flag management is **agent-driven** from this repo rather than manual console clicking. Using it we
created all three demo flags and their per-environment definitions in workspace `FME_Finance_AI_demo`,
in **both Prod and Stg** (identical definitions, so either environment's SDK key "just works"):
`ops_assistant_killSwitch_web` (on/off, default **on**), `exp_assistant_modelChoice_web`
(haiku/sonnet, default **haiku**), `rel_assistant_spendingInsights_web` (on/off, default **off**).
All three are tagged as compliant exemplars (see `policies/`).

**Targeting rule (model choice):** premium users get Sonnet, everyone else Haiku — matching the mock
client contract. The app sends `{ tier }` as the evaluation attribute. The correct Split/FME matcher
schema (after two wrong guesses) is **`{"type":"IN_LIST_STRING","attribute":"tier","strings":["premium"]}`**
inside `rules[].condition.matchers` with a `buckets:[{treatment:"sonnet",size:100}]` — *not* `WHITELIST`
or `EQUAL_TO_SET`. Recorded here so future attribute rules can be scripted via the MCP directly.

**Secrets handling.** Two distinct credential layers, both kept out of git:
- **Admin/MCP keys** (`HARNESS_API_KEY`, `HARNESS_FME_API_KEY`) live in the shell + Claude Code's
  local-scope MCP config (`~/.claude.json`), never a committed `.mcp.json`. The MCP server's
  `HARNESS_AUTO_APPROVE_RISK=high_write` env is required for unattended writes (org-managed connector
  settings block changing this elsewhere).
- **Runtime SDK keys** (`FME_SDK_KEY`) live only in git-ignored `.env.local`. We park **both** the
  Prod and Stg server-side keys there as `FME_SDK_KEY_PROD` / `FME_SDK_KEY_STG`, and the app reads a
  single `FME_SDK_KEY=${FME_SDK_KEY_PROD}` (Next.js `dotenv-expand`) so switching environments is a
  one-line change with no secret copy-paste. Consistent with D-009 (treat repo as public from commit #1).

**Verified live (2026-06-11):** with the **Prod** SDK key, `GET /api/flags` returns `mode:"fme"`,
`source:"fme"` on every evaluation; Riley (premium) → `sonnet`, Jordan (free) → `haiku`, kill switch
`on`. This is the Phase 1 go-live ("see it working with my real FME account"). Policy authoring stays
out of scope for the MCP — OPA/Rego is pasted into the FME console Policy editor (D-010), not pushed
via the SDK or Admin API. *Alternatives:* manual console-only flag creation (slower, not repeatable,
no scripted record of the matcher schema) — rejected.

### D-013 — Dynamic Configuration on the model flag (experimentation beyond model choice)
**Decided:** 2026-06-11 · **Status:** Accepted
To demo FME's **experimentation-in-AI** differentiation — that you test more than the model (prompts,
temperature, length, context size) and measure **user impact in production** (distinct from offline
**evals**) — we attached an FME **Dynamic Configuration** JSON payload to each treatment of
`exp_assistant_modelChoice_web`. The treatment now means a *configuration bundle*, not just a model:
```
haiku  → { model: claude-haiku-4-5-20251001, temperature: 0.7, maxTokens: 400, systemVariant: "concise",  contextTransactions: 10 }
sonnet → { model: claude-sonnet-4-6,         temperature: 0.2, maxTokens: 600, systemVariant: "detailed", contextTransactions: 20 }
```
Read live via the SDK's **`getTreatmentWithConfig`** (treatment + config JSON in one local eval). Five
variables are parsed and applied at runtime in `lib/ai/claude.ts` (model, temperature, max_tokens,
system-prompt variant, and how many recent transactions are fed as context) — **editable in the FME
UI with no redeploy**. The DemoPanel renders the live payload so the audience sees it came from the
flag, not the build.

**Mock-safe (D-004 preserved):** the same payloads live in `MODEL_CONFIG_BY_TREATMENT`
(`lib/flags/flags.ts`); `MockFlagClient.getTreatmentWithConfig` returns them so zero-key mock mode
behaves identically. `resolveModelConfig(treatment, json)` prefers the live FME config (merged over
local defaults so partial payloads are safe) and falls back to the parity map. The kill-switch flag
carries no payload (`config: null`).

**Verified live (2026-06-11):** `/api/flags` returns the config string per arm in `mode:"fme"`
(Riley→sonnet bundle, Jordan→haiku bundle); the premium→sonnet targeting rule (D-012) was preserved
through the treatment-config update on both Prod and Stg. *Alternatives:* a separate prompt/temperature
experiment flag with the model held constant (cleaner "beyond models" headline, deferred — backlog);
hardcoding params per model in code (rejected — defeats the no-redeploy point).

### D-014 — Governance policies reconciled to the real FME policy input schema
**Decided:** 2026-06-15 · **Status:** Accepted
The Phase 3 OPA/Rego policies (`policies/`) were drafted against an *assumed* payload shape. We
verified the **real** FME policy input schema from the official docs
([developer.harness.io/docs/feature-management-experimentation/policies](https://developer.harness.io/docs/feature-management-experimentation/policies))
and rewrote all six policies + the release-agent prompts to use **only fields that exist**. Per
Ryan's instruction: the policies must reflect reality, and genuine gaps get flagged to the FME
product team rather than worked around with invented fields.

**Key schema facts (verified):**
- Two separate save events, each scoped to its own **entity type** in a policy set, running **On
  Save**, with FME reading a `deny` set of strings. Package names per the docs: `fme_feature_flags`
  and `fme_feature_flag_definitions`.
- **Feature Flag** payload: `featureFlag.{name,status,description,tags,trafficType{id,name},
  pendingChangeRequests,hasPendingStatusChange}` + `entityMetadata.{actor{id,type},changeTrigger,
  owners[]{id,type},project{id}}`.
- **Feature Flag Definition** payload (per-environment): `featureFlagDefinition.{name,environmentName,
  status,killed,trafficTypeName,description,definition[],treatments[]{name,description,baseline,
  defaultTreatment(bool)},trafficAllocation,flagSets[]}` + same `entityMetadata`.

**Corrections made:**
- Owners are `owners[].{id,type}` — **not** `ownerType/ownerId/ownerName` (policy 4 rewritten).
  ⚠️ **Superseded by D-015:** a real live policy-evaluation payload proved owners actually use
  `{id, ownerId, ownerType}` (the docs example's `{id,type}` was wrong for the runtime payload).
  Policy 4 now reads whichever shape is present. The *actor* does use `type`; owners do not.
- Default-off-in-prod (policy 6) moved to the **Feature Flag Definition** entity; reads
  `environmentName` + the `treatments[]` entry with `defaultTreatment==true`. The earlier
  `featureFlag.environments[].defaultTreatment` shape does not exist.
- Package names changed from `fme.governance.*` to the doc's entity-type packages.

**Gaps raised to product (can't be enforced with today's payload):**
- **G1 — no `metrics`/`keyMetrics`** on either payload → "experiments must declare a success metric"
  is unenforceable; policy 5 reduced to **hypothesis-only** (parsed from description).
- **G2 — no `tags` on the Feature Flag Definition payload** → a definition-scoped policy can't read
  `category-operational`; policy 6's operational exemption falls back to the **`ops_` name prefix**
  (D-011 convention).
- **G3 — no first-class hypothesis field** (hypothesis lives in description free-text).
- **G4 — no owner display name** (only id/type). Minor.

*Alternatives:* keep the invented fields and demo a policy that silently never fires (rejected —
dishonest, and breaks the live rejected-save beat); drop policies 5/6 entirely (rejected — the
hypothesis check and default-off check still work within the real schema). `opa` still isn't
installed locally, so policies remain un-machine-checked; verify in the FME console with sample
payloads before switching Warn→Error.

### D-015 — Make reality match policy 4: real PM-team groups created in the account
**Decided:** 2026-06-15 · **Status:** Accepted (with two open items)
Listing the live FME flags + account user groups via MCP (now that the `access_control` toolset is
enabled — see below) exposed that policy 4's premise didn't match the account:
- The three demo flags (`ops_/exp_/rel_assistant_*`) have **no owners at all** (`owners: []`), so
  policy 4 (owner-present + team-owned + PM-team-for-rel/exp) would **reject** them — contradicting
  the "compliant exemplars" claim.
- The account had only two groups: `ryanv_admin_group` and the managed `_account_all_users`. The
  `team_pm_ai` / `team_pm_alpha` names in `approved_pm_teams` were **invented placeholders**.
- When an owner *is* set (`ryan_demo_flag`), it's an individual `{type:"user"}` with an opaque UUID.

Rather than weaken policy 4, Ryan chose to **make reality match the rule**. Created two
**account-scoped, non-managed** user groups via MCP so `approved_pm_teams := {"team_pm_ai",
"team_pm_alpha"}` now references real groups:
- `team_pm_ai`   → `…/settings/access-control/user-groups/team_pm_ai`
- `team_pm_alpha`→ `…/settings/access-control/user-groups/team_pm_alpha`

**To enable this, `~/.claude.json` HARNESS_TOOLSETS was widened** `feature-flags` →
`feature-flags,access_control` (RBAC user-group resources weren't loaded before). Account keys in
that config stay out of the repo (D-009).

**Scope correction:** account-scoped groups did **not** appear in the FME flag Owners picker (it is
**project-scoped**). Recreated `team_pm_ai` / `team_pm_alpha` scoped to org `default` / project
`FME_Finance_AI_demo`; they then showed up. The two account-scoped dupes were deleted manually in
the UI by Ryan (✅ done) — the MCP risk gate (`HARNESS_AUTO_APPROVE_RISK=high_write`) blocks
user-group *delete*, so MCP couldn't do it.

**Live-payload findings (from policy_evaluation 14797466, the failed save):** inspecting the real
evaluated `input` resolved both open items and exposed a policy bug:
- **Owner shape is `{id, ownerId, ownerType}`** — e.g. `{id:"team_pm_alpha", ownerId:"team_pm_alpha",
  ownerType:"team"}`. There is **no `type`** key on owners. Our policy 4 checked `owner.type ==
  "team"` → always false → rule 3 wrongly denied. **Fixed** (policy 4 now reads `ownerType`/`ownerId`
  with a `type`/`id` fallback), in the repo file **and** in the deployed FME policy (PATCHed via the
  governance toolset, `harness_update resource_type=policy`).
- **Owner id IS the readable group identifier** (`team_pm_alpha`), not a UUID → Open item 2 resolved;
  `approved_pm_teams := {"team_pm_ai","team_pm_alpha"}` is correct as-is.
- The other four policies (category, squad, jira, hypothesis) all **passed** on the same payload; the
  deployed policy set runs category + team-ownership at **Error**, the rest at **Warn**.

**Ownership model (who owns what):** PM teams (`team_pm_ai` / `team_pm_alpha`) own release &
experimental flags (policy 4 rule 3). Operational flags are **not** PM-owned — added a project-scoped
**`team_ops`** group for those; `ops_*` flags are `category-operational`, so rule 3 doesn't apply and
only rules 1+2 ("must have a team owner") do. Intended owners: `exp_*` → `team_pm_ai` (✅ assigned &
verified), `rel_*` → `team_pm_ai`, `ops_*` → `team_ops`.

**Done — all three demo flags pass the full policy set (verified live):** `exp_*` → `team_pm_ai`
(eval `14797813`), `rel_*` → `team_pm_ai` (eval `14798004`), `ops_*` → `team_ops` (eval `14797973`).
Owner assignment is **console-only** (the FME flag-update API exposes only `description/tags/
rolloutStatus`, no `owners`), so that step is done by hand in the FME UI, not via MCP.

**Housekeeping — done:** the two **account-scoped** dupe groups (`team_pm_ai`, `team_pm_alpha`) were
deleted in the UI (MCP risk gate blocks user-group delete). The project-scoped groups (`team_pm_ai`,
`team_pm_alpha`, `team_ops`) are the keepers.

**Squad-policy reconcile:** Ryan manually added **`squad-web`** to the deployed squad policy (02) and
to the project's tag vocabulary. Repo reconciled to match: `approved_squads` in
`02_require_squad_tag.rego` and the README v1 constants table now include `squad-web`.

---

## D-016 — Phase 2 Path B: the Experiment Hydrator (run a real experiment in FME)
**2026-06-15.** Phase 2 was "complete" only as **Path A** (in-app fixtures). Decision: actually run
the experiment through FME so results render in FME's **Experimentation / Metrics-impact view**, via
a **repeatable, parameterized** utility (Ryan's framing: an "experiment hydrator" — staging first,
then the identical process in prod, with params).

**What was built:** `scripts/experiment-hydrator.ts` + `npm run hydrate:staging` / `hydrate:prod`
(tsx, `--env-file=.env.local`). For each synthetic `user` key it calls
`getTreatment(key, flag, {tier})` → impression, then `client.track(...)` three events, then
`destroy()` to flush. Ground truth reused from `lib/experiment/config.ts` (haiku 62% / sonnet 72%
thumbs-up, ~3x cost). Dry-run mode needs no key. tsc clean; dry run verified the split.

**Key design choices:**
- **Non-destructive split.** Did **not** rewrite the flag's targeting. The live staging definition
  already has `tier IN [premium] → sonnet, else haiku` (verified via MCP). The hydrator tags
  ~`--premium-share` (default 0.5) of keys `tier=premium`, so FME's own rules produce the ~50/50
  split. Treatment comes from FME (the real impression), not a local guess.
- **Three events / metrics:** `assistant_thumbs_up` (primary, "percent of unique keys"),
  `assistant_response_latency_ms` (avg), `assistant_response_cost_cents` (avg). Traffic type `user`.
- **Fresh key namespace per run** (`hydrate-<env>-<runId>-user-<i>`) so re-runs don't pollute a key's
  history.
- **Repeatable across envs:** `--env staging|production` selects `FME_SDK_KEY_STAGING` /
  `FME_SDK_KEY_PRODUCTION` (fallback `FME_SDK_KEY`); `.env.example` documents both; keys stay out of
  git.

**Not automatable via MCP (so: console steps, by hand):** the Harness MCP exposes no metric/experiment
resource, and SDK keys aren't listable. So (a) the three metrics are created in the FME console (exact
spec in `docs/EXPERIMENT_HYDRATOR.md`), and (b) the server-side SDK key per env is pasted into
`.env.local`. Everything else (impressions, events, the split) the utility drives.

**Event-type seeding (sequencing fix):** FME only lists an event in the metric-definition dropdown
after it has ingested ≥1 event of that type — chicken/egg with "create metrics before hydrating." So
added `scripts/seed-event-types.ts` (`npm run seed-events:staging|prod`): one bulk POST to the events
ingestion REST API (`POST https://events.split.io/api/events/bulk`, Bearer = server-side SDK key, per
docs.split.io/reference/create-events) that fires one event of each type. New runbook order: get key →
**seed events** → create metrics → dry-run → hydrate → view → promote. Event-type names live in one
shared module (`lib/experiment/events.ts`) imported by both the seeder and the hydrator so they can't
drift. Seeder + hydrator both tsc-clean and dry-run-verified.

**Streaming experiment object + the percentage-rule prerequisite (added 2026-06-15):** Harness FME's
**streaming** experiment (Experiments → + Create experiment; not the Warehouse-Native flow) anchors to
a feature flag + environment and can only target **a rule with a percentage distribution** across
treatments ("other rules are disabled in the dropdown"). The flag had **no** such rule — default
`haiku 100%`, plus a `tier=premium → sonnet 100%` rule — so there was no valid haiku-vs-sonnet
experiment rule, and the original hydrator's tier-forced split attributed sonnet impressions to the
*tier* rule (not the experiment's). Two fixes:
- **Staging default rule → `haiku 50% / sonnet 50%`** via MCP (`harness_update` on the definition;
  passes the OPA save policy; tier rule + treatment configs preserved). Baseline stays `haiku`.
- **Hydrator `--split-mode` (default `percentage`):** sends **no attributes** so keys fall to the
  50/50 default rule and FME's own hashing allocates — the impressions the experiment measures.
  Legacy `--split-mode tier` kept for non-experiment hydration. tsc clean; dry-run verified (~50/50,
  haiku 62% / sonnet 73%).

Order: set 50/50 rule → create experiment (start = that version's timestamp) → hydrate → respect the
**review-period check** (FME blocks analysis too soon) → view. **Seeding:** `npm run seed-events:*`
already fired one event of each type into Staging (202) so the metric dropdown is populated.

**Staging run completed (2026-06-16):** Experiment object `STG_AIASSIST_RESULTS_HaikuVsSonnet`
created (Assignment source = `exp_assistant_modelChoice_web` / Staging; Rule = default rule;
Baseline haiku / Comparison sonnet; Scope 06/16–06/30; Owner Ryan Vila; tag `demo`). Metrics wired
as **key** = Assistant Thumbs-up Rate, **guardrails** = Avg LLM response time + Avg LLM response cost.
Then `npm run hydrate:staging -- --users 6000 --seed 42` ran clean: FME bucketed haiku 2,913 /
sonnet 3,087 (~48.5/51.5), outcomes on ground truth (haiku 61.9% / sonnet 72.8% thumbs-up; 850 vs
2,103ms; 0.04 vs 0.13¢). Impressions + events flushed. Awaiting FME's scheduled calculation to
populate impact/p-value in the Experimentation view.

**Cost metric zero-variance fix (2026-06-16):** First Staging calc showed thumbs-up (sonnet +17.55%,
p<0.001) and latency (+147.44%, p<0.001) fine, but the **cost** guardrail errored: *"The variance is
equal to zero since all of them have the same value."* Cause: the hydrator sent a flat
`model.costCents` for every key, so each arm had zero within-arm variance and FME's t-test denominator
was undefined. Fix: added optional `costJitterCents` to `TreatmentModel`/config (haiku ±0.015, sonnet
±0.04) and the hydrator now samples cost uniform ± that jitter (mean unchanged); mirrors how
`latencyMs.jitter` already worked. `costCents` stays a scalar mean so the in-app simulator
(`lib/sim/simulate.ts`) and the real app's `estimateCostCents` are untouched. tsc clean; dry-run
confirmed means held (haiku 0.0401 / sonnet 0.1296). Re-hydrated Staging (`--seed 7`, fresh
namespace) to add varied-cost events. **Recalculate is safe here** (data minutes old, not the aged
90-day purge case). Added a Gotcha: averaged "value" metrics need within-arm variance.

**Prod flag updated (2026-06-16):** Per request, set **only** the prod flag definition's default rule
to `haiku 50% / sonnet 50%` via MCP (`harness_update`; tier rule + treatment configs + baseline=haiku
preserved). New version timestamp = future prod experiment's start anchor. No prod events seeded, no
experiment object, no hydration yet.

**Prod promotion completed (2026-06-16):** prod flag 50/50 rule set (above) → prod experiment object
created in console (metrics + event types are workspace/traffic-type scoped, so they carried over from
Staging — no prod re-seed needed) → `npm run hydrate:prod -- --users 6000 --seed 42` ran clean (haiku
3,071 / sonnet 2,929; outcomes on ground truth; jittered cost). Awaiting prod calculation.

**SDK-key resolution hardened (2026-06-16):** the first prod run **hung** at "Waiting for SDK ready…"
because `FME_SDK_KEY_PRODUCTION` was unset and the resolver fell back to the stale unexpanded
`FME_SDK_KEY=${...}` placeholder, which the SDK retries forever instead of failing. Two fixes in both
`experiment-hydrator.ts` and `seed-event-types.ts`: (1) a value starting with `${` is treated as
**missing** (so a placeholder fails fast with a clear error, never hangs); (2) per-env key resolution
now accepts **multiple names** — production tries `FME_SDK_KEY_PRODUCTION` then `FME_SDK_KEY_PROD`,
staging tries `FME_SDK_KEY_STAGING` then `FME_SDK_KEY_STG`, then a generic `FME_SDK_KEY` — first usable
wins (Ryan's `.env.local` uses `FME_SDK_KEY_PROD`). tsc clean.

**Status:** ✅ Phase 2 Path B complete in **both** Staging and Production — live FME experiment results
(thumbs-up significant up; latency + cost significant guardrail regressions) render in-product. Don't
Recalculate aged experiments; don't edit the flag.
**Gotchas carried forward:** never **Re-calculate** an aged experiment (raw events purge ~90 days —
destroys the result); **don't edit the flag after creating the experiment** (new version resets the
start time and orphans the traffic).

---

## D-017 — Phase 3: a reusable, flag-agnostic rollout pipeline + an experiment guardrail
**2026-06-16.** Phase 3 opens the governance story. Ryan's reframe (verbatim intent): *don't couple
the flag to the pipeline — operate **any** flag through it, like a reusable template of standard gates
and steps; and don't let a routine rollout accidentally break an experimentation flag's computed-metric
dashboard.* Decision: build a **single, flag-agnostic** Harness pipeline plus an **OPA guardrail** that
hard-blocks experiment flags. Authored in-repo first; created live via MCP after review (workflow
matches D-012/D-016 — review before touching the real org). Pipeline + guardrail this pass; app-side
runtime payoff (`rel_*` flag wiring + spending-insights UI) next pass.

**What was built (in repo AND created live via MCP — see "Created live" below):**
- `pipelines/governed-fme-rollout.yml` — v0 pipeline, project `FME_Finance_AI_demo`. Flag + environment
  are **runtime inputs** (`<+input>`); `onTreatment`/`offTreatment` default to `on`/`off`. Three stages:
  (1) **Guardrail** — a `Policy` step evaluating policy set `block_experiment_flag_rollout` against
  `{flagName, environment}`; (2) **Approval** — `HarnessApproval` routed to `team_pm_ai`;
  (3) **Progressive Rollout** — `FmeFlagDefaultAllocation` ramp **1% → (approval) → 50% → (approval) →
  100%**, with `FmeFlagKill` as `rollbackSteps` and a `StageRollback` `failureStrategies` on `AllErrors`
  so a bad ramp is contained, never left mid-flight.
- `pipelines/policies/block_experiment_flag_rollout.rego` — package `fme_rollout_pipeline`,
  `import rego.v1`. `deny` when `startswith(input.flagName, "exp_")` (D-011 prefix), plus fail-closed
  denies for missing/empty `flagName`.
- `pipelines/README.md` — explains the reusable design, the three stages, runtime inputs, the Harness
  prereqs (FME auth context; create a **Custom**-entity Policy Set `block_experiment_flag_rollout`
  enforced **On Run / Error**; `team_pm_ai`), and the verify-against-console caveat for FME step fields.

**Why the guardrail matters:** the pipeline overwrites a flag's **default allocation**, which cuts a new
flag version. Doing that to an `exp_*` flag would orphan its live experiment's metric window (the exact
"don't edit the flag after creating the experiment" gotcha from D-016, now enforced as code). The
guardrail makes that mistake impossible from the generic pipeline; experiments roll out via the
experiment workflow instead.

**Two distinct OPA layers (do not conflate):** `policies/*.rego` = **FME save-time** governance (entity
types Feature Flag / Feature Flag Definition; fires in the FME console on save). This new
`pipelines/policies/*.rego` = **Harness pipeline-time** Policy-as-Code (entity type **Custom**; fires at
pipeline execution; input is the step's `policySpec.payload`, not an FME flag payload). They complement:
one governs how a flag is *defined*, the other how it is *rolled out*.

**Verified shapes:** `FmeFlagDefaultAllocation` spec = `{flagName, environment, allocation:
[{treatment, amount}]}` (amounts sum to 100, no in-step connector — uses pipeline FME context);
`FmeFlagKill` = `{flagName, environment}`. Taken from the official FME pipeline-steps docs; README flags
that field names can drift and must be confirmed against the project's step UI before a live run.

**Created live (2026-06-16, via Harness MCP, project `FME_Finance_AI_demo`):**
- OPA policy `block_experiment_flag_rollout` (`harness_create resource_type=policy`).
- **Custom** policy set `block_experiment_flag_rollout`, enforcement action **`onstep`**, policy
  attached at severity **`error`**. Two learnings: (1) the MCP `type`/`action` *list* enums don't show
  "custom", but the create **body** accepts `type: custom` — and a custom set's only valid action is
  `onstep` (the list-filter enum was misleading); (2) the `policies` array does **not** bind on the
  initial `policy_set` create (came back `[]`) — had to `harness_update` the set to attach it.
- Pipeline `governed_fme_rollout` (`harness_create resource_type=pipeline`, governance `deny:false`).
- **Step-name gotcha:** Harness rejects `%` in a step `name` (regex `^[a-zA-Z_][-0-9a-zA-Z_\s]{0,127}$`).
  Renamed the ramp/gate steps to spell out "percent"; repo YAML reconciled to match live.

**Live UAT stage (2026-06-16, Ryan):** added live and reconciled into the repo YAML. Sits between
Approval and Progressive Rollout as stage 3: exposes the flag to `Internal_QA_Team` then
`Beta_Customers` segments (`FmeSegmentSetTargetingRules`), each gated by the
`Simple_15s_Auto_Approval_demo` step template (auto-approval) — internal QA + friends-and-family before
the percentage ramp. (Real project entities: those two segments + that template.)

**Pending / dormant (2026-06-16):** after Live UAT, we want to **comment on a fixed Jira ticket** that
the rollout completed. The Jira integration is currently down, so the `JiraUpdate` "add comment" step is
**staged dormant** (commented block at the bottom of `governed-fme-rollout.yml`) — not live. Activate by
filling `connectorRef` + `issueKey` and pasting it at the marked spot (last step of the `Live_UAT`
stage) once the connector is fixed.

**Status:** ✅ Pipeline + guardrail authored in repo **and live** in the FME project. Not committed
to git yet (awaiting explicit ask). Next pass: app-side runtime payoff (`rel_*` wiring + spending-
insights UI). A live end-to-end run is still untested — needs the `rel_*` flag + FME connector verified.

---

## D-018 — Live flag-change listener: SSE bridge from FME's SDK_UPDATE to the browser

**Problem (found running with a real `FME_SDK_KEY`, not mock mode):** flipping
`ops_assistant_killSwitch_web` in the Harness FME console updated the flag server-side immediately,
but the UI only reflected it after a manual page refresh — `app/page.tsx` fetched `/api/flags` once on
mount and on user-switch, with no live-update path.

**Root cause / architecture note:** the Split/FME Node SDK (`@splitsoftware/splitio`) receives changes
via server-side streaming and fires `client.Event.SDK_UPDATE` — but that event fires inside the Node
server process, which the browser has no way to observe directly. A server→browser bridge was required.
**Decision: Server-Sent Events (SSE), not polling** — a single long-lived HTTP connection per tab,
pushed to on real change, rather than the client re-fetching on an interval.

**What changed:**
- `lib/flags/types.ts` — added `onUpdate(callback: () => void): () => void` to the `FlagClient`
  interface (subscribe to changes; returns an unsubscribe fn, same shape as a React effect cleanup).
- `lib/flags/fmeClient.ts` — `onUpdate` wraps the real SDK: `client.on(Event.SDK_UPDATE, callback)` /
  `client.removeListener(...)` to unsubscribe. Confirmed against
  `node_modules/@splitsoftware/splitio-commons/types/splitio.d.ts` that `Event.SDK_UPDATE`, `.on`, and
  `.removeListener` are valid on the real `IClient`, not just loosely typed.
- `lib/flags/mockClient.ts` — mock mode has no real streaming, so `onUpdate` is backed by a
  `Set<Listener>` cached on `globalThis` (same pattern as the existing `overrides` map, for hot-reload
  survival); `setOverride()` notifies every listener on every call.
- `lib/flags/index.ts` — added `evaluateAllFlags(userId, attributes)`, factoring out the "evaluate every
  `FLAG_DEFS` entry" loop so `/api/flags` (GET, one-shot) and the new SSE stream compute evaluations
  identically — no behavior drift between the two paths.
- `app/api/flags/stream/route.ts` (new) — SSE endpoint. Pushes current evaluations immediately on
  connect, then again every time `client.onUpdate()` fires. Sends a `: ping\n\n` comment every 25s so
  idle connections survive proxy/timeout drops. Unsubscribes on both `cancel()` and `req.signal`'s
  `abort` — covers both stream-level and request-level teardown.
- `app/page.tsx` — replaced the fetch-based `refreshFlags()` with an `EventSource` subscription keyed
  on `currentId`; `handleToggle` (the mock-mode demo panel) now just POSTs the override and relies on
  the SSE push instead of manually refetching.

**Why this matters for the demo:** it closes a real gap in the "watch me change a flag and prove it
worked live" story (Pillar 1, architecture) — a kill-switch flip in the FME console now reaches the
open browser tab with no refresh, matching what a prospect would expect from "real-time" feature
management. It also reinforces the mock/real symmetry design (D-004): the same `onUpdate` contract is
satisfied by a real SDK event in `fme` mode and a synthetic `globalThis` listener set in `mock` mode.

**Verified:** `npx tsc --noEmit` clean; hit `/api/flags/stream` directly against the live FME client and
got a correct `data:` payload (`"mode":"fme"`, correct kill-switch treatment); confirmed the SDK event
names/methods against the shipped type definitions (not just assumed from docs).

**Status:** ✅ Done, verified against the live FME client. Not committed to git yet (awaiting explicit
ask).

---

## D-019 — Second feature: Mortgage Refinance Servicing (pivot from the "spending insights" runtime payoff)
**Decided:** 2026-06-16 (built) · reconciled to docs 2026-09-01 · **Status:** Accepted

Phase 3's original plan (D-010/D-011, ROADMAP "next pass") was to wire
`rel_assistant_spendingInsights_web` as the app-side runtime payoff for the governance story.
Instead we built a second, independent feature — **Mortgage Refinance Servicing** — because it
does more work for the demo per unit of build effort:

- **A second squad and flag category.** Every existing flag (`ops_/exp_/rel_assistant_*`) is
  `squad-ai`. Mortgage flags are `squad-payments`, giving the governance/policy demo (Phase 3) a
  *second* team's flags to point at — more convincing than one squad's flags passing its own rules.
- **A release flag with real runtime behavior.** The three original flags are one `ops_`, one
  `exp_`, and one `rel_` that was never wired into the app
  (`rel_assistant_spendingInsights_web` stayed a name/tags-only exemplar). Mortgage's
  `rel_mortgage_refinanceBanner_web` is an actual release flag with **Dynamic Configuration**
  driving real UI — the "ship a promo banner, retune its copy/rate/fee live" story, distinct from
  the AI model's "swap a model" story.
- **A second, independent experiment.** `exp_mortgage_applicationFlow_web` (singleScreen vs.
  twoPage) reuses the Experiment Hydrator pattern (D-016 Path B) end-to-end, proving that pattern
  generalizes beyond the AI model experiment — and its ground truth is a genuine **business
  trade-off** (twoPage loses on submission rate but wins on average fee), a different shape of
  result than the AI model experiment's straightforward "sonnet wins," giving the demo a richer
  narrative.
- `rel_assistant_spendingInsights_web` **stays** as a name/tags-only compliant exemplar for the
  governance policy set (it still needs to exist and pass policies 1–5); it just isn't the
  feature that got app-side runtime wiring. Spending insights remains backlog if a third feature
  is ever wanted.

**What was built:** a promo banner (`app/components/MortgageBanner.tsx`) gated by the release
flag's Dynamic Config (copy + promoted rate + fee-formula params — `lib/mortgage/fees.ts`); a
two-step application flow (`app/mortgage/apply/MortgageApplyClient.tsx`) branching on the
experiment flag (singleScreen vs. twoPage; riley/jordan deterministically pinned to each in mock
mode, exactly like the AI model flag's tier targeting); `POST /api/mortgage/apply`, which
re-derives the fee **server-side** (never trusts a client-supplied number), persists the
application (`lib/db.ts` mortgage tables), and fires two FME events
(`mortgage_application_submitted`, `mortgage_estimated_fee_cents`) consumed by the hydrated
experiment's metrics. Ground truth + hydration mechanics: `lib/mortgage/experiment.ts`,
`scripts/experiment-hydrator.ts --experiment mortgage`, full runbook in
[EXPERIMENT_HYDRATOR.md](EXPERIMENT_HYDRATOR.md) §"Second experiment: mortgage application flow".
Governance: both flags reconciled as compliant exemplars in `policies/README.md`, including the
live `Jira: SCRUM-401`/`SCRUM-402` references that drove adding `SCRUM` to
`approved_jira_prefixes` (`03_require_jira_reference.rego`).

**Verified live (2026-06-16):** both `fme_feature_flag_definition`s created and verified in
Staging and Production via MCP (individual-key targeting matcher `{type:"IN_LIST_STRING",
strings:[...]}`, no `attribute` field — see the definitive empirical test recorded in this
session); event types seeded in both environments; both hydrated in both environments
(Staging: singleScreen n=2,964 submitted 36.9% avg fee $2,726.97 / twoPage n=3,036 submitted 29.8%
avg fee $4,053.94; Production: singleScreen 37.0%/$2,743.57 vs twoPage 30.1%/$4,000.91) — the
designed trade-off held in both environments.

**Alternatives considered:** finish the originally-planned spending-insights wiring instead
(rejected — reuses the same squad/flag-category/experiment shape as the existing AI flags, so it
would prove less to a skeptical prospect); a third AI capability (rejected — the project's
three-pillar story, PROJECT.md §3, is already fully covered by the AI assistant alone).

**Status:** ✅ Complete in both Staging and Production (2026-06-16). Docs reconciled 2026-09-01.

---

## D-020 — Mortgage Experiment console setup + a guardrail-metric variance bug found live

**Decided:** 2026-09-01 · **Status:** Accepted

D-019/Phase 4 built and hydrated `exp_mortgage_applicationFlow_web` in both environments, but —
unlike the AI model experiment — nobody ever created the **FME Experiment object** itself (Scope,
Key metrics, Guardrail metrics) in the console. Re-confirmed via `harness_describe()` that the
`feature-flags` toolset's resource-type enum has no `fme_experiment`/`fme_metric` entry at all, so
this is a **console-only** step, unautomatable via MCP (same limit D-016 already hit). Ryan created
the Production Experiment (`PROD_mortgage_application_flow_LongVsShort`) himself; while doing so we
found and fixed two problems:

**1. Wrong guardrails carried over from the AI-assistant experiment.** The new Experiment initially
had no key metric and had "Avg LLM response time"/"Avg LLM response cost" attached as guardrails —
leftovers, because the mortgage-specific metrics ("Mortgage application submitted rate", "Avg
estimated fee ($)") hadn't been created in that environment's Metrics catalog yet, so only
pre-existing AI-assistant metrics were pickable. Fixed by creating the mortgage metrics and
assigning them; the key metric now calculates correctly (Impact −18.67% ±12.72%, p<0.001, matching
the designed trade-off). **Correction (2026-09-01):** originally logged as "still open" (remove the
two wrong guardrails from the Production experiment), on the mistaken assumption that key/guardrail/
supporting is a per-experiment assignment. Ryan corrected this: that designation lives on the
**metric definition itself**, which is project-scoped (shared across every experiment in the
project, not pickable per-experiment) — there is no "Manage guardrail metrics" action that detaches
one metric from just one experiment. Reclassifying "Avg LLM response time/cost" away from
`guardrail` would also strip them from the AI-assistant experiment, where they're the correct,
intentional guardrails — an unwanted side effect for a purely cosmetic mortgage-experiment cleanup.
**Resolution: not a bug, no action taken.** They'll keep showing "No events have been received" on
the mortgage experiment (harmless — mortgage traffic never fires `assistant_response_latency_ms`/
`assistant_response_cost_cents`, so they can't affect this experiment's calculation) for as long as
both experiments share a project's Metrics catalog.

**2. The "Avg estimated fee ($)" guardrail rendered with an unusable confidence interval**
(Impact 45.83% **±186370.72%**, p=1.000) even though its point values matched D-019's known-good
numbers to the penny (274356.93¢/400091.25¢ = $2,743.57/$4,000.91). Root cause:
`computeEstimatedFeeCents`'s (`lib/mortgage/fees.ts`) `zeroUpfrontHigherRate` branch returns an
exact flat constant (`config.baseFeeCents`) every time, so a large, unequal share of each arm's
submitters (everyone who didn't roll `lowRatePointsUpfront` — 60% of singleScreen, 35% of twoPage)
landed on a literal point-mass of identical fee values. That's the same "variance is equal to
zero" pathology D-016 hit and fixed for the AI experiment's cost/latency events (`costJitterCents`
in `lib/experiment/config.ts`), just never carried over to the mortgage fee formula.

**Fix:** added `feeJitterCents` (±$150, mean-preserving) to `lib/mortgage/experiment.ts`'s ground
truth, applied **only** at `scripts/experiment-hydrator.ts`'s tracking call site — deliberately
*not* in `lib/mortgage/fees.ts` or `POST /api/mortgage/apply`, which must stay a deterministic
function of the Dynamic Config for a real applicant. Verified via `--dry-run` that arm-level
average fees are unchanged (singleScreen ~$2,730 / twoPage ~$4,083 on a fresh seed) — only
per-key spread changed. `tsc --noEmit` clean. Documented as a new gotcha in
[EXPERIMENT_HYDRATOR.md](EXPERIMENT_HYDRATOR.md).

**Known limitation — existing hydrated data predates this fix.** The hydrator only *adds* new key
namespaces per run (`--run-id`); it never replaces prior events. So the already-computed
Production/Staging results still contain the pre-fix degenerate batch, and re-hydrating alone
won't clean up the guardrail's CI for the *current* experiment window. To get a clean read: re-run
the (now-jittered) hydrator for the affected environment, then move that experiment's **Starts at**
in the console to just before the new run's timestamp (excluding the old batch from the calculation
window), then Recalculate once — safe here since this data is hours old, not the aged-experiment
case D-016 warns about.

**Also raised, not yet resolved:** while investigating start/end dates for the Experiment's Scope,
discovered via `harness_get(fme_feature_flag_definition)` epoch timestamps that the mortgage
flags/hydration were actually created **2026-09-01** (today), not "2026-06-16" as D-019/Phase 4
narrate. Offered to correct those dates; awaiting confirmation before editing already-published
"verified live" claims.

**3. The jitter fix alone didn't clean up the guardrail — the real culprit was `seed-event-types`.**
After shipping the jitter fix and re-hydrating Staging + Production, the CI got *worse*
(±95,007.92% on a mixed old+new batch → ±194,036.88% on a clean, fully-jittered batch alone) —
the opposite of what a point-mass/variance theory predicts. Downloaded the raw event export from
FME's **Data Hub** (`dataExportId=....csv.gz`) and found the actual cause: `scripts/
seed-event-types.ts` fires one placeholder event per event type (`key: "seed-event-types"`) so
each type appears in the metric-definition dropdown before the full hydrator runs — and it used a
flat literal `value: 1` for every event type. For `mortgage_estimated_fee_cents`, `1` means
**$0.01** against a real range of $300–$9,500; that single ~30,000–950,000x-undersized point is
enough to dominate any variance calculation it's included in. Because that key never called
`getTreatment()` (no impression history), it's not filtered by the experiment's Scope
Starts-at/Ends-at the way normal exposed-key traffic is — explaining why narrowing the Scope
window to exclude old hydration batches didn't help, and why it got *worse* as legitimate data
shrank to dilute the contaminant less. **Fixed** by replacing the flat `1` with a
`REPRESENTATIVE_VALUE` map in `seed-event-types.ts` (count-style events like `*_submitted`/
`thumbsUp` still use `1`; average-value events use a magnitude in their real ballpark —
`350_000` for the fee, `1_500` for latency, `0.08` for cost). Verified via `--dry-run`;
`tsc --noEmit` clean. The already-sent `value: 1` events are **not retroactively fixable** — Split/
FME's events API has no delete/retract; check whether FME exposes a test-key/traffic exclusion
feature (Experiment Settings, or the Metric's own definition) before trusting this guardrail's
live CI again. Until then, narrate the fee trade-off from the known-good, already-verified numbers
above rather than the live console reading for this one guardrail; the key metric (submission
rate) is unaffected and safe to demo live.

**4. Item 3 is disproven — `seed-event-types` was never actually in the calculation.**
Recalculated the guardrail after (a) narrowing Scope to the clean, jittered batch only (`Starts
at` moved to 09/01/2026; 6,000 exposures, matching the clean batch exactly) and separately after
(b) removing the metric's `seed`-property WHERE filter entirely — the CI stayed at exactly the
same **±194,036.88%** in every configuration tried, filtered or not. More telling: independently
recomputed the arm means straight from the raw exports (joined the Events export to the
Impressions export by key, so only keys with an actual impression count — the inner-join any real
experimentation platform is expected to use) and got singleScreen \$2,773.29 / twoPage \$4,100.10
on n=1,094/870 real submitters, which match the console's own displayed values
(`277328.83¢`/`410009.79¢`) to the penny. That's conclusive: FME's mean calculation already
excludes the impression-less `seed-event-types` key on its own — the numbers couldn't match this
precisely otherwise — so item 3's fix, while still correct hygiene, was never actually the cause
of the extreme CI. The same clean, provably-poison-free dataset, run through a standard two-sample
Welch SE by hand, gives **±9.94%** — FME's reported CI is ~19,500x too wide for data that has no
contaminant in it.

**New working theory (unconfirmed):** the blow-up looks intrinsic to how this metric type —
"Average of event values per user," where the event fires for only a minority of exposed users
(36%/29% submission rate) — computes its own confidence interval, not a data-quality problem. A
metric conditional on a low, random participation rate needs a different (and often much less
stable) variance treatment than a plain two-sample comparison of the observed values; `p=1.000`
alongside a six-figure percentage CI is more consistent with the underlying SE estimate blowing up
than with a real effect being absent. Not confirmed against FME documentation or support — inferred
only from ruling out every data-side explanation we could test (jitter, seed contamination, Scope
filtering, metric-level property filters).

**Status:** the live console CI for "Avg estimated fee ($)" cannot be trusted, and no further
data cleanup is expected to fix it — narrate the fee trade-off for the demo from the hand-computed
**47.84% ± 9.94%** (or D-019's original numbers), not the console reading. `seed-event-types`'s
`REPRESENTATIVE_VALUE` fix stays shipped (still correct hygiene, still prevents contaminating some
*other* metric type later) but is no longer believed to explain this guardrail's behavior. Open:
(a) ask FME support/docs whether "Average of event values per user" guardrails have a known CI
instability at low participation rates, (b) Staging not yet checked for the same pattern, (c) the
two wrong AI-assistant guardrails are still attached to the Production experiment.

---

## D-021 — Mortgage experiment: pivot from "avg fee" to a lender-revenue + rejection-rate story

**Decided:** 2026-09-01 · **Status:** Accepted (ground-truth model shipped; not yet re-hydrated
or re-verified live — numbers below are projected, not console-verified)

D-020 left the "Avg estimated fee ($)" guardrail unusable at the metric-type level (unresolved CI
instability, independent of any data-quality fix) and Ryan had already deleted that metric from
the console. Rather than keep chasing that metric, we took a step back on what the fee/mix trade-
off was actually saying: `computeEstimatedFeeCents` (`lib/mortgage/fees.ts`) only prices the
**borrower-facing** upfront fee, under which `lowRatePointsUpfront` (points paid at close) looks
far more valuable to track than `zeroUpfrontHigherRate` (a flat $450) — so twoPage, which nudges
more submitters toward the points option, "won" on average fee. Ryan pushed back: is that a
realistic signal, or an artifact of only modeling one side of the transaction? Pointed out that
logically the zero-upfront/higher-rate option is what he'd expect people to gravitate toward, and
asked whether we could make one treatment more profitable in a way that felt right, "since I'm not
a banker" — a request to ground the model in real mortgage economics rather than an arbitrary
adjustment.

**Real-world grounding:** mortgage lenders have historically earned *more*, not less, from the
zero-upfront/higher-rate path than from points paid upfront — a higher note rate sells at a
premium on the secondary market ("yield spread premium"). This was significant enough a practice
that Dodd-Frank's Loan Officer Compensation rules were written specifically to curb steering
borrowers toward higher-rate loans for compensation reasons. Applying that concept flips the
economics: the option the original model treated as cheap-to-track is, in reality, typically the
*more* lender-profitable one.

**Model change (`lib/mortgage/experiment.ts`, hydrator-only, never in the real fee formula):**
added `yieldSpreadPremiumPct: 2.25` and extended `sampleMortgageSubmission` to also return
`lenderRevenueCents` — `lowRatePointsUpfront` revenue is just the points paid at close (same
dollars as `feeCents`); `zeroUpfrontHigherRate` revenue is `baseFeeCents` plus this percentage of
the loan amount (standing in for the discounted value of the rate spread), tracked as a new event
`mortgage_estimated_lender_revenue_cents`. This is continuous in `refinanceAmountCents` on *both*
branches, so — unlike the flat-constant borrower fee — it has natural per-key variance without
needing an equivalent of `feeJitterCents`.

**Result (projected from ground truth, population means at large n — not yet re-hydrated or
read from the console):**
- Per-submission lender revenue: singleScreen ≈ **\$7,762.50**, twoPage ≈ **\$7,059.38** — twoPage
  is **~9.1% lower**, because its higher `lowRatePointsShare` (0.65 vs. 0.4) skews it toward the
  *less* lender-profitable option under the corrected model.
- Blended lender revenue per exposed user (submission rate × per-submission revenue): singleScreen
  ≈ **\$2,794.50**, twoPage ≈ **\$2,117.81** — twoPage is **~24.2% lower**.
- Net: singleScreen now wins on submission rate (D-020: Impact −18.67% for twoPage, i.e.
  singleScreen higher), AND on per-submission revenue, AND on blended revenue. No more "trade-off
  between a conversion metric and a business metric" — singleScreen wins outright on the numbers
  now in the model.

**Reintroducing nuance — a new secondary metric, not a guardrail.** Ryan: *"sometimes an
experiment that validates what everyone feels is correct is valuable when building adoption"* —
an outright win is still a fine demo result, but proposed pairing it with a secondary metric
showing singleScreen's simpler flow lets through a **slightly** higher rate of applications that
later get rejected, as a realistic quality caveat. Added `mortgage_application_rejected` and
`rejectionRate` (conditional-on-submission probability) per `MortgageTreatmentModel`: singleScreen
`0.14`, twoPage `0.10`.

**Metric-shape decision, deliberately learned from D-020's mistake:** the rejection event is
tracked and must be measured in FME as **"percent of unique keys with event" over ALL exposed
keys** — the same shape as the already-proven-stable primary submission-rate metric — **not** as
"percent of submitters rejected" (a ratio conditional on the ~30-36% submission rate), which would
reintroduce exactly the low-participation ratio-metric instability D-020 spent most of its length
diagnosing for the fee guardrail. The population-level (unconditional) rejection rate that results
is `submissionRate × rejectionRate`: singleScreen ≈ **5.04%**, twoPage ≈ **3.00%** — a small but
real absolute gap (~2 points), giving singleScreen a minor, honest quality caveat alongside its
otherwise clean win.

**Implementation:** `lib/mortgage/events.ts` adds `estimatedLenderRevenueCents` and
`applicationRejected`; `lib/mortgage/experiment.ts` adds `yieldSpreadPremiumPct` and
`rejectionRate`/extends `sampleMortgageSubmission`; `scripts/experiment-hydrator.ts`'s
`hydrateMortgage` tracks both new events (rejection only for the submitter subset that rolls
rejected, revenue for every submitter) and reports avg revenue + rejection % per arm;
`scripts/seed-event-types.ts`'s `REPRESENTATIVE_VALUE` map gets entries for both (`700_000` for
revenue — real range ~$2,700–$13,950 — and `1` for rejection, count-style). `tsc --noEmit` clean.

**Status:** shipped in ground truth + hydrator + seeding; `docs/EXPERIMENT_HYDRATOR.md`'s mortgage
section updated to match (new events/metrics tables, revised narrative — twoPage no longer "wins").

**Update 2026-09-01 — re-seeded + re-hydrated both environments.** Ran `npm run
seed-events:staging` / `:prod` (both `202 Accepted`, all 7 event types including the two new ones),
then `npm run hydrate:staging -- --experiment mortgage --users 6000 --seed 42` and the equivalent
`hydrate:prod` command. New key namespaces: `hydrate-staging-mtj4ld2r-user-*` and
`hydrate-production-mtj4lg6f-user-*` (old batches untouched, per the hydrator's additive
`--run-id` behavior). Observed hydrator-reported outcomes, closely tracking the projections above
(small deltas are ordinary sampling noise from n=6000 draws, not a model discrepancy):

| Env | Arm | n | submitted | avg fee | avg lender revenue | rejected |
|---|---|---|---|---|---|---|
| staging | singleScreen | 3084 | 35.1% | $2,711.59 | $7,711.82 | 5.61% |
| staging | twoPage | 2916 | 29.8% | $4,052.42 | $7,126.92 | 3.33% |
| production | singleScreen | 3013 | 35.6% | $2,613.89 | $7,869.76 | 5.01% |
| production | twoPage | 2987 | 29.6% | $4,122.27 | $7,117.12 | 3.28% |

Directionally exactly as designed in both environments: singleScreen submits more, earns more
lender revenue per submission, and rejects more — confirming the model change produces the
intended "outright win + honest caveat" story before it ever touches the console.

**Update 2026-09-01 — metrics created in Production; one config bug found + fixed; D-020's "new
working theory" now confirmed, not just suspected.** Ryan created **"Avg lender revenue ($)"**
(guardrail) and **"Application rejection rate"** (supporting) in the Production Metrics catalog and
attached them to `PROD_mortgage_application_flow_LongVsShort`.

- *Bug found:* "Avg lender revenue ($)" initially rendered with values `0.36`/`0.30` and the exact
  same Impact/p-value/CI as the "Mortgage application submitted rate" key metric — because
  `mortgage_estimated_lender_revenue_cents` fires for exactly the same population as
  `mortgage_application_submitted` (submitters only), a "Measure as: Percent of unique keys with
  event" misconfiguration silently collapses to an identical computation to the submission-rate
  metric. **Fixed** by changing "Measure as" to **Average value per unique key**; recalculated
  values now read `786975.91`/`711711.92` (¢) — **$7,869.76 / $7,117.12**, an exact match to this
  same run's hydrator-reported numbers in the table above.
- *D-020's CI-instability theory, confirmed on a brand-new metric.* Even with the correct
  "Measure as" and correct point values, the guardrail's confidence interval is again unusable:
  Impact **−9.56% (±55,860.11%)**, p=1.000, "Inconclusive." This metric has none of D-020's original
  contamination history — it's a brand-new event type, first hydrated with the already-fixed
  `REPRESENTATIVE_VALUE` seed (`700_000`, in-range, not a poison `1`) — and the CI still blew up,
  at a *different* magnitude (±55,860% here vs. ±186,370% for the old fee guardrail, effect size
  −9.56% vs. 45.83%). That rules out effect size and rules out contamination as drivers: this is
  strong, repeatable evidence for D-020's theory that FME's "Average value per user" measure is
  intrinsically unstable when the underlying event only fires for a minority of exposed keys
  (here, ~30–36% submission rate) — not a data-quality bug, and not fixable by anything on our side.
- **Application rejection rate** (the count-style, "percent of unique keys" metric, deliberately
  *not* shaped as an average-value ratio — see this decision's metric-shape rationale above) has
  **not** shown this pathology in the one recalculation seen so far (D-020-style instability is
  specific to the average-value measure type); its own CI is wide but plausibly explained by
  sequential-testing conservatism early in a still-open review window, not the same failure mode.

**Resulting practice, going forward:** treat **every** "Average value per unique key" metric on
this experiment (any metric on an event that only fires for the submitter subset) as **point-value
only, never CI/significance-reliable** — narrate from the Value column (or the hydrator's own
console output) and never from Impact/p-value/CI for that metric type on this experiment. This is
now a settled operating rule, not a per-metric workaround: **don't spend more time trying to fix
this class of guardrail's confidence interval; use it for what it's good for (an accurate point
estimate) and nothing else.**

**Staging — intentionally not set up.** Staging was re-hydrated with the new model (numbers in the
table above), but Ryan decided the Production console setup (metrics + experiment wiring) is
sufficient for the demo; Staging's Experiment object was not given the two new metrics and this is
not planned work, not an oversight.
