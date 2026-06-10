// On-demand traffic simulator (D-008). Generates synthetic users, allocates each
// to a treatment 50/50 by a stable key hash (exactly how an FME percentage
// rollout splits traffic), then draws REAL outcomes from each arm's ground-truth
// model: a Bernoulli thumbs-up, a latency sample, and a per-response cost. The
// aggregate is run through the same two-proportion test the dashboard shows —
// honest stats, not typed-in numbers.
//
// We size the run above the power-analysis requirement so the result reliably
// reaches significance. Runs anywhere (Node script or server) — no FME needed.

import type {
  ExperimentConfig,
  ExperimentResult,
  TreatmentModel,
  TreatmentResult,
} from "@/lib/experiment/types";
import { compareProportions, sampleSizePerArm } from "@/lib/experiment/stats";
import { hashUnit, mulberry32 } from "./rng";

interface Accumulator {
  exposures: number;
  conversions: number;
  latencySum: number;
  costSum: number;
}

export interface SimulateOptions {
  /** Total synthetic users across both arms. */
  users?: number;
  /** Seed for reproducible fixtures. */
  seed?: number;
}

export function simulateExperiment(
  config: ExperimentConfig,
  options: SimulateOptions = {}
): ExperimentResult {
  const { users = 6000, seed = 42 } = options;
  const rand = mulberry32(seed);

  const modelByTreatment = new Map<string, TreatmentModel>(
    config.models.map((m) => [m.treatment, m])
  );
  const acc = new Map<string, Accumulator>(
    config.models.map((m) => [
      m.treatment,
      { exposures: 0, conversions: 0, latencySum: 0, costSum: 0 },
    ])
  );

  for (let i = 0; i < users; i++) {
    const userKey = `sim-user-${i}`;
    // 50/50 split by stable hash → baseline vs variant.
    const treatment =
      hashUnit(userKey) < 0.5 ? config.baselineTreatment : config.variantTreatment;
    const model = modelByTreatment.get(treatment);
    const a = acc.get(treatment);
    if (!model || !a) continue;

    a.exposures += 1;
    if (rand() < model.trueConversionRate) a.conversions += 1;
    // Latency: uniform within ± jitter around the mean.
    a.latencySum += model.latencyMs.mean + (rand() * 2 - 1) * model.latencyMs.jitter;
    a.costSum += model.costCents;
  }

  const treatments: TreatmentResult[] = config.models.map((m) => {
    const a = acc.get(m.treatment)!;
    return {
      treatment: m.treatment,
      exposures: a.exposures,
      conversions: a.conversions,
      conversionRate: a.exposures ? a.conversions / a.exposures : 0,
      avgLatencyMs: a.exposures ? Math.round(a.latencySum / a.exposures) : 0,
      avgCostCents: a.exposures
        ? Number((a.costSum / a.exposures).toFixed(4))
        : 0,
    };
  });

  return buildResult(config, treatments, "fixtures");
}

/**
 * Assemble an ExperimentResult from already-aggregated treatment rows and run
 * the comparison. Shared by the simulator and the live-feedback aggregator.
 */
export function buildResult(
  config: ExperimentConfig,
  treatments: TreatmentResult[],
  source: ExperimentResult["source"]
): ExperimentResult {
  const baseline = treatments.find((t) => t.treatment === config.baselineTreatment)!;
  const variant = treatments.find((t) => t.treatment === config.variantTreatment)!;
  const comparison = compareProportions(baseline, variant, config.alpha);

  return {
    key: config.key,
    name: config.name,
    metric: config.metric,
    generatedAt: new Date().toISOString(),
    source,
    totalExposures: treatments.reduce((s, t) => s + t.exposures, 0),
    requiredSamplePerArm: sampleSizePerArm(
      config.baselineRate,
      config.minDetectableEffect,
      config.alpha,
      config.power
    ),
    treatments,
    comparison,
  };
}
