import { NextResponse } from "next/server";
import { fetchCmcGlobalMetrics } from "@/lib/server/cmc";

export const runtime = "nodejs";

export async function GET() {
  try {
    const global = await fetchCmcGlobalMetrics();
    return NextResponse.json({ ok: true, global });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
