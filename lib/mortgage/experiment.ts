// Ground truth for the mortgage application-flow experiment's simulator.
// Mirrors lib/experiment/config.ts's pattern for the AI model experiment, but
// tuned for a multi-metric story instead of a single conversion metric:
//   - mortgage_application_submitted        (primary, "% of unique keys with event")
//   - mortgage_estimated_fee_cents           (borrower-facing value, "avg value per key")
//   - mortgage_estimated_lender_revenue_cents (business guardrail, "avg value per key")
//   - mortgage_application_rejected          (secondary, "% of unique keys with event")
//
// Narrative (revised, D-021 — supersedes the original "twoPage wins on fee"
// story): singleScreen wins outright. It converts more (higher
// submissionRate) AND, once lender economics are modeled correctly (see
// yieldSpreadPremiumPct below), earns more revenue per submission too, because
// twoPage's guided flow nudges submitters toward the *lower*-revenue
// lowRatePointsUpfront option. Real mortgage lenders have historically earned
// more from the zero-upfront/higher-rate path than from points paid upfront —
// higher-rate paper sells at a premium on the secondary market ("yield spread
// premium"); this was significant enough that Dodd-Frank's Loan Officer
// Compensation rules were written specifically to curb steering borrowers
// toward it. The original model only tracked the borrower-facing upfront fee
// and missed this, which produced a misleading "twoPage wins" result. A
// secondary metric (applicationRejected) reintroduces a real trade-off:
// singleScreen's simpler flow lets slightly more low-quality applications
// through, so it converts more, earns more, AND rejects slightly more — an
// experiment that validates the intuitive read ("simpler flow wins, with a
// minor quality caveat"), which is its own kind of demo-worthy result: not
// every experiment needs to surprise you to be valuable. Client-safe (no
// server-only imports); used by the hydrator (scripts/experiment-hydrator.ts)
// — never shipped to the browser.

import { FLAGS, MORTGAGE_BANNER_CONFIG_BY_TREATMENT } from "@/lib/flags/flags";
import { computeEstimatedFeeCents } from "./fees";
import type { PricingOption } from "../types";

export interface MortgageTreatmentModel {
  treatment: string;
  /** P(a synthetic exposure goes on to submit an application). */
  submissionRate: number;
  /** P(pricingOption === "lowRatePointsUpfront") among submitters. */
  lowRatePointsShare: number;
  /**
   * P(a submission is later rejected) — conditional on submission. Tracked
   * unconditionally (over ALL exposed keys, not just submitters — see
   * mortgage_application_rejected's comment in lib/mortgage/events.ts) to
   * avoid D-020's low-participation-rate CI-instability failure mode; the
   * per-arm population rate that lands in FME is submissionRate * rejectionRate.
   */
  rejectionRate: number;
}

export const MORTGAGE_FLOW_EXPERIMENT = {
  key: FLAGS.MORTGAGE_APPLICATION_FLOW,
  name: "Mortgage Application Flow — Single-screen vs. 2-page",
  primaryMetric: "mortgage_application_submitted (submission rate)",
  guardrailMetric: "mortgage_estimated_fee_cents (avg fee per key)",
  baselineTreatment: "singleScreen",
  variantTreatment: "twoPage",

  // Refinance amount a submitter requests: same population/range regardless
  // of treatment, drawn uniform over a realistic mortgage-refinance band.
  refinanceAmountRangeCents: { min: 150_000_00, max: 600_000_00 },

  // Hydrator-only synthetic noise (never applied to the real quoted fee —
  // see lib/mortgage/fees.ts / app/api/mortgage/apply/route.ts, which must
  // stay deterministic for a given config). computeEstimatedFeeCents's
  // "zeroUpfrontHigherRate" branch returns an exact flat constant
  // (config.baseFeeCents) every time, so a large share of each arm's
  // synthetic submitters (100% − lowRatePointsShare) end up with a literal
  // point-mass of identical fee values. That degenerate distribution is the
  // same "variance is effectively zero" pathology D-016 hit with the AI
  // experiment's cost/latency events (see costJitterCents in
  // lib/experiment/config.ts) and produces an unusable, wildly wide
  // confidence interval on the "Avg estimated fee ($)" guardrail metric in
  // FME (observed: Impact 45.83% ±186370.72%, p=1.000). ± this uniform
  // spread on top of the real fee before tracking the event so the
  // guardrail's per-key variance is well-behaved; the arm-level mean is
  // unaffected (symmetric jitter averages out).
  feeJitterCents: 15_000, // ±$150 per submission

  // D-021: hydrator-only lender-revenue model (never applied to the real
  // borrower-facing fee). Real mortgage lenders have historically earned MORE
  // from the zero-upfront/higher-rate path than from points paid upfront at
  // close — a higher note rate sells at a premium on the secondary market,
  // i.e. a "yield spread premium" (significant enough a practice that Dodd-
  // Frank's Loan Officer Compensation rules were written specifically to curb
  // steering borrowers toward it). lowRatePointsUpfront's revenue is just the
  // points paid at close (same dollars as the borrower's fee — see
  // computeEstimatedFeeCents); zeroUpfrontHigherRate's revenue is the base fee
  // plus this percentage of the loan amount, standing in for the discounted
  // value of the rate spread. Continuous in refinanceAmountCents on BOTH
  // branches, so — unlike the flat-constant fee formula above — this already
  // has natural per-key variance; no additional jitter needed.
  yieldSpreadPremiumPct: 2.25,

  models: [
    {
      treatment: "singleScreen",
      submissionRate: 0.36,
      lowRatePointsShare: 0.4,
      // Submitters who make it through are, on average, slightly less
      // vetted than twoPage's guided flow produces — see rejectionRate
      // comment on MortgageTreatmentModel.
      rejectionRate: 0.14,
    },
    {
      treatment: "twoPage",
      submissionRate: 0.3,
      lowRatePointsShare: 0.65,
      rejectionRate: 0.1,
    },
  ] as MortgageTreatmentModel[],
};

/** Draw a submitter's pricing option + refinance amount, then compute the real fee
 * via the same lib/mortgage/fees.ts formula the live route uses (fed by the
 * banner flag's "on" Dynamic Config) — so simulated fees match production math.
 * Also computes the hydrator-only lenderRevenueCents (D-021, see
 * yieldSpreadPremiumPct above) — never part of the borrower-facing fee. */
export function sampleMortgageSubmission(
  model: MortgageTreatmentModel,
  rand: () => number
): {
  pricingOption: PricingOption;
  refinanceAmountCents: number;
  feeCents: number;
  lenderRevenueCents: number;
} {
  const pricingOption: PricingOption =
    rand() < model.lowRatePointsShare ? "lowRatePointsUpfront" : "zeroUpfrontHigherRate";
  const { min, max } = MORTGAGE_FLOW_EXPERIMENT.refinanceAmountRangeCents;
  const refinanceAmountCents = Math.round(min + rand() * (max - min));
  const bannerConfig = MORTGAGE_BANNER_CONFIG_BY_TREATMENT.on;
  const feeCents = computeEstimatedFeeCents(pricingOption, refinanceAmountCents, bannerConfig);
  const lenderRevenueCents =
    pricingOption === "lowRatePointsUpfront"
      ? feeCents
      : Math.max(0, Math.round(bannerConfig.baseFeeCents)) +
        Math.round(refinanceAmountCents * (MORTGAGE_FLOW_EXPERIMENT.yieldSpreadPremiumPct / 100));
  return { pricingOption, refinanceAmountCents, feeCents, lenderRevenueCents };
}
