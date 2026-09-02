# FME Governance Policies (OPA / Rego)

> **Last updated:** 2026-06-15 · maintained by Claude. Phase 3 governance artifacts.
> These are the policy-as-code rules authored in the **FME org** (console / Policy engine).
> They are **not** loaded or evaluated by the Northwind app — OPA fires at flag
> **save-time** in FME, never at runtime in the SDK. See
> [../docs/DEMO_GOVERNANCE.md](../docs/DEMO_GOVERNANCE.md) and
> [../docs/DECISIONS.md](../docs/DECISIONS.md) D-010/D-011/**D-014**.
>
> **All field paths reconciled against the real FME policy input schema** (the official
> [Policies docs](https://developer.harness.io/docs/feature-management-experimentation/policies))
> on 2026-06-15 (D-014). Earlier drafts referenced fields that don't exist; see
> "Gaps raised to product" below for what the payload still can't express.

## Why these live in the repo

They're committed here as the **source of truth + reviewable artifact** for the demo,
and so a cloner can read exactly what governs the three demo flags. To make them live,
either paste each `.rego` file into the corresponding policy in the FME Policy editor,
or drive the **Harness AI release agent** with the copy-paste prompts in
[RELEASE_AGENT_PROMPTS.md](RELEASE_AGENT_PROMPTS.md) (one prompt per policy, same six
policies). Both routes produce the same enforcement.

## The policy set

| # | File | Entity type / `package` | Enforces | Deny when… |
|---|------|--------------------------|----------|------------|
| 1 | `01_require_category_tag.rego` | Feature Flag · `fme_feature_flags` | Exactly one `category-*` tag | zero or >1 category tags |
| 2 | `02_require_squad_tag.rego` | Feature Flag · `fme_feature_flags` | A `squad-<name>` tag from the approved list | no squad tag / not approved |
| 3 | `03_require_jira_reference.rego` | Feature Flag · `fme_feature_flags` | A Jira ref (`PREFIX-123`) in the description | no approved-prefix ticket ref |
| 4 | `04_require_team_ownership.rego` | Feature Flag · `fme_feature_flags` | Owner present + team-owned; PM team for rel/exp | no owner / individual owner / non-PM team owns a rel/exp flag |
| 5 | `05_require_experiment_hypothesis_metrics.rego` | Feature Flag · `fme_feature_flags` | **Hypothesis** in description on experiments (metric check removed — see gaps) | `category-experimental` flag with no Hypothesis |
| 6 | `06_default_off_in_production.rego` | **Feature Flag Definition** · `fme_feature_flag_definitions` | Default-OFF in prod, **operational exempt** | non-operational (`ops_*`) flag's prod default treatment ≠ off |

Policies 1–5 are the advisory doc's **Tier 1** metadata rules (Appendix prompts 1–5).
Policy 6 is the **Tier 2** "default-off + operational exemption" lifecycle rule — the
Scene 3 "smart vs blunt policy" beat in the demo script.

> **Entity type matters.** FME policy sets are scoped to **one entity type** (Feature
> Flag, Feature Flag Definition, FME Environment, FME Segment, FME Segment Definition)
> and run **On Save**. Policies 1–5 read the **Feature Flag** payload (`input.featureFlag…`);
> policy 6 reads the **Feature Flag Definition** payload (`input.featureFlagDefinition…`)
> because default treatment + environment only exist there. Add policies 1–5 to a
> Feature-Flag policy set and policy 6 to a Feature-Flag-Definition policy set. FME reads
> the `deny` set of strings; each string becomes a violation message. The `package` name
> must match the entity type (above). **Author each policy as its own policy entry.**

> **Not yet authored here** (Tier 2/3 from the advisory doc): 30-day staleness block,
> block-archive-on-active-traffic, demo-first gate, category-to-approver routing,
> stale-flag cap / cleanup throttle / TTL. Add as the demo expands.

## The real FME policy input schema (verified 2026-06-15, D-014)

Only these fields exist — policies use nothing else. Quoted from the official docs.

**Feature Flag** save event (policies 1–5):
```
input.featureFlag.name                       (string)
input.featureFlag.status                      (string)
input.featureFlag.description                 (string, optional)
input.featureFlag.tags                        (array of strings)
input.featureFlag.trafficType.{id,name}
input.featureFlag.pendingChangeRequests       (number)
input.featureFlag.hasPendingStatusChange      (boolean)
input.entityMetadata.actor.{id,type}
input.entityMetadata.changeTrigger            ("create" | "update" | "delete" | "archive")
input.entityMetadata.owners[].{id,ownerId,ownerType}   (VERIFIED live D-015: a team owner is
                                              {id:"team_pm_ai", ownerId:"team_pm_ai", ownerType:"team"};
                                              id == the readable group identifier, NOT a UUID.
                                              NB: owners use ownerType/ownerId; the *actor* uses type. No owner display name.)
input.entityMetadata.project.id
```

**Feature Flag Definition** save event (policy 6):
```
input.featureFlagDefinition.name
input.featureFlagDefinition.environmentName   (e.g. "Production")
input.featureFlagDefinition.status
input.featureFlagDefinition.killed            (boolean)
input.featureFlagDefinition.trafficTypeName
input.featureFlagDefinition.description
input.featureFlagDefinition.definition[]      (targeting: conditionType, matcherGroup, partitions[], label)
input.featureFlagDefinition.treatments[].{name,description,baseline,defaultTreatment}   (defaultTreatment is a boolean)
input.featureFlagDefinition.trafficAllocation
input.featureFlagDefinition.flagSets[]
input.entityMetadata.{actor,changeTrigger,owners[],project}   (same as above)
```

## How to use these (operational guidance)

1. **Warn → Error.** Run every new policy at **Warn and Continue** first (logs, no block)
   to surface edge cases, then switch to **Error and Exit** so saves actually block. The
   live demo runs at Error so the rejected-save beat works.
2. **Scope.** Every policy skips `delete` and `archive` via `entityMetadata.changeTrigger`
   so cleanup of non-compliant legacy flags is never blocked. (A missing `changeTrigger`
   is treated as in-scope, i.e. evaluated.)
3. **Confirm with sample payloads.** After authoring each policy in FME, request a passing
   and a failing sample payload from the release agent and confirm behavior before enforcing.

## Gaps raised to product

These came out of the 2026-06-15 schema reconciliation (D-014). Each is a governance
rule we *wanted* but the save-time policy payload can't currently express. Ryan to flag
to the FME product team:

| # | Gap | Impact | Asked for |
|---|-----|--------|-----------|
| G1 | **No `metrics`/`keyMetrics` on either payload.** | Can't enforce "an experiment must declare a success metric." Policy 5 was reduced to hypothesis-only. | Expose a flag's linked/attached metrics on the Feature Flag payload. |
| G2 | **No `tags` on the Feature Flag *Definition* payload** (confirmed against a real payload 2026-06-15). | A definition-scoped policy (6) can't read `category-operational`, so the operational exemption falls back to the `ops_` name prefix (D-011). | Include the flag's tags on the definition payload. |
| G3 | **No first-class hypothesis field.** | Hypothesis must be parsed out of description free-text (brittle, format-dependent). | A dedicated experiment hypothesis field. |
| G4 | **No owner *name* / individual-vs-group richness.** | Minor — `owners[].{id,type}` is enough for policy 4; just noting we can't message a human-readable owner name. | (Nice-to-have) owner display name. |

## v1: approved values are embedded as Rego constants

Per the advisory doc's configuration note, the configurable lists live **inside the
policy files** as Rego sets (no external data source). To change them, edit the constant:

| Constant | File | Current (placeholder) values |
|----------|------|------------------------------|
| `approved_squads` | 02 | `squad-ai`, `squad-payments`, `squad-platform`, `squad-web` |
| `approved_jira_prefixes` | 03 | `ALG`, `FME`, `NW`, `SCRUM` (added live in the FME console; reconciled here 2026-09-01) |
| `approved_pm_teams` | 04 | `team_pm_ai`, `team_pm_alpha` — now **real account user groups** (created 2026-06-15, D-015), not placeholders |
| `category_tags` | 01 | `category-release/experimental/operational` (fixed) |
| `off_treatments` | 06 | `off`, `false`, `disabled`, `control` |

> **v2 (later):** once external data support is stable in the FME policy editor, these
> same policies can read the lists from a data source. The policy logic is unchanged —
> only the lookup source moves. Known follow-up, not a rewrite.

## The three demo flags are compliant exemplars

Because the demo *shows OPA rejecting non-compliant flags*, the demo's own flags must pass
all six policies (see [../docs/DEMO_GOVERNANCE.md](../docs/DEMO_GOVERNANCE.md) §2):

> **Policy 4 owner check — ✅ all three demo flags pass (2026-06-15, D-015), verified live:**
> `exp_assistant_modelChoice_web` → `team_pm_ai` (eval `14797813`); `rel_assistant_spendingInsights_web`
> → `team_pm_ai` (eval `14798004`); `ops_assistant_killSwitch_web` → `team_ops` (eval `14797973`).
> Owners serialize as `{id, ownerId, ownerType}` with `id` = the readable group identifier (not a
> UUID), so `approved_pm_teams` is correct as written. Operational flags are owned by `team_ops`, not a
> PM team — rule 3 applies only to `category-release`/`category-experimental`. Owner assignment is
> **console-only** (the flag-update API has no `owners` field).

| Flag | category tag | squad tag | owner team | notes |
|------|-------------|-----------|------------|-------|
| `ops_assistant_killSwitch_web` | `category-operational` | `squad-ai` | `team_ops` | default ON (policy 6 exempts via the `ops_` prefix); owned by the **ops** team, not a PM team (rule 3 N/A for operational) |
| `exp_assistant_modelChoice_web` | `category-experimental` | `squad-ai` | `team_pm_ai` | needs a **Hypothesis:** line in the description (policy 5) |
| `rel_assistant_spendingInsights_web` | `category-release` | `squad-ai` | `team_pm_ai` | default OFF; description carries a Jira ref |
| `rel_mortgage_refinanceBanner_web` | `category-release` | `squad-payments` | `team_pm_ai` | default ON (a live-content banner, not a kill switch — exempt from policy 6 the same way `ops_*` is, since it has no meaningful "off" state to force); description carries `Jira: SCRUM-401` |
| `exp_mortgage_applicationFlow_web` | `category-experimental` | `squad-payments` | `team_pm_ai` | description carries a **Hypothesis:** line (policy 5) and `Jira: SCRUM-402` |

## Local validation

`opa` is **not installed** in this workspace, so these were not machine-checked. To lint
locally: `brew install opa && opa check policies/` and
`opa test policies/` (add `_test.rego` files with sample payloads if you want coverage).
Each file targets OPA's modern `import rego.v1` syntax (`deny contains msg if { … }`).
