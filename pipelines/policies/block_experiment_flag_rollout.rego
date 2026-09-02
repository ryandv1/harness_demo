# Guardrail: block experiment flags from the generic rollout pipeline
# ===========================================================================
# ⚠️ DIFFERENT OPA LAYER THAN policies/*.rego.
#   - policies/*.rego          → FME SAVE-TIME governance. Entity types
#                                "Feature Flag" / "Feature Flag Definition".
#                                Runs when someone edits a flag in the FME UI.
#   - THIS FILE                → HARNESS PIPELINE-TIME governance. Evaluated by
#                                the Policy step in governed-fme-rollout.yml at
#                                pipeline execution. The input is the JSON the
#                                step's policySpec.payload sends — NOT an FME
#                                flag payload. Wired up as a Harness Policy Set
#                                of entity type "Custom" (enforcement action
#                                "On Step", severity "Error") so a violation
#                                HARD-BLOCKS the run. LIVE: created in the
#                                FME_Finance_AI_demo project via MCP (D-017).
#
# WHY THIS EXISTS
#   The rollout pipeline is flag-AGNOSTIC: it ramps the default allocation of
#   whatever flag you pass in. Pointing it at an experiment flag (exp_*) would
#   overwrite that flag's default rule, cut a NEW flag version, and orphan the
#   live experiment's computed-metric window (FME anchors a metric run to the
#   version/targeting in effect). That silently destroys an in-flight result.
#   This guardrail makes that mistake impossible from the generic pipeline:
#   experiment flags must be rolled out via the experiment workflow instead.
#
# INPUT (from the Policy step payload in governed-fme-rollout.yml)
#   { "flagName": "<+pipeline.variables.flagName>",
#     "environment": "<+pipeline.variables.environment>" }
#
# The deny rule keys off the D-011 naming convention: exp_* = experiment flag.
package fme_rollout_pipeline

import rego.v1

# A flag is an experiment flag if its name uses the D-011 exp_ prefix.
is_experiment_flag if startswith(input.flagName, "exp_")

# Block the run when the target is an experiment flag.
deny contains msg if {
	is_experiment_flag
	msg := sprintf("Rollout blocked: %q is an experiment flag. Changing its default allocation would cut a new flag version and orphan its live experiment's computed-metric window. Roll out experiments via the experiment workflow, not the generic rollout pipeline.", [input.flagName])
}

# Defensive: a missing/empty flagName means the pipeline was triggered without
# its required runtime input. Fail closed rather than ramp an unknown flag.
deny contains msg if {
	not input.flagName
	msg := "Rollout blocked: no flagName supplied. Provide the FME flag to roll out at pipeline runtime."
}

deny contains msg if {
	input.flagName == ""
	msg := "Rollout blocked: flagName is empty. Provide the FME flag to roll out at pipeline runtime."
}
