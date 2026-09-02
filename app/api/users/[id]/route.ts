import { NextResponse } from "next/server";
import { getUserData } from "@/lib/db";

export const dynamic = "force-dynamic";

// Next 16: dynamic route `params` is async (Promise) and must be awaited.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = getUserData(id);
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
