import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "@/lib/constants";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
const USER_KEY_HEADER = "x-user-anthropic-key";

// ─── System prompts (los que aprobaste) ─────────────────────────────────────

const INDIVIDUAL_PROMPT = `Sos un analista técnico que describe datos de mercado de forma objetiva. Recibís los indicadores de un token cripto y los traducís a 2-3 oraciones en español neutro.

REGLAS ESTRICTAS:
1. Solo describí lo que muestran los números que te paso. No infieras nada que no esté en los datos.
2. PROHIBIDO predecir precios, prometer movimientos, o usar palabras como "explosivo", "inminente", "garantizado", "despegue", "luna", "moonshot", "rally asegurado".
3. PROHIBIDO afirmar qué pasó "históricamente" o "suele pasar" salvo que te pase estadísticas explícitas de validación.
4. Si los datos son ambiguos o contradictorios, decilo.
5. Si NO hay datos de validación (forward-test), terminá con una nota breve de incertidumbre.
Tono: sobrio, informativo, tipo terminal Bloomberg. NO tono de influencer cripto. Devolvé SOLO el texto, sin markdown ni comillas.`;

const GLOBAL_PROMPT = `Resumí el estado de un escaneo de mercado cripto en 2-3 oraciones en español neutro.

REGLAS ESTRICTAS:
1. Describí: clima general (Fear & Greed), cuántos setups de acumulación aparecieron, y 2-3 nombres destacados con su razón técnica concreta.
2. PROHIBIDO predecir, prometer movimientos, o usar lenguaje de hype ("explosivo", "inminente", etc.).
3. PROHIBIDO inventar estadísticas históricas. Si te paso datos del forward-test, podés citarlos; si no, no afirmes nada sobre "qué suele pasar".
4. Si el forward-test no tiene datos suficientes, decilo explícitamente en una frase corta.
Tono: sobrio, informativo. Devolvé SOLO el texto, sin markdown ni comillas.`;

function getClient(overrideKey?: string): Anthropic {
  const apiKey = overrideKey?.trim() || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Sin API key configurada");
  if (!apiKey.startsWith("sk-ant-")) throw new Error("API key inválida");
  return new Anthropic({ apiKey });
}

interface Body {
  mode: "individual" | "global";
  /** payload: para individual = indicadores del token; para global = resumen del scan */
  payload: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.mode || !body?.payload) {
      return NextResponse.json({ ok: false, error: "mode y payload requeridos" }, { status: 400 });
    }

    const overrideKey = req.headers.get(USER_KEY_HEADER) || undefined;
    const client = getClient(overrideKey);

    const system = body.mode === "individual" ? INDIVIDUAL_PROMPT : GLOBAL_PROMPT;

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 350, // narrativa corta — 2-3 oraciones
      system,
      messages: [{ role: "user", content: JSON.stringify(body.payload) }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join(" ")
      .trim();

    if (!text) {
      return NextResponse.json({ ok: false, error: "Respuesta vacía" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 502 });
  }
}