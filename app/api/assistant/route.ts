import { NextResponse } from "next/server";
import { getUserData } from "@/lib/db";
import { askAssistant } from "@/lib/ai/claude";
import { getFlagClient } from "@/lib/flags";
import { FLAGS, resolveModelConfig } from "@/lib/flags/flags";
import { AI_MODEL_EXPERIMENT } from "@/lib/experiment/config";

export const dynamic = "force-dynamic";

// Per-response cost estimate (cents) keyed by exp_assistant_modelChoice_web treatment. Reuses the
// experiment's ground-truth cost so live feedback and fixtures are comparable.
function estimateCostCents(treatment: string): number | undefined {
  return AI_MODEL_EXPERIMENT.models.find((m) => m.treatment === treatment)?.costCents;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  const message = body?.message;

  if (typeof userId !== "string" || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "userId and message are required" }, { status: 400 });
  }

  const data = getUserData(userId);
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Feature-flag gating (FME). Attributes drive targeting (e.g. tier -> model).
  const flags = await getFlagClient();
  const attributes = { tier: data.user.tier };

  // Kill switch: if the assistant flag is off, short-circuit (defense in depth —
  // the UI also disables itself).
  if (flags.getTreatment(userId, FLAGS.AI_ASSISTANT_ENABLED, attributes) === "off") {
    return NextResponse.json({
      reply: "The AI assistant is currently turned off.",
      source: "disabled",
    });
  }

  // Targeting / experiment: the exp_assistant_modelChoice_web treatment selects the arm,
  // and its Dynamic Configuration carries the model parameters (model, temperature,
  // maxTokens, system-prompt variant, context size) — changeable in FME with no redeploy.
  const { treatment: modelTreatment, config: modelConfigJson } =
    flags.getTreatmentWithConfig(userId, FLAGS.AI_MODEL, attributes);
  const modelConfig = resolveModelConfig(modelTreatment, modelConfigJson);

  const start = performance.now();
  const result = await askAssistant(data, message.trim(), modelConfig);
  const latencyMs = Math.round(performance.now() - start);

  // Return experiment metadata so the client can post thumbs-up/down feedback
  // attributed to the correct treatment (F6). Echo the resolved config for the demo.
  return NextResponse.json({
    ...result,
    treatment: modelTreatment,
    config: modelConfig,
    latencyMs,
    costCents: estimateCostCents(modelTreatment),
  });
}
