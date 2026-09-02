# Policy: Require squad tag (Tier 1 — required metadata at save)
#
# Entity type: FEATURE FLAG. Every flag must carry a squad-<name> tag whose name is
# on the approved list. Source: OPA advisory doc Prompt 2. Field paths verified
# against the real FME policy input schema (D-014): tags = input.featureFlag.tags.
#
# Scope: create + update only (skip delete/archive). Run at Warn first, then Error.
#
# v1 note: the approved squad list is embedded here as a Rego set. To add/remove a
# squad, edit this constant. (v2 would read it from an external data source; the
# logic below is unchanged by that refactor.)
package fme_feature_flags

import rego.v1

# --- Approved values (v1: embedded constants; edit here to change) ---
# Northwind demo squads. squad-ai owns the three demo flags. squad-web added to
# match the live deployed policy (D-015).
approved_squads := {"squad-ai", "squad-payments", "squad-platform", "squad-web"}

# --- Scope helper ---
skip if input.entityMetadata.changeTrigger == "delete"

skip if input.entityMetadata.changeTrigger == "archive"

# All squad-* tags on the flag.
squad_tags := {t |
	some t in input.featureFlag.tags
	startswith(t, "squad-")
}

# No squad tag at all -> reject.
deny contains msg if {
	not skip
	count(squad_tags) == 0
	msg := "Flag must include a squad-<name> tag identifying the owning team."
}

# A squad tag is present but its value isn't approved -> reject.
deny contains msg if {
	not skip
	some t in squad_tags
	not t in approved_squads
	msg := "Squad tag value is not in the approved squad list."
}
