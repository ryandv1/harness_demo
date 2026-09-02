# Experiment Hydrator — running a real experiment in FME

> **What this is:** Phase 2 **Path B**. Path A (the in-app dashboard) renders committed
> fixtures and always works with no key. Path B pushes **real impressions + events** into
> Harness FME so the result appears inside **FME's Experimentation / Metrics-impact view** —
> the "we didn't just ship it, we measured it" beat, shown in the actual product.

The utility is **repeatable and parameterized**: run it in Staging first, get everything
right, then run the identical process in Production. It is a maintainer/demo tool — cloners
never need it (the app runs in mock mode with no key).

---

## How FME computes the result (the three moving parts)

1. **The split.** A streaming FME experiment must target **a rule with a percentage
   distribution** across treatments. So the flag's **default rule** is set to **haiku 50% /
   sonnet 50%** (done in Staging via MCP, D-016). In the default **`--split-mode percentage`**
   the hydrator sends **no attributes**, so every key falls to that 50/50 default rule and FME's
   own hashing assigns the treatment — exactly the impressions the experiment measures. Each
   `getTreatment` call emits an **impression** (the record of who saw which treatment).
   *(Legacy `--split-mode tier` instead tags ~`--premium-share` of keys `tier=premium` to split
   via the tier rule — do NOT use this for a formal experiment, since those impressions attribute
   to the tier rule, not the experiment's rule.)*
2. **The events.** For each user the hydrator tracks three events on traffic type `user`,
   with outcomes drawn from the ground truth in `lib/experiment/config.ts`:
   | Event type | When | Value |
   |---|---|---|
   | `assistant_thumbs_up` | only when the user "converts" (Bernoulli draw) | `1` |
   | `assistant_response_latency_ms` | every response | sampled ms |
   | `assistant_response_cost_cents` | every response | per-response cost |
3. **The metrics.** You define three metrics in the FME console (below). FME attributes each
   event to the treatment that key was shown and computes per-treatment impact + significance.

---

## Step 1 — Get a server-side SDK key (per environment)

FME console → **Admin Settings → API keys** (or the environment's SDK keys). Copy the
**server-side SDK key** for the environment you're hydrating. Put it in `.env.local`
(gitignored — never commit):

```
FME_SDK_KEY_STAGING=sdk_xxx_staging
FME_SDK_KEY_PRODUCTION=sdk_xxx_prod
```

> These are **SDK keys**, not the MCP/Admin API key. They're write-only telemetry keys; still,
> keep them out of git.

## Step 2 — Seed the event types (so they appear in the metric dropdown)

FME only offers an event in the metric-definition dropdown once it has seen at least one
event of that type. Fire one of each first (single bulk POST to the events ingestion API —
see https://docs.split.io/reference/create-events):

```
# preview the payload, no key needed:
npx tsx scripts/seed-event-types.ts --env staging --dry-run
# send it:
npm run seed-events:staging
```

Expects `202 Accepted`. (A `403` means the wrong key — use the environment's **server-side
SDK key**, not the Admin/MCP key.) Wait ~a minute, then proceed.

## Step 3 — Create the three metrics in the FME console

FME console → **Metrics → Create metric**. Workspace `FME_Finance_AI_demo`, traffic type
`user`. All three event types from Step 2 should now appear in the event dropdown. Create
each one once; metrics are workspace + traffic-type scoped, so they automatically appear on
the flag's results view.

| Metric name | Event (key) | "Measure as" | Desired impact |
|---|---|---|---|
| **Assistant thumbs-up rate** | `assistant_thumbs_up` | **Percent of unique keys** with the event | Increase |
| **Avg response latency (ms)** | `assistant_response_latency_ms` | **Average value** per unique key | Decrease |
| **Avg response cost (¢)** | `assistant_response_cost_cents` | **Average value** per unique key | Decrease |

Set the thumbs-up metric as the **primary/key metric**; latency and cost are guardrails.

## Step 4 — Create the experiment object (streaming)

The flag's **default rule is already a 50/50 haiku/sonnet percentage split** in Staging (set
via MCP, D-016) — that's the prerequisite, because an experiment can only target a rule with a
percentage distribution.

Console → **Experiments → + Create experiment**:
- **Name** the experiment; in **Assignment Source** pick flag `exp_assistant_modelChoice_web`
  + **Staging** environment.
- **Baseline** pre-fills to `haiku` (the flag's default treatment); **comparison** to `sonnet`.
- **Targeting rule** → select the **default rule** (the 50/50 one). The `tier=premium` rule is
  100/0, so it won't be a valid experiment rule.
- **Key metric** = Assistant thumbs-up rate; **supporting** = latency + cost.
- Optional: hypothesis (e.g. *"Sonnet raises thumbs-up rate vs Haiku, accepting higher latency
  and cost"*), owners, tags. The **entry-event filter** is only settable here at creation.
- Start time pre-fills to the flag's current-version timestamp; end time to your default
  **review period**.

> **Don't edit the flag after this point** — any definition change starts a new version and
> resets the experiment's start time, orphaning the traffic you're about to send.

## Step 5 — Dry run (no key needed) to sanity-check params

```
npx tsx scripts/experiment-hydrator.ts --env staging --dry-run --users 6000 --seed 42
```

Default `--split-mode percentage` (no attributes → FME's 50/50 default rule allocates).
Confirms the allocation and the simulated outcomes (haiku ~62% / sonnet ~72%) before you
send anything. (The dry-run split is a local approximation; live runs use FME's bucketing.)

## Step 6 — Hydrate Staging

```
npm run hydrate:staging -- --users 6000 --seed 42
```

Reads `FME_SDK_KEY_STAGING` from `.env.local`, waits for SDK ready, sends impressions +
events, then `destroy()` flushes. Each run uses a fresh key namespace
(`hydrate-staging-<runId>-user-<i>`) so re-runs don't pollute prior keys.

## Step 7 — View the result in FME

Console → the flag `exp_assistant_modelChoice_web` → **Metrics impact / Experimentation**
tab, in the environment you hydrated. Allow a few minutes for ingestion; FME calculates on a
schedule (you can refresh/calculate). You should see **sonnet beating haiku on thumbs-up rate
(significant)** while **latency and cost are higher** — the trade-off story, now in-product.

## Step 8 — Promote to Production

Once Staging looks right, repeat the same process in Production:
1. Set the **prod** flag's default rule to **50/50 haiku/sonnet** (the prod definition still has
   the old `haiku 100%` default — change it the same way, in the UI or via MCP).
2. Seed events into prod if the dropdown doesn't list them yet.
3. Create the experiment object on the flag in the **Production** environment.
4. Hydrate.

```
npm run seed-events:prod          # only if the types aren't showing in prod
npm run hydrate:prod -- --users 6000 --seed 42
```

---

## Second experiment: mortgage application flow

The same hydrator drives a **second, independent** experiment via `--experiment mortgage`
(default is `--experiment assistant`, everything above). It targets
`exp_mortgage_applicationFlow_web` (singleScreen vs. twoPage) instead of the AI model flag.
Same mechanics — synthetic keys, no attributes → the flag's 50/50 default rule, `destroy()`
flushes — but two differences:

- **Riley/Jordan are unaffected.** Their individual-key targeting rules only match the literal
  keys `riley`/`jordan`; every synthetic `hydrate-...` key falls through to the default rule.
- **Four events**, and all but the primary conversion event only fire for the submitter subset
  (not every exposure) — mirroring `app/api/mortgage/apply/route.ts`'s real behavior (events only
  fire on actual submission). Ground truth lives in `lib/mortgage/experiment.ts`. **Revised
  narrative (D-021 — supersedes the original "twoPage wins on fee" story):** singleScreen wins
  outright. It converts more (~36% vs ~30%) AND, once lender economics are modeled with a realistic
  yield-spread-premium (real mortgage lenders have historically earned *more* from the
  zero-upfront/higher-rate option than from points paid upfront — significant enough a practice
  that Dodd-Frank's Loan Officer Compensation rules were written to curb it), earns *more* revenue
  per submission too — because twoPage's guided flow nudges submitters toward the *less*
  lender-profitable `lowRatePointsUpfront` option. A secondary metric (rejection rate) reintroduces
  a small, honest trade-off: singleScreen's simpler flow lets through a slightly higher rate of
  applications that are later rejected. Borrower-facing fees are still computed with the real
  `lib/mortgage/fees.ts` formula (fed by the banner flag's live "on" Dynamic Config), so simulated
  fees match production math exactly; lender revenue and rejection are hydrator-only concepts that
  never appear in the real `/api/mortgage/apply` route.

| Event type | When | Value |
|---|---|---|
| `mortgage_application_submitted` | only for simulated submitters | `1` |
| `mortgage_estimated_fee_cents` | only for simulated submitters | computed borrower-facing fee, in cents |
| `mortgage_estimated_lender_revenue_cents` | only for simulated submitters | computed lender revenue (yield-spread-premium model, D-021), in cents |
| `mortgage_application_rejected` | only for the subset of submitters who roll "rejected" | `1` |

Metrics to create in the FME console (same Step 3 pattern, traffic type `user`):

| Metric name | Event (key) | "Measure as" | Desired impact |
|---|---|---|---|
| **Mortgage application submitted rate** | `mortgage_application_submitted` | **Percent of unique keys** with the event | Increase |
| **Avg lender revenue ($)** | `mortgage_estimated_lender_revenue_cents` | **Average value** per unique key | Increase (business/guardrail — track, don't just chase the primary metric) |
| **Application rejection rate** | `mortgage_application_rejected` | **Percent of unique keys** with the event | Decrease (secondary) |

> **Any "Average value per unique key" metric on this experiment is point-value-only — never trust
> its Impact/CI/p-value.** D-020 found "Avg estimated fee ($)" rendered an unusable confidence
> interval at this experiment's submission rate (~30-36%). D-021 then created **"Avg lender
> revenue ($)"** as a brand-new metric — no contamination history at all — and hit the exact same
> pathology (Impact −9.56% ±55,860.11%, p=1.000) at a *different* effect size and magnitude than
> the fee guardrail's. Two independent metrics, two different magnitudes, same failure: this is
> conclusive that FME's "Average value per user" measure is intrinsically unstable whenever the
> underlying event only fires for a minority of exposed keys — not a data-quality bug, not
> something a fix on our side can address. **Operating rule:** don't create another metric of this
> shape on this experiment expecting a trustworthy live significance read; use its Value column (or
> the hydrator's own `--dry-run`/console log output) for the point estimate and narrate the
> business story from that, same as `mortgage_estimated_fee_cents` before it. This is *why*
> **Application rejection rate** is deliberately shaped as "percent of unique keys" (same measure
> type as the primary, proven stable) rather than "percent of submitters rejected" or any other
> average-value ratio — it's not a style preference, it's the only metric shape on this experiment
> that FME can render a usable CI for.

All four event types are already seeded (Step 2 above seeds **all** event types — assistant and
mortgage — in one bulk POST). Experiment object setup mirrors Step 4, but pick flag
`exp_mortgage_applicationFlow_web`, baseline `singleScreen`, comparison `twoPage`, targeting
the flag's default rule (50/50) — **not** the riley/jordan individual-key rules.

```
# dry run (no key needed):
npx tsx scripts/experiment-hydrator.ts --env staging --experiment mortgage --dry-run --users 6000 --seed 42
# hydrate:
npm run hydrate:staging -- --experiment mortgage --users 6000 --seed 42
npm run hydrate:prod    -- --experiment mortgage --users 6000 --seed 42
```

---

## Parameters

| Flag | Default | Meaning |
|---|---|---|
| `--env` | `staging` | Selects which SDK key env var to read (`FME_SDK_KEY_STAGING`/`FME_SDK_KEY_PRODUCTION`); also labels the key namespace. |
| `--experiment` | `assistant` | `assistant` = AI model choice (haiku/sonnet, 3 events). `mortgage` = application flow (singleScreen/twoPage, 2 events, submitters only). Also switches the default `--flag`. |
| `--users` | `6000` | Synthetic users (sized above the power-analysis requirement so it reaches significance). |
| `--seed` | `42` | Reproducible outcomes. |
| `--split-mode` | `percentage` | `percentage` = no attributes; FME's 50/50 default rule allocates (**use for experiments**). `tier` = legacy; tags keys `tier=premium` to split via the tier rule (impressions attribute to that rule, not the experiment). |
| `--premium-share` | `0.5` | Only used in `--split-mode tier`: fraction tagged `tier=premium` → sonnet. |
| `--flag` | `exp_assistant_modelChoice_web` (or `exp_mortgage_applicationFlow_web` when `--experiment mortgage`) | Flag to evaluate. |
| `--traffic-type` | `user` | Must match the flag's + metrics' traffic type. |
| `--run-id` | timestamp | Key-namespace suffix; override to reproduce an exact key set. |
| `--sdk-key-env` | — | Override the env var name holding the SDK key. |
| `--dry-run` | off | Simulate allocation locally; contact nothing. |

---

## ⚠️ Gotchas

- **Never hit "Re-calculate" on an aged experiment.** FME retains raw events ~90 days; a
  re-calc after that recomputes against purged data and **destroys the result**. Calculate
  once while the run is fresh, then leave it. (Project memory: `fme-experiment-recalc-gotcha`.)
- **Don't edit the flag between hydrating and viewing.** Metric impact is scoped to the flag's
  current version/time window; a definition change starts a new window and orphans your traffic.
- **SDK keys ≠ Admin key.** The hydrator needs the environment's server-side SDK key, not the
  MCP/Admin API key. Keep both out of git.
- **Ingestion delay.** Impressions/events take a few minutes to surface; don't expect instant
  numbers.
- **Value metrics need within-arm variance.** A significance test on an "average value" metric is
  undefined if every event in an arm carries the *same* value (FME: *"The variance is equal to
  zero…"*). The hydrator samples both latency and **cost** with per-response jitter
  (`latencyMs.jitter` / `costJitterCents` in `lib/experiment/config.ts`) so each arm has spread;
  the mean is unchanged. Don't send a constant for an averaged metric.
- **Same pathology hit the mortgage guardrail too (found live 2026-09-01).**
  `computeEstimatedFeeCents`'s `zeroUpfrontHigherRate` branch returns an exact flat constant
  (`config.baseFeeCents`) every time, so a large share of each arm's submitters (everyone who
  didn't pick `lowRatePointsUpfront`) landed on a literal point-mass of identical fee values.
  The "Avg estimated fee ($)" guardrail rendered with an unusable confidence interval (observed:
  Impact 45.83% **±186370.72%**, p=1.000) even though the key metric and the underlying business
  result were fine. Fixed by adding `feeJitterCents` (±$150, mean-preserving) in
  `lib/mortgage/experiment.ts`, applied only at the hydrator's tracking call site — **never** in
  `lib/mortgage/fees.ts`/the real `/api/mortgage/apply` route, which must stay deterministic for a
  given Dynamic Config. **If you already hydrated before this fix**, the old degenerate events are
  still in FME (the hydrator only adds new key namespaces, never replaces old ones — see `--run-id`
  above), so re-hydrating alone won't clean up an existing experiment's result. Re-run the hydrator
  (now jittered) for the affected environment(s), then bump that experiment's **Starts at** in the
  FME console to just before the new run's timestamp so the calculation window excludes the old
  degenerate batch, and Recalculate once (safe — this data is fresh, not the aged-experiment case
  above).
- **The jitter fix above turned out not to be the real fix — "Avg estimated fee ($)" is retired
  (D-020/D-021).** After the jitter fix, the guardrail's CI got *worse*, not better, tracing to a
  `seed-event-types` placeholder value bug (fixed — see `REPRESENTATIVE_VALUE` in
  `scripts/seed-event-types.ts`) that turned out to *also* not be the cause: independently
  recomputing the arm means from raw Data Hub exports showed FME's own mean calculation already
  excludes impression-less keys, and a hand-computed Welch CI on the clean data was ±9.94% while
  FME's console reported ±194,036.88% for the exact same data. Working theory: FME's "Average
  value per user" measure type is unstable at this experiment's low (~30-36%) submission/firing
  rate, independent of any data-quality issue. Rather than keep chasing that metric type, D-021
  retired it from the live console and replaced the guardrail with `mortgage_estimated_lender_revenue_cents`
  (a corrected, more realistic lender-economics model) plus a new `mortgage_application_rejected`
  secondary metric — deliberately shaped as "percent of unique keys with event" (same shape as the
  proven-stable primary metric), not a value-average or a submitter-conditional ratio, specifically
  to not reinherit this instability. See D-021 in `docs/DECISIONS.md` for the full numbers.
