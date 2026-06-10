import { NextResponse } from "next/server";
import { getUserData } from "@/lib/db";
import { askAssistant } from "@/lib/ai/claude";
import { getFlagClient } from "@/lib/flags";
import { FLAGS } from "@/lib/flags/flags";

export const dynamic = "force-dynamic";

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

  // Targeting: the ai_model treatment selects which Claude model answers.
  const modelTreatment = flags.getTreatment(userId, FLAGS.AI_MODEL, attributes);

  const result = await askAssistant(data, message.trim(), modelTreatment);
  return NextResponse.json(result);
}
