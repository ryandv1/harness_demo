# Policy: Require Jira ticket reference (Tier 1 — required metadata at save)
#
# Entity type: FEATURE FLAG. The flag description must contain a Jira ticket
# reference (uppercase project key, hyphen, numeric id — e.g. ALG-1234).
# Source: OPA advisory doc Prompt 3. Field paths verified against the real FME
# policy input schema (D-014): description = input.featureFlag.description (optional).
#
# Scope: create + update only (skip delete/archive). Run at Warn first, then Error.
#
# v1 note: approved project-key prefixes are embedded below as a Rego set.
package fme_feature_flags

import rego.v1

# --- Approved values (v1: embedded constants; edit here to change) ---
approved_jira_prefixes := {"ALG", "FME", "NW", "SCRUM"}

# --- Scope helper ---
skip if input.entityMetadata.changeTrigger == "delete"

skip if input.entityMetadata.changeTrigger == "archive"

# True if the description contains a "<PREFIX>-<digits>" reference for an approved prefix.
has_jira_ref if {
	some prefix in approved_jira_prefixes
	pattern := sprintf(`\b%s-[0-9]+`, [prefix])
	regex.match(pattern, object.get(input.featureFlag, "description", ""))
}

deny contains msg if {
	not skip
	not has_jira_ref
	msg := "Flag description must include a linked Jira ticket reference (e.g., ALG-1234)."
}
