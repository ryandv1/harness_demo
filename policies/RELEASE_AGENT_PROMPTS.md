# Release-Agent Prompts (author the policies in FME)

> **Last updated:** 2026-06-15 · maintained by Claude. Phase 3 governance artifacts.
> Copy-paste prompts for the **Harness AI release agent** in the FME console, one per
> policy. They produce the same six policies committed as `.rego` files in this folder —
> use whichever you prefer (paste the `.rego` directly, or drive the release agent with
> these prompts). See [README.md](README.md) and [../docs/DECISIONS.md](../docs/DECISIONS.md)
> D-010/D-011/**D-014**.
>
> **Field paths reconciled against the real FME policy input schema** on 2026-06-15
> (D-014). The prompts below name only fields that exist in the payload. See
> README.md → "The real FME policy input schema" and "Gaps raised to product".

## Sequencing & guardrails (applies to all six)

1. **Author in order 1 → 6.** Policies 1–5 are Tier-1 metadata rules; 6 is the Tier-2
   lifecycle rule.
2. **Entity type + package per policy.** FME policy sets are scoped to one entity type and
   run On Save; FME reads the `deny` set of strings. Policies **1–5** target the **Feature
   Flag** entity type (`package fme_feature_flags`, fields under `input.featureFlag…`).
   Policy **6** targets the **Feature Flag Definition** entity type
   (`package fme_feature_flag_definitions`, fields under `input.featureFlagDefinition…`).
   Author each policy as its own entry.
3. **Always start at "Warn and Continue,"** confirm behavior on a passing + failing
   sample payload, **then** flip to "Error and Exit." The live demo runs at Error so the
   rejected-save beat works.
4. **Every policy skips `delete` and `archive`** (via `input.entityMetadata.changeTrigger`)
   so cleanup of legacy non-compliant flags is never blocked. A missing `changeTrigger`
   is treated as in-scope (evaluated).

After authoring each policy, **ask the release agent for both a passing and a failing
sample payload** and confirm the deny fires only on the failing one — before switching
from Warn to Error.

---

## Prompt 1 — Require exactly one category tag

```
Write an OPA/Rego policy (import rego.v1) for Harness FME, entity type Feature Flag,
package fme_feature_flags, that runs On Save.

Requirement: every flag must carry EXACTLY ONE category tag from this fixed set:
category-release, category-experimental, category-operational.

Payload: tags are an array of strings at input.featureFlag.tags.

Deny in two cases:
  - zero category tags present → message: "Flag must include exactly one category
    tag: category-release, category-experimental, or category-operational."
  - more than one category tag present → message: "Flag must include only one
    category tag — multiple categories detected."

Scope: only evaluate create/update. Skip when input.entityMetadata.changeTrigger
is "delete" or "archive". Use a `deny contains msg if { ... }` style.
```

---

## Prompt 2 — Require an approved squad tag

```
Write an OPA/Rego policy (import rego.v1) for Harness FME, entity type Feature Flag,
package fme_feature_flags, that runs On Save.

Requirement: every flag must carry a squad-<name> tag, and the squad name must be
on an approved list embedded in the policy as a Rego set:
approved_squads := {"squad-ai", "squad-payments", "squad-platform"}

Payload: tags are strings at input.featureFlag.tags. A squad tag is any tag that
startswith "squad-".

Deny in two cases:
  - no squad-* tag at all → "Flag must include a squad-<name> tag identifying the
    owning team."
  - a squad-* tag is present but its value is not in approved_squads → "Squad tag
    value is not in the approved squad list."

Scope: skip when input.entityMetadata.changeTrigger is "delete" or "archive".
```

---

## Prompt 3 — Require a Jira reference in the description

```
Write an OPA/Rego policy (import rego.v1) for Harness FME, entity type Feature Flag,
package fme_feature_flags, that runs On Save.

Requirement: the flag description (input.featureFlag.description, may be absent —
default to "") must contain a Jira ticket reference of the form <PREFIX>-<digits>,
e.g. ALG-1234, where PREFIX is on an approved list embedded as a Rego set:
approved_jira_prefixes := {"ALG", "FME", "NW"}

Match with a word-boundary regex per prefix (e.g. `\bALG-[0-9]+`).

Deny when no approved-prefix reference is found → "Flag description must include a
linked Jira ticket reference (e.g., ALG-1234)."

Scope: skip when input.entityMetadata.changeTrigger is "delete" or "archive".
Use object.get for the optional description field.
```

---

## Prompt 4 — Require team ownership (PM team for release/experimental)

```
Write an OPA/Rego policy (import rego.v1) for Harness FME, entity type Feature Flag,
package fme_feature_flags, that runs On Save.

Payload: owners are at input.entityMetadata.owners (array, may be absent → default
[]); each owner object has exactly two fields: .id (string) and .type (string, e.g.
"team" or "user"). There is NO ownerType/ownerId/ownerName and no owner name field.
Tags are strings at input.featureFlag.tags.

Enforce three rules:
  1. At least one owner → if owners is empty, deny: "Flag must have an owner
     assigned. Flags created via the Admin API must include an owner team."
  2. Every owner must be a team → if any owner has .type != "team", deny:
     "Flag owner must be a team, not an individual user. Team ownership prevents
     loss of accountability when team members change."
  3. Release/experimental flags must be owned by an approved Product Manager team.
     A flag is release/experimental if it has tag category-release or
     category-experimental. Approved PM team owner ids embedded as a Rego set:
     approved_pm_teams := {"team_pm_ai", "team_pm_alpha"}. If such a flag is NOT
     owned by any owner whose .type == "team" and .id in approved_pm_teams, deny:
     "Release and experimental flags must be owned by a Product Manager team."

Scope: skip when input.entityMetadata.changeTrigger is "delete" or "archive".
Use object.get for the optional owners array.
```

---

## Prompt 5 — Require hypothesis on experiments

> ⚠️ The metric half of the original rule was dropped: the FME policy payload has no
> `metrics`/`keyMetrics` field (see README "Gaps raised to product", G1), so a success
> metric can't be enforced at save-time. Only the hypothesis is enforceable today.

```
Write an OPA/Rego policy (import rego.v1) for Harness FME, entity type Feature Flag,
package fme_feature_flags, that runs On Save.

Only applies to flags tagged category-experimental (read from
input.featureFlag.tags). Non-experimental flags pass without evaluation.

For experimental flags: the description (input.featureFlag.description, optional)
must contain a hypothesis — match a case-insensitive "Hypothesis:" header followed
by at least one non-whitespace character, e.g. regex `(?i)hypothesis:\s*\S`. If
missing, deny: "Experimental flags must include a Hypothesis in the description."

Do NOT add a metric/keyMetrics check — that field does not exist in the FME policy
payload. Scope: skip when input.entityMetadata.changeTrigger is "delete" or "archive".
```

---

## Prompt 6 — Default-OFF in production (operational exempt)

> Runs against the **Feature Flag Definition** entity (the per-environment payload),
> because default treatment + environment only exist there. The operational exemption
> uses the `ops_` name prefix, not the category-operational tag, since the definition
> payload has no tags field (see README "Gaps raised to product", G2).

```
Write an OPA/Rego policy (import rego.v1) for Harness FME, entity type Feature Flag
Definition, package fme_feature_flag_definitions, that runs On Save.

Goal: a flag must default to OFF in production so nothing ships on by accident.
Operational kill switches are EXEMPT (they legitimately default ON). The Feature Flag
Definition payload has NO tags, so identify operational flags by the name prefix:
a flag is operational if startswith(input.featureFlagDefinition.name, "ops_").

Treat these treatment values (case-insensitive) as "off":
off_treatments := {"off", "false", "disabled", "control"}

Environment: input.featureFlagDefinition.environmentName (match "production"
case-insensitively). Default treatment: the entry in
input.featureFlagDefinition.treatments[] whose .defaultTreatment == true (a boolean);
its .name is the default treatment value.

Deny when a NON-operational flag, in the production environment, has a default
treatment whose name is not an "off" value → message like: sprintf("Flag must default
to OFF in production (environment %q default treatment is %q). Only operational (ops_*)
flags are exempt.", [input.featureFlagDefinition.environmentName, name])

Scope: skip when input.entityMetadata.changeTrigger is "delete" or "archive".
```

---

## After all six are at Error: confirm the demo flags pass

The three demo flags are **compliant exemplars** (the demo shows OPA rejecting a bad
flag *against* these good ones). Re-save each and confirm it passes:

| Flag | category tag | squad tag | owner team | must also satisfy |
|------|-------------|-----------|------------|-------------------|
| `ops_assistant_killSwitch_web` | `category-operational` | `squad-ai` | `team_pm_ai` | default ON — policy 6 exempts via the `ops_` prefix |
| `exp_assistant_modelChoice_web` | `category-experimental` | `squad-ai` | `team_pm_ai` | needs a `Hypothesis:` line in the description (policy 5) |
| `rel_assistant_spendingInsights_web` | `category-release` | `squad-ai` | `team_pm_ai` | default OFF; description carries a Jira ref |

## Changing the approved values

The configurable lists are embedded as Rego constants (v1). To change them, edit the
constant in the generated policy (or the prompt before regenerating):

| Constant | Prompt/File | Current values |
|----------|-------------|----------------|
| `approved_squads` | 2 | `squad-ai`, `squad-payments`, `squad-platform` |
| `approved_jira_prefixes` | 3 | `ALG`, `FME`, `NW` |
| `approved_pm_teams` | 4 | `team_pm_ai`, `team_pm_alpha` |
| `off_treatments` | 6 | `off`, `false`, `disabled`, `control` |
