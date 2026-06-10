// Experiment result shapes. Shared by the simulator, the live-feedback
// aggregator, and the in-app results dashboard. Client-safe (no server imports).

/** Aggregated outcomes for a single treatment arm. */
export interface TreatmentResult {
  treatment: string; // e.g. "haiku" | "sonnet"
  exposures: number; // impressions (users who saw this treatment)
  conversions: number; // primary-metric successes (thumbs-up)
  conversionRate: number; // conversions / exposures
  avgLatencyMs: number; // secondary metric — speed
  avgCostCents: number; // secondary metric — estimated token cost
}

/** A/B comparison of the variant against the baseline on the primary metric. */
export interface Comparison {
  baseline: string; // control treatment key
  variant: string; // variant treatment key
  absoluteLift: number; // variantRate - baselineRate
  relativeLift: number; // absoluteLift / baselineRate
  zScore: number;
  pValue: number; // two-sided
  significant: boolean; // pValue < alpha
  alpha: number;
  // 95% CI for the absolute difference in rates.
  ciLow: number;
  ciHigh: number;
}

/** A full experiment readout, whether from fixtures or live feedback. */
export interface ExperimentResult {
  key: string; // the flag the experiment runs on, e.g. "exp_assistant_modelChoice_web"
  name: string; // human label
  metric: string; // primary metric label, e.g. "thumbs-up rate"
  generatedAt: string; // ISO timestamp
  source: "fixtures" | "live" | "blended";
  totalExposures: number;
  requiredSamplePerArm: number; // honest sample-size target (power/alpha)
  treatments: TreatmentResult[];
  comparison: Comparison;
}

/** Per-treatment "ground truth" used by the simulator to draw outcomes. */
export interface TreatmentModel {
  treatment: string;
  trueConversionRate: number; // P(thumbs-up)
  latencyMs: { mean: number; jitter: number }; // uniform ± jitter
  costCents: number; // per-response estimated token cost
}

/** Everything needed to size and run the experiment honestly. */
export interface ExperimentConfig {
  key: string;
  name: string;
  metric: string;
  baselineTreatment: string;
  variantTreatment: string;
  baselineRate: number; // expected control rate (for sizing)
  minDetectableEffect: number; // absolute lift we want to detect
  alpha: number; // significance level (two-sided)
  power: number; // 1 - beta
  models: TreatmentModel[]; // ground truth per arm (simulator only)
}
