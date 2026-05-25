// SERVER-ONLY.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "@/lib/constants";
import type { AnalysisResult } from "@/lib/types";

const MODEL = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

/**
 * Devuelve un cliente Anthropic. Si `overrideKey` viene (key que el usuario
 * proveyó desde el browser y enviamos por header), tiene prioridad sobre la
 * env var. Esto habilita el modo BYO sin tener que reiniciar el server.
 */
function getClient(overrideKey?: string): Anthropic {
  const apiKey = overrideKey?.trim() || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Sin API key. Configurá ANTHROPIC_API_KEY en .env.local o enviá una key desde Ajustes.",
    );
  }
  // Validación mínima del formato — atrapa typos antes de pegarle a la API
  if (!apiKey.startsWith("sk-ant-")) {
    throw new Error("API key inválida (debe empezar con 'sk-ant-')");
  }
  // No cacheamos el cliente porque la key puede variar por request.
  return new Anthropic({ apiKey });
}

function safeParse(raw: string): AnalysisResult | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned) as AnalysisResult;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as AnalysisResult;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Modo no-stream (request/response simple) ───────────────────────────────

export async function analyzeToken(
  systemPrompt: string,
  userPrompt: string,
  overrideKey?: string,
): Promise<AnalysisResult | null> {
  const anthropic = getClient(overrideKey);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");
  return safeParse(text);
}

// ─── Modo stream (entrega el JSON completo cuando termina) ─────────────────

/**
 * Versión que retorna un AsyncIterable de strings parciales del JSON.
 * Útil cuando el endpoint quiere mostrar progreso de generación al cliente.
 * El cliente acumula los chunks y, al final, parsea el JSON completo.
 */
export async function* analyzeTokenStream(
  systemPrompt: string,
  userPrompt: string,
  overrideKey?: string,
): AsyncGenerator<string, AnalysisResult | null, void> {
  const anthropic = getClient(overrideKey);
  let acc = "";

  // El SDK expone .stream() que emite eventos. Acumulamos los text_delta.
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      acc += event.delta.text;
      yield event.delta.text;
    }
  }

  return safeParse(acc);
}
