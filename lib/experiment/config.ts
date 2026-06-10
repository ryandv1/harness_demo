// The standing experiment: does the smarter (pricier) model actually earn more
// thumbs-up? Runs on the `exp_assistant_modelChoice_web` flag — the same flag Phase 1 targets by tier,
// now A/B-allocated 50/50 for measurement.
//
// The `models` block is the simulator's ground truth (real Bernoulli draws, not
// hand-typed results). Chosen so Sonnet wins on satisfaction but costs ~3x —
// the trade-off that makes "flags + attribution + experimentation in one tool"
// land. Client-safe.

import type { ExperimentConfig } from "./types";
import { FLAGS } from "@/lib/flags/flags";

export const AI_MODEL_EXPERIMENT: ExperimentConfig = {
  key: FLAGS.AI_MODEL,
  name: "AI Model — Haiku vs Sonnet",
  metric: "thumbs-up rate",
  baselineTreatment: "haiku",
  variantTreatment: "sonnet",

  // Sizing inputs (power analysis). We expect ~62% baseline satisfaction and
  // want to reliably detect a +6pt absolute improvement at 95% confidence, 80% power.
  baselineRate: 0.62,
  minDetectableEffect: 0.06,
  alpha: 0.05,
  power: 0.8,

  // Ground truth for the simulator. True lift (+10pt) exceeds the MDE so the
  // result reliably reaches significance; cost gap is ~3x.
  models: [
    {
      treatment: "haiku",
      trueConversionRate: 0.62,
      latencyMs: { mean: 850, jitter: 250 },
      costCents: 0.04,
    },
    {
      treatment: "sonnet",
      trueConversionRate: 0.72,
      latencyMs: { mean: 2100, jitter: 500 },
      costCents: 0.13,
    },
  ],
};
