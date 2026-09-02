import type { MortgageBannerConfig } from "../flags/flags";
import type { PricingOption } from "../types";

// Estimated refinance fee (F6-style metric, tracked as an FME event/metric —
// see app/api/mortgage/apply/route.ts). Driven by the banner flag's Dynamic
// Config so a seller can retune the formula live in the FME console with no
// redeploy, mirroring lib/ai/claude.ts's use of ModelConfig.
//
// - lowRatePointsUpfront: the applicant pays points upfront for a lower rate.
//   Fee = flat processing fee + points (a % of the refinance amount).
// - zeroUpfrontHigherRate: no points; the applicant instead accepts a higher
//   rate over the life of the loan (zeroUpfrontRateDeltaBps, informational —
//   it shows up in the quoted rate, not as an upfront fee). Fee = flat
//   processing fee only.
export function computeEstimatedFeeCents(
  pricingOption: PricingOption,
  refinanceAmountCents: number,
  config: MortgageBannerConfig
): number {
  if (!Number.isFinite(refinanceAmountCents) || refinanceAmountCents <= 0) {
    return Math.max(0, Math.round(config.baseFeeCents));
  }

  if (pricingOption === "lowRatePointsUpfront") {
    const pointsFeeCents = Math.round(refinanceAmountCents * (config.lowRatePointsPct / 100));
    return Math.max(0, Math.round(config.baseFeeCents) + pointsFeeCents);
  }

  // zeroUpfrontHigherRate
  return Math.max(0, Math.round(config.baseFeeCents));
}

/** The effective quoted rate (bps) for the zero-upfront option, for display only. */
export function zeroUpfrontQuotedRateBps(baseRateBps: number, config: MortgageBannerConfig): number {
  return baseRateBps + config.zeroUpfrontRateDeltaBps;
}
