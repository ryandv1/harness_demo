import { NextResponse } from "next/server";
import { getUserData } from "@/lib/db";
import { evaluateAllFlags, getFlagMode, getFlagEnvironment } from "@/lib/flags";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const data = getUserData(userId);
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const evaluations = await evaluateAllFlags(userId, { tier: data.user.tier });

  return NextResponse.json({
    mode: getFlagMode(),
    environment: getFlagEnvironment(),
    evaluations,
  });
}
