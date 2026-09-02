"use client";

import Link from "next/link";
import type { FlagEvaluation } from "@/lib/flags/types";
import { resolveMortgageBannerConfig } from "@/lib/flags/flags";

// Refinance announcement banner, gated by rel_mortgage_refinanceBanner_web. All
// copy (headline, promoted rate, blurb, CTA) comes from the flag's Dynamic
// Configuration — a seller can change the promoted rate live in the FME
// console and this banner updates on the open SSE connection, no redeploy.
export default function MortgageBanner({
  evaluation,
  userId,
}: {
  evaluation: FlagEvaluation | undefined;
  userId: string;
}) {
  if (!evaluation || evaluation.treatment !== "on") return null;

  const config = resolveMortgageBannerConfig(evaluation.treatment, evaluation.config);
  if (!config.headline) return null;

  return (
    <Link href={`/mortgage/apply?userId=${userId}`} className="mortgage-banner">
      <div className="mortgage-banner-copy">
        <span className="mortgage-banner-rate">{config.promotedRateLabel}</span>
        <span className="mortgage-banner-headline">{config.headline}</span>
        <span className="mortgage-banner-blurb">{config.detailsBlurb}</span>
      </div>
      <span className="mortgage-banner-cta">{config.ctaLabel} →</span>
    </Link>
  );
}
