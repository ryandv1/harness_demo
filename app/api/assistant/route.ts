import { NextResponse } from "next/server";
import { getUserData } from "@/lib/db";
import { askAssistant } from "@/lib/ai/claude";

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

  const result = await askAssistant(data, message.trim());
  return NextResponse.json(result);
}
