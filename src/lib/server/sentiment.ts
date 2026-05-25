// SERVER-ONLY. Fear & Greed Index público de Alternative.me. Sin auth.
import "server-only";
import type { FearGreedIndex } from "@/lib/types";

interface FngApiResponse {
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
  }>;
}

const VALID_CLASS = new Set([
  "Extreme Fear",
  "Fear",
  "Neutral",
  "Greed",
  "Extreme Greed",
]);

export async function fetchFearGreed(): Promise<FearGreedIndex> {
  const res = await fetch("https://api.alternative.me/fng/?limit=1", {
    next: { revalidate: 3600 }, // 1h — el índice se actualiza una vez por día
  });
  if (!res.ok) throw new Error(`F&G HTTP ${res.status}`);
  const json = (await res.json()) as FngApiResponse;
  if (!json.data?.length) throw new Error("F&G respuesta vacía");

  const entry = json.data[0];
  const cls = VALID_CLASS.has(entry.value_classification)
    ? (entry.value_classification as FearGreedIndex["classification"])
    : "Neutral";

  return {
    value: parseInt(entry.value, 10) || 50,
    classification: cls,
    timestamp: parseInt(entry.timestamp, 10) * 1000,
  };
}