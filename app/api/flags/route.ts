import { NextResponse } from "next/server";
import { getUserData } from "@/lib/db";
import { getFlagClient, getFlagMode, evaluateFlag } from "@/lib/flags";
import { FLAG_DEFS } from "@/lib/flags/flags";

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

  const client = await getFlagClient();
  const attributes = { tier: data.user.tier };
  const evaluations = FLAG_DEFS.map((def) =>
    evaluateFlag(client, userId, def.key, attributes)
  );

  return NextResponse.json({ mode: getFlagMode(), evaluations });
}
