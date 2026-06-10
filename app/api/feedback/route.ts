import { NextResponse } from "next/server";
import { recordFeedback } from "@/lib/db";

export const dynamic = "force-dynamic";

// Live experiment metric capture (F6). The assistant UI posts a thumbs-up/down
// for an answer, attributed to the ai_model treatment that produced it. These
// rows are blended with the simulated fixtures by the experiment dashboard.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  const treatment = body?.treatment;
  const rating = body?.rating;

  if (
    typeof userId !== "string" ||
    typeof treatment !== "string" ||
    (rating !== "up" && rating !== "down")
  ) {
    return NextResponse.json(
      { error: "userId, treatment, and rating ('up'|'down') are required" },
      { status: 400 }
    );
  }

  const latencyMs =
    typeof body?.latencyMs === "number" ? Math.round(body.latencyMs) : undefined;
  const costCents = typeof body?.costCents === "number" ? body.costCents : undefined;

  recordFeedback({ userId, treatment, rating, latencyMs, costCents });
  return NextResponse.json({ ok: true });
}
