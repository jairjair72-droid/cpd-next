import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface Body {
  token: string;
  chatId: string;
  text: string;
}

/**
 * Proxy hacia api.telegram.org. Telegram igual permite CORS desde el browser
 * (es uno de los pocos), pero pasarlo por acá nos permite, en el futuro,
 * mover el token a una env var del server.
 */
export async function POST(req: Request) {
  try {
    const { token, chatId, text } = (await req.json()) as Body;
    if (!token || !chatId || !text) {
      return NextResponse.json(
        { ok: false, error: "Faltan token, chatId o text" },
        { status: 400 },
      );
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    const data = await res.json();
    return NextResponse.json({ ok: !!data.ok, telegram: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
