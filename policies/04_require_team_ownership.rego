# Policy: Require group-based ownership (Tier 1 — required metadata at save)
#
# Entity type: FEATURE FLAG. Enforces three things:
#   (1) the flag has at least one owner;
#   (2) every owner is a team (type == "team"), not an individual;
#   (3) for release/experimental flags, the owning team is on the approved
#       Product Manager team list.
# Source: OPA advisory doc Prompt 4.
#
# OWNER FIELD NAMES VERIFIED against a real live policy-evaluation payload (D-015,
# 2026-06-15). An owner entry in input.entityMetadata.owners[] actually looks like:
#     { "id": "team_pm_ai", "ownerId": "team_pm_ai", "ownerType": "team" }
# i.e. the team's *identifier* (readable, not a UUID) under BOTH "id" and "ownerId",
# and the kind under "ownerType". There is NO "type" key on owners (the docs example
# showed {id,type}, but the runtime payload uses ownerType/ownerId). Note the *actor*
# uses "type"; owners do not. We read whichever shape is present so the policy is
# correct against both. There is still no owner display-name field (G4).
#
# Scope: create + update only (skip delete/archive). Run at Warn first, then Error.
#
# v1 note: the approved PM team list is embedded below as a Rego set of owner ids;
# these are real account user groups scoped to the FME project (D-015).
package fme_feature_flags

import rego.v1

# --- Approved values (v1: embedded constants; edit here to change) ---
# owner ids of teams allowed to own release/experimental flags.
approved_pm_teams := {"team_pm_ai", "team_pm_alpha"}

# --- Scope helper ---
skip if input.entityMetadata.changeTrigger == "delete"

skip if input.entityMetadata.changeTrigger == "archive"

owners := object.get(input.entityMetadata, "owners", [])

# Owner shape varies: the live FME payload uses {id, ownerId, ownerType}; the docs
# example used {id, type}. Read whichever exists so the policy works against both.
owner_type(o) := object.get(o, "type", object.get(o, "ownerType", ""))

owner_id(o) := object.get(o, "id", object.get(o, "ownerId", ""))

# (1) No owner at all -> reject.
deny contains msg if {
	not skip
	count(owners) == 0
	msg := "Flag must have an owner assigned. Flags created via the Admin API must include an owner team."
}

# (2) Any individual (non-team) owner -> reject.
deny contains msg if {
	not skip
	some o in owners
	owner_type(o) != "team"
	msg := "Flag owner must be a team, not an individual user. Team ownership prevents loss of accountability when team members change."
}

# (3) Release/experimental flags must be owned by an approved PM team.
deny contains msg if {
	not skip
	is_release_or_experimental
	not owned_by_approved_pm_team
	msg := "Release and experimental flags must be owned by a Product Manager team."
}

is_release_or_experimental if {
	some t in input.featureFlag.tags
	t in {"category-release", "category-experimental"}
}

owned_by_approved_pm_team if {
	some o in owners
	owner_type(o) == "team"
	owner_id(o) in approved_pm_teams
}
