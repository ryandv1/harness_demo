# Policy: Default-off in production, with operational exemption (Tier 2 — lifecycle)
#
# Entity type: FEATURE FLAG DEFINITION (this rule needs the per-environment payload,
# so the policy set entity type must be "Feature Flag Definition", NOT "Feature
# Flag"). A flag must default to OFF in production so no feature ships on by accident
# (Knight-Capital-class prevention). Operational kill switches are EXEMPT.
# Source: OPA advisory doc Section 2 Tier 2. Scene 3 "smart vs blunt policy" beat.
#
# FIELD PATHS CORRECTED against the real FME policy input schema (D-014):
#   - environment:        input.featureFlagDefinition.environmentName  (e.g. "Production")
#   - default treatment:  the entry in input.featureFlagDefinition.treatments[] whose
#                         .defaultTreatment == true  (a boolean per treatment)
# The earlier draft assumed input.featureFlag.environments[].defaultTreatment, which
# does not exist.
#
# ⚠️ OPERATIONAL EXEMPTION uses the ops_ NAME PREFIX, not the category-operational
# TAG. The Feature Flag Definition payload has NO tags field (confirmed against a real
# payload 2026-06-15), so a definition-scoped policy cannot read the category tag. We
# fall back to the D-011 naming convention (ops_* = operational). This is raised as a
# product gap (expose flag tags on the definition payload) — see
# policies/README.md "Gaps raised to product" (G2).
#
# Scope: create + update only (skip delete/archive). Run at Warn first, then Error.
package fme_feature_flag_definitions

import rego.v1

# Treatment values treated as "off".
off_treatments := {"off", "false", "disabled", "control"}

# --- Scope helper ---
skip if input.entityMetadata.changeTrigger == "delete"

skip if input.entityMetadata.changeTrigger == "archive"

# Operational kill switches are exempt — they are supposed to default ON.
# Tags aren't in this payload, so identify operational flags by the ops_ prefix.
is_operational if startswith(input.featureFlagDefinition.name, "ops_")

is_production if lower(input.featureFlagDefinition.environmentName) == "production"

is_off(name) if lower(name) in off_treatments

# Name(s) of the treatment marked as this environment's default treatment.
default_treatment_names := {t.name |
	some t in input.featureFlagDefinition.treatments
	t.defaultTreatment == true
}

# Non-operational flag that defaults to something other than off in prod -> reject.
deny contains msg if {
	not skip
	not is_operational
	is_production
	some name in default_treatment_names
	not is_off(name)
	msg := sprintf("Flag must default to OFF in production (environment %q default treatment is %q). Only operational (ops_*) flags are exempt.", [input.featureFlagDefinition.environmentName, name])
}
