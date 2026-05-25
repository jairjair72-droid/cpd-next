import { NextResponse } from "next/server";
import { fetchFearGreed } from "@/lib/server/sentiment";

export const runtime = "nodejs";

export async function GET() {
  try {
    const fng = await fetchFearGreed();
    return NextResponse.json({ ok: true, fng });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}