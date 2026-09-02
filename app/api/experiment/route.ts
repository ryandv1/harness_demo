import { NextResponse } from "next/server";
import { getFeedbackResults } from "@/lib/db";
import { AI_MODEL_EXPERIMENT } from "@/lib/experiment/config";
import { buildResult } from "@/lib/sim/simulate";
import type { ExperimentResult, TreatmentResult } from "@/lib/experiment/types";
import fixtures from "@/lib/sim/fixtures.json";

export const dynamic = "force-dynamic";

// Returns the experiment readout (D-008, Path A). Default is the pre-baked
// fixtures — instant, no FME/network, always significant ("audible-ready").
// Any live thumbs-up/down feedback captured this session is blended in on top,
// so the demo can show real interactions moving the needle on the same chart.
export async function GET() {
  const config = AI_MODEL_EXPERIMENT;
  const fixture = fixtures as unknown as ExperimentResult;
  const live = getFeedbackResults();

  if (live.length === 0) {
    return NextResponse.json(fixture);
  }

  // Blend: add live counts/sums onto the fixture per treatment, recompute rates.
  const liveByTreatment = new Map(live.map((t) => [t.treatment, t]));
  const blended: TreatmentResult[] = fixture.treatments.map((base) => {
    const l = liveByTreatment.get(base.treatment);
    if (!l) return base;
    const exposures = base.exposures + l.exposures;
    const conversions = base.conversions + l.conversions;
    // Exposure-weighted averages for the secondary metrics.
    const avgLatencyMs = Math.round(
      (base.avgLatencyMs * base.exposures + l.avgLatencyMs * l.exposures) / exposures
    );
    const avgCostCents = Number(
      (
        (base.avgCostCents * base.exposures + l.avgCostCents * l.exposures) /
        exposures
      ).toFixed(4)
    );
    return {
      treatment: base.treatment,
      exposures,
      conversions,
      conversionRate: exposures ? conversions / exposures : 0,
      avgLatencyMs,
      avgCostCents,
    };
  });

  const result = buildResult(config, blended, "blended");
  return NextResponse.json(result);
}
