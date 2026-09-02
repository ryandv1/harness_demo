# Policy: Require exactly one category tag (Tier 1 — required metadata at save)
#
# Entity type: FEATURE FLAG (policy set entity type = "Feature Flag").
# Every flag must carry exactly one of: category-release, category-experimental,
# category-operational. Source: OPA advisory doc Prompt 1. Field paths verified
# against the real FME policy input schema (developer.harness.io
# /docs/feature-management-experimentation/policies) — see DECISIONS D-014.
#
# Scope: skip delete/archive (entityMetadata.changeTrigger) so non-compliant legacy
# flags can still be cleaned up. Run at Warn first, then Error.
package fme_feature_flags

import rego.v1

# --- Approved values (v1: embedded constants; edit here to change) ---
category_tags := {"category-release", "category-experimental", "category-operational"}

# --- Scope helper: skip cleanup/teardown events ---
skip if input.entityMetadata.changeTrigger == "delete"

skip if input.entityMetadata.changeTrigger == "archive"

# Category tags actually present on the flag (tags is real: input.featureFlag.tags).
present_categories := {t |
	some t in input.featureFlag.tags
	t in category_tags
}

# Zero category tags -> reject.
deny contains msg if {
	not skip
	count(present_categories) == 0
	msg := "Flag must include exactly one category tag: category-release, category-experimental, or category-operational."
}

# More than one category tag -> reject.
deny contains msg if {
	not skip
	count(present_categories) > 1
	msg := "Flag must include only one category tag — multiple categories detected."
}
