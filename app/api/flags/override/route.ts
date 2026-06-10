import { NextResponse } from "next/server";
import { getFlagMode } from "@/lib/flags";
import { setOverride } from "@/lib/flags/mockClient";

export const dynamic = "force-dynamic";

// Live flag toggling for demos in mock mode. In live FME mode this is disabled —
// you change the flag in the Harness FME UI and streaming propagates it.
export async function POST(req: Request) {
  if (getFlagMode() !== "mock") {
    return NextResponse.json(
      { error: "Overrides are mock-only. In FME mode, change the flag in the Harness FME UI." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const flag = body?.flag;
  const treatment = body?.treatment ?? null; // null clears the override

  if (typeof flag !== "string") {
    return NextResponse.json({ error: "flag is required" }, { status: 400 });
  }

  setOverride(flag, treatment);
  return NextResponse.json({ ok: true });
}
