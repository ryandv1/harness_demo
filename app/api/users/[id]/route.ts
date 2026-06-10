import { NextResponse } from "next/server";
import { getUserData } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const data = getUserData(params.id);
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
