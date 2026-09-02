# Governed FME Rollout Pipeline

> **Last updated:** 2026-06-16 · maintained by Claude. Phase 3 governance artifacts.
> A **reusable, flag-agnostic** Harness pipeline that rolls out *any* Harness FME
> feature flag through the same standard gates — with a guardrail that refuses to
> touch experiment flags. See [../docs/DEMO_GOVERNANCE.md](../docs/DEMO_GOVERNANCE.md)
> and [../docs/DECISIONS.md](../docs/DECISIONS.md) (D-010, D-011, D-017).

## What's here

| File | What it is |
|------|------------|
| `governed-fme-rollout.yml` | The v0 pipeline definition. ✅ **Live** in project `FME_Finance_AI_demo` (created via MCP, D-017). This file is the source of truth. |
| `policies/block_experiment_flag_rollout.rego` | The OPA guardrail the pipeline's Policy step enforces. ✅ **Live** as policy + Custom policy set. Different OPA layer than `../policies/*.rego` (see below). |

## Why a reusable pipeline (not one-flag-per-pipeline)

The pipeline takes the **flag and environment as runtime inputs** (`<+input>`), so the
same definition rolls out `rel_assistant_spendingInsights_web` today and any future
flag tomorrow. The "release process" — guardrail, approval, staged ramp, rollback —
lives in **one** template instead of being copy-pasted per flag. This is the Phase 3
demo's core governance message: *standardize the release path, don't couple it to a flag.*

## The three stages

1. **Guardrail** (`Custom` stage, `Policy` step) — evaluates the OPA policy set
   `block_experiment_flag_rollout` against `{flagName, environment}`. If the target is
   an `exp_*` flag the run is **hard-blocked** before anything changes. This protects
   live experiments: re-allocating an experiment flag would cut a new flag version and
   orphan its computed-metric window.
2. **Approval** (`Approval` stage, `HarnessApproval`) — human gate routed to the
   `team_pm_ai` user group.
3. **Live UAT** (`Custom` stage) — exposes the flag to the `Internal_QA_Team` then
   `Beta_Customers` segments (`FmeSegmentAddRemoveTargets`, adding the demo user keys
   `riley` + `jordan` — see the 2026-08-24 gotcha below), each followed by an
   auto-approval gate (the `Simple_15s_Auto_Approval_demo` step template). Internal QA
   and friends-and-family validation before any percentage ramp.
4. **Progressive Rollout** (`Custom` stage) — `FmeFlagDefaultAllocation` ramp
   **1% → (approval) → 50% → (approval) → 100%**, using the `onTreatment`/`offTreatment`
   runtime variables. On any failure the stage runs its `rollbackSteps` —
   `FmeFlagKill` (serve the flag OFF) — so a bad rollout is contained, never left mid-ramp.

### Runtime inputs

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `flagName` | yes | — | The FME flag key. `exp_*` flags are rejected by the guardrail. |
| `environment` | yes | — | FME environment NAME as the FME step expects it (e.g. `Prod-FME_Finance_AI_`). |
| `onTreatment` | no | `on` | Treatment to ramp UP. |
| `offTreatment` | no | `off` | Treatment to ramp DOWN. |

## ⚠️ Two distinct OPA layers — do not conflate

| | `../policies/*.rego` | `policies/block_experiment_flag_rollout.rego` (here) |
|---|---|---|
| Engine | **FME** Policy engine | **Harness** Policy-as-Code (Pipeline) |
| Fires | At flag **save-time** in the FME console | At **pipeline execution** |
| Entity type | Feature Flag / Feature Flag Definition | **Custom** |
| Input | FME flag payload (`input.featureFlag…`) | The step's `policySpec.payload` JSON (`input.flagName`, `input.environment`) |
| `package` | `fme_feature_flags` / `fme_feature_flag_definitions` | `fme_rollout_pipeline` |

They complement each other: save-time policies govern how a flag may be *defined*; this
pipeline-time guardrail governs how a flag may be *rolled out*.

## Prerequisites in Harness (all ✅ done)

1. **FME connector / auth context.** The `FmeFlag*` steps authenticate via the pipeline's
   FME context (no in-step connector field). Confirm the project's FME connection is
   configured before running.
2. **The policy set.** ✅ Live: a **Custom** policy set `block_experiment_flag_rollout`
   containing the policy of the same name at severity **Error**, enforcement action
   **On Step** (custom policy sets only support `onstep` — they're invoked by the
   pipeline's Policy step, not auto-evaluated on run).
3. **User group.** `team_pm_ai` exists (used by the save-time policies too).

## How it was created (D-017 workflow)

Authored-in-repo-first: the YAML + Rego were reviewed here, then created in Harness via the
Harness MCP. All three now exist in project `FME_Finance_AI_demo`:
- OPA policy `block_experiment_flag_rollout` (`harness_create resource_type=policy`).
- Custom policy set `block_experiment_flag_rollout`, action `onstep`, policy attached at
  severity `error` (`harness_create resource_type=policy_set` then `harness_update` to
  attach the policy — the policies array doesn't bind on the initial create).
- Pipeline `governed_fme_rollout` (`harness_create resource_type=pipeline`).

> **Gotcha (recorded for next time):** Harness step `name` fields reject `%` (regex
> `^[a-zA-Z_][-0-9a-zA-Z_\s]{0,127}$`). The ramp steps spell out "percent" instead.

## Gotcha (2026-08-24): standard segments need `FmeSegmentAddRemoveTargets`, not `FmeSegmentSetTargetingRules`

`Internal_QA_Team` and `Beta_Customers` are **standard (static-list) segments** — membership
is an explicit list of keys, which is the right model here (a fixed roster of known QA
testers / beta customers), not an attribute-matched rule. The Live UAT stage originally used
`FmeSegmentSetTargetingRules`, which is the step for **rule-based** segments only — it calls
FME's rule-definition API, which 404'd with `Segment 'Internal_QA_Team' not found` because no
rule-based segment of that name exists (confirmed via MCP: `fme_rule_based_segment` list = 0
results; `fme_standard_segment` list = both segments, type standard).

**Fix (part 1 — step type):** swapped both steps to `FmeSegmentAddRemoveTargets` (spec: `segmentName`,
`environment`, `addKeys`, `removeKeys`) and added the app's two demo identities (`riley` — premium,
`jordan` — free; see `lib/db.ts`) as `addKeys` to both segments. Pushed live via MCP
(`harness_update resource_type=pipeline`). Reconciled in `governed-fme-rollout.yml`.

The two segment-management step types, for future reference:
- `FmeSegmentAddRemoveTargets` — "Add/Remove Segment Targets" → standard/static-list segments.
- `FmeSegmentSetTargetingRules` — "Set Rule-Based Segment Targeting" → rule-based segments only.

**Fix (part 2 — the actual remaining 404, found on re-run/Build 6):** the step-type fix alone wasn't
enough — the same `Segment 'Internal_QA_Team' not found` error persisted. Root cause: the saved
input set `flag_pipeline_input_set` had `environment: Prod-FME_Finance_AI_demo`, which is **not a
real FME environment name** (the actual Prod env is `Prod-FME_Finance_AI_` — no `demo` suffix; Stg is
`Stg-FME_Finance_AI_d`; confirmed via MCP `fme_environment` list). The segment lookup was scoped to a
nonexistent environment, so it 404'd regardless of step type. **Fixed by correcting the input set**
(`harness_update resource_type=input_set`, identifier `flag_pipeline_input_set`) to
`environment: Prod-FME_Finance_AI_`. No further pipeline YAML change was needed — this was purely a
bad saved input-set value, not a bug in `governed-fme-rollout.yml`.

## Pending / dormant

- **Live UAT stage** (Ryan): ✅ saved live and reconciled into this repo's YAML (stage 3).
- **Jira comment after Live UAT** — staged **dormant** at the bottom of `governed-fme-rollout.yml`
  (a commented `JiraUpdate` "add comment" step on a fixed ticket). **Not live: blocked on the Jira
  connector.** To activate: fill the `connectorRef` + `issueKey` placeholders, paste the step at the
  `>>> DORMANT Jira comment step drops in HERE` marker (last step of the `Live_UAT` stage), re-create
  via MCP.
- **Live UAT prereqs (real entities, keep names in sync):** segments `Internal_QA_Team` +
  `Beta_Customers`, and the step template `Simple_15s_Auto_Approval_demo` (v.01).

## ⚠️ Verify FME step field names against the console

The `FmeFlagDefaultAllocation` / `FmeFlagKill` step `spec` shapes here
(`flagName`, `environment`, `allocation: [{treatment, amount}]`, amounts sum to 100)
were taken from the official FME pipeline-steps docs. Field names can drift; **confirm
against the step's UI in your Harness project** before relying on a live run. The
`environment` value must match the NAME the FME step expects, not the env identifier.
