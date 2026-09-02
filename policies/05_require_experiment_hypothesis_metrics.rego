# Policy: Require a hypothesis for experiments (Tier 1 — required metadata at save)
#
# Entity type: FEATURE FLAG. Flags tagged category-experimental must state a
# hypothesis in the description (a case-insensitive "Hypothesis:" header followed by
# content). Non-experimental flags pass without evaluation.
# Source: OPA advisory doc Prompt 5.
#
# ⚠️ SCOPE REDUCED vs. the original draft (D-014). The original also required a
# first-class key metric (input.featureFlag.keyMetrics). The real FME policy input
# schema exposes NO metrics/keyMetrics field on either the Feature Flag or the
# Feature Flag Definition payload, so "experiments must declare a success metric"
# CANNOT be enforced at save-time today. That check is removed (not silently broken)
# and raised as a product gap — see policies/README.md "Gaps raised to product".
# Only the hypothesis (which lives in description text) is enforceable here.
#
# Scope: create + update only (skip delete/archive). Run at Warn first, then Error.
package fme_feature_flags

import rego.v1

# --- Scope helper ---
skip if input.entityMetadata.changeTrigger == "delete"

skip if input.entityMetadata.changeTrigger == "archive"

is_experimental if {
	some t in input.featureFlag.tags
	t == "category-experimental"
}

# "Hypothesis:" (case-insensitive) followed by at least one non-whitespace char.
has_hypothesis if {
	desc := object.get(input.featureFlag, "description", "")
	regex.match(`(?i)hypothesis:\s*\S`, desc)
}

# Experimental flag with no hypothesis -> reject.
deny contains msg if {
	not skip
	is_experimental
	not has_hypothesis
	msg := "Experimental flags must include a Hypothesis in the description."
}
