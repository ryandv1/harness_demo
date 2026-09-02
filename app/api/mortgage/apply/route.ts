import { NextResponse } from "next/server";
import { getMortgage, recordMortgageApplication } from "@/lib/db";
import { getFlagClient } from "@/lib/flags";
import { FLAGS, resolveMortgageBannerConfig } from "@/lib/flags/flags";
import { computeEstimatedFeeCents } from "@/lib/mortgage/fees";
import { MORTGAGE_EVENTS } from "@/lib/mortgage/events";
import type { PricingOption } from "@/lib/types";

export const dynamic = "force-dynamic";

const PRICING_OPTIONS: PricingOption[] = ["lowRatePointsUpfront", "zeroUpfrontHigherRate"];

// Submits a mortgage refinance application (F6-style capture): persists the
// row, computes the estimated fee, and tracks TWO real FME metric events —
// mortgage_application_submitted (conversion) and mortgage_estimated_fee_cents
// (value) — attributed to the exp_mortgage_applicationFlow_web treatment the
// applicant was shown. The experiment itself is pre-populated via the hydrator
// (D-016 Path B); this route's live events add to, but don't replace, that
// seeded history — refer to the FME console for results, not an in-app UI.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  const treatment = body?.treatment;
  const pricingOption = body?.pricingOption;
  const refinanceAmountCents = body?.refinanceAmountCents;

  if (
    typeof userId !== "string" ||
    typeof treatment !== "string" ||
    !PRICING_OPTIONS.includes(pricingOption) ||
    typeof refinanceAmountCents !== "number" ||
    !Number.isFinite(refinanceAmountCents) ||
    refinanceAmountCents <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "userId, treatment, pricingOption ('lowRatePointsUpfront'|'zeroUpfrontHigherRate'), and a positive refinanceAmountCents are required",
      },
      { status: 400 }
    );
  }

  const mortgage = getMortgage(userId);
  if (!mortgage) {
    return NextResponse.json({ error: "No mortgage on file for this user" }, { status: 404 });
  }

  // Re-evaluate the banner flag's Dynamic Config server-side rather than trust
  // a client-supplied fee — the points%/base-fee params are the tunable knobs
  // a seller changes live in the FME console, so the server is the source of truth.
  const client = await getFlagClient();
  const { treatment: bannerTreatment, config: bannerConfigJson } = client.getTreatmentWithConfig(
    userId,
    FLAGS.MORTGAGE_REFI_BANNER
  );
  const bannerConfig = resolveMortgageBannerConfig(bannerTreatment, bannerConfigJson);
  const estimatedFeeCents = computeEstimatedFeeCents(
    pricingOption as PricingOption,
    refinanceAmountCents,
    bannerConfig
  );

  const application = recordMortgageApplication(
    { userId, treatment, pricingOption, refinanceAmountCents },
    estimatedFeeCents
  );

  client.track(userId, MORTGAGE_EVENTS.applicationSubmitted, 1);
  client.track(userId, MORTGAGE_EVENTS.estimatedFeeCents, estimatedFeeCents);

  return NextResponse.json({ application });
}
