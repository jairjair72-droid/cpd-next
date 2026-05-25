import { NextResponse } from "next/server";
import { fetchCmcInfo } from "@/lib/server/cmc";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("symbols") ?? "";
    const symbols = raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 100);
    if (!symbols.length) {
      return NextResponse.json({ ok: false, error: "symbols vacío" }, { status: 400 });
    }
    const info = await fetchCmcInfo(symbols);
    return NextResponse.json({ ok: true, info });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
