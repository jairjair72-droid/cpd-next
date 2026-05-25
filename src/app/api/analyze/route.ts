import { NextResponse } from "next/server";
import { analyzeToken, analyzeTokenStream } from "@/lib/server/claude";
import { SYSTEM_PROMPT } from "@/lib/constants";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";
// Si vas a hacer streaming en Vercel Pro, descomentá esto y subí el tope.
// En el plan Hobby el máximo es 10s, así que el stream tiene que ser cortito.
// export const maxDuration = 60;

const USER_KEY_HEADER = "x-user-anthropic-key";

interface Body {
  token: Record<string, unknown>;
  systemPrompt?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.token || typeof body.token !== "object") {
      return NextResponse.json({ ok: false, error: "token requerido" }, { status: 400 });
    }

    // Key override: si el browser nos manda una key (BYO), la usamos.
    const overrideKey = req.headers.get(USER_KEY_HEADER) || undefined;
    const url = new URL(req.url);
    const wantStream = url.searchParams.get("stream") === "1";

    const sys = body.systemPrompt ?? SYSTEM_PROMPT;
    const user = JSON.stringify(body.token);

    if (!wantStream) {
      const result = await analyzeToken(sys, user, overrideKey);
      if (!result) {
        return NextResponse.json(
          { ok: false, error: "Respuesta del modelo no parseable" },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, analysis: result });
    }

    // ─── Streaming: respondemos con text/event-stream (SSE) ─────────────────
    // Cada chunk del modelo va como evento `data: { delta: "..." }`.
    // Al terminar, evento `data: { done: true, analysis: {...} }`.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          const gen = analyzeTokenStream(sys, user, overrideKey);
          let result: AnalysisResult | null = null;
          while (true) {
            const next = await gen.next();
            if (next.done) {
              result = next.value;
              break;
            }
            send({ delta: next.value });
          }
          send({ done: true, analysis: result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          send({ error: msg.slice(0, 200) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: msg.slice(0, 200) },
      { status: 502 },
    );
  }
}
