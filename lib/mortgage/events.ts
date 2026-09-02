// Single source of truth for the FME event types the mortgage refinance
// experiment (exp_mortgage_applicationFlow_web) tracks. Mirrors
// lib/experiment/events.ts's pattern for the AI model experiment. Used by:
//   - app/api/mortgage/apply/route.ts — fires real events on every submission
//   - scripts/seed-event-types.ts — fires one of each so they appear in the FME
//     metric-definition dropdown immediately
//   - scripts/experiment-hydrator.ts — sends synthetic historical traffic so
//     the experiment has pre-populated results in the FME console (D-016 Path B)
//
// Keep names in sync with the metrics you create in the FME console.

export const MORTGAGE_TRAFFIC_TYPE = "user";

// eventTypeId rules (Split/FME): start alphanumeric, then [-_.a-zA-Z0-9], ≤80 chars.
export const MORTGAGE_EVENTS = {
  /** Primary conversion metric: "percent of unique keys with event". */
  applicationSubmitted: "mortgage_application_submitted",
  /** Guardrail/business metric: average value per key, in cents. */
  estimatedFeeCents: "mortgage_estimated_fee_cents",
  /**
   * Business/guardrail metric: average value per key, in cents. Lender-side
   * revenue (borrower fee + yield-spread-premium on the zero-upfront/higher-
   * rate option — see lib/mortgage/experiment.ts) — distinct from
   * estimatedFeeCents, which is what the borrower is quoted. Hydrator-only:
   * there is no live "revenue" concept in app/api/mortgage/apply/route.ts,
   * only the real fee. See D-021 in docs/DECISIONS.md.
   */
  estimatedLenderRevenueCents: "mortgage_estimated_lender_revenue_cents",
  /**
   * Secondary metric, deliberately measured as "percent of unique keys with
   * event" over ALL exposed keys (not conditional on submission) — mirroring
   * applicationSubmitted's shape, not estimatedFeeCents's. D-020 found that
   * "average value per user, conditional on a low firing rate" metrics render
   * an unusable confidence interval in FME regardless of data quality; an
   * unconditional count-style rate avoids that failure mode entirely. See
   * D-021.
   */
  applicationRejected: "mortgage_application_rejected",
} as const;

export type MortgageEventId = (typeof MORTGAGE_EVENTS)[keyof typeof MORTGAGE_EVENTS];

export const MORTGAGE_EVENT_IDS: MortgageEventId[] = Object.values(MORTGAGE_EVENTS);
