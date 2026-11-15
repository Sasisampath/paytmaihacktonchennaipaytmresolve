import { catalogueSeed, isName, isQuantity, isUnit, parseQuantity, type Unit } from "./billing.ts";

export const maxCandidates = 12;
export const maxTranscript = 1_500;
export const maxRecordingSeconds = 25;
export const maxAudioBytes = 2 * 1024 * 1024;
export const audioFormats = {
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav",
} as const;
export type AudioFormat = keyof typeof audioFormats;

export type VoiceCandidate = { spokenName: string; productId: string | null; quantity: number | null; unit: Unit | null };
export type VoiceReview = { transcript: string; candidates: VoiceCandidate[] };

const productWords: Record<string, string[]> = {
  milk: ["milk", "milk packet", "மில்க்", "மில்க் பாக்கெட்", "பால்", "பால் பாக்கெட்", "paal"],
  rice: ["rice", "அரிசி", "arisi"],
  sugar: ["sugar", "சர்க்கரை", "சக்கரை", "sakkarai", "sarkkarai", "சீனி"],
  biscuit: ["biscuit", "biscuits", "பிஸ்கட்", "பிஸ்கெட்", "பிஸ்கட்டுகள்", "biskat"],
  bread: ["bread", "பிரெட்", "பிரட்", "ரொட்டி"],
  oil: ["oil", "எண்ணெய்", "ennai"],
  chocolate: ["chocolate", "சாக்லேட்"],
  curd: ["curd", "தயிர்", "thayir"],
  "toor-dal": ["toor dal", "tovar dal", "துவரம் பருப்பு", "துவரம்பருப்பு", "thuvaram paruppu"],
  tea: ["tea powder", "டீ தூள்", "தேயிலை தூள்"],
};

const unitWords: Record<Unit, string[]> = {
  piece: ["piece", "pieces", "pcs", "துண்டு", "துண்டுகள்"],
  packet: ["packet", "packets", "pack", "packs", "பாக்கெட்", "பாக்கெட்டுகள்", "பொட்டலம்"],
  kg: ["kg", "kilo", "kilos", "kilogram", "kilograms", "கிலோ", "கிலோகிராம்"],
  litre: ["litre", "litres", "liter", "liters", "l", "லிட்டர்", "லிட்ர்"],
  bottle: ["bottle", "bottles", "பாட்டில்", "பாட்டில்கள்"],
};

const quantityWords = [
  ["one", "ஒரு", "ஒன்று", "onnu", "oru", "ondru"],
  ["two", "இரண்டு", "ரெண்டு", "ரண்டு", "irandu", "rendu", "randu"],
  ["three", "மூன்று", "மூணு", "moonu", "moondru"],
  ["four", "நான்கு", "நாலு", "naalu", "nangu"],
  ["five", "ஐந்து", "அஞ்சு", "anju", "aindhu"],
  ["six", "ஆறு", "aaru"],
  ["seven", "ஏழு", "ezhu"],
  ["eight", "எட்டு", "ettu"],
  ["nine", "ஒன்பது", "onbadhu"],
  ["ten", "பத்து", "pathu"],
];

export function normalizeWords(text: string) {
  return text.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

function spokenQuantity(text: string) {
  const word = normalizeWords(text);
  if (["அரை", "arai", "half", "a half"].includes(word)) return 500;
  if (["கால்", "kaal", "quarter", "a quarter"].includes(word)) return 250;
  if (["ஒன்றரை", "ஒன்னரை", "onnarai", "ondrarai", "one and a half"].includes(word)) return 1500;
  const index = quantityWords.findIndex((group) => group.includes(word));
  if (index >= 0) return (index + 1) * 1000;
  const digits = word.replace(/[௦-௯]/g, (digit) => String(digit.charCodeAt(0) - 0x0be6));
  return parseQuantity(digits, "kg");
}

type Span = { start: number; end: number };
const wordCharacter = /[\p{L}\p{M}\p{N}]/u;

function spansOf(source: string, term: string): Span[] {
  if (!term || term.length > 70) return [];
  const spans: Span[] = [];
  let start = source.indexOf(term);
  while (start >= 0) {
    const end = start + term.length;
    if (!wordCharacter.test(source[start - 1] ?? "") && !wordCharacter.test(source[end] ?? "")) {
      spans.push({ start, end });
    }
    start = source.indexOf(term, start + 1);
  }
  return spans;
}

function isWholeQuantity(source: string, span: Span, term: string) {
  const before = source.slice(0, span.start);
  const after = source.slice(span.end);
  if (/^[\d௦-௯]/u.test(term) && /(?:[+−-]|[\d௦-௯][.,/:])$/u.test(before)) return false;
  if (/[\d௦-௯]$/u.test(term) && /^[.,/:][\d௦-௯]/u.test(after)) return false;
  if (/(?:\band|\bplus)\s+(?:a\s+)?$/u.test(before)) return false;
  return !/^\s+(?:and|plus)\s+(?:a\s+)?(?:half|quarter)\b/u.test(after);
}

function adjacent(source: string, spans: Span[]) {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  return ordered.every((span, index) => {
    if (index === 0) return true;
    const previous = ordered[index - 1];
    return previous.end <= span.start && /^(?:\s*|\s+of\s+)$/u.test(source.slice(previous.end, span.start));
  });
}

export function extractCandidates(transcript: string, payload: unknown): VoiceCandidate[] {
  if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) return [];
  const source = normalizeWords(transcript);
  const usedProducts = new Set<number>();
  const usedQuantities = new Set<number>();
  const candidates: VoiceCandidate[] = [];
  for (const item of payload.items.slice(0, maxCandidates)) {
    if (!item || typeof item !== "object" || !isName(item.productText) ||
        typeof item.quantityText !== "string" || typeof item.unitText !== "string" ||
        Object.keys(item).some((key) => !["productText", "quantityText", "unitText"].includes(key))) continue;
    const name = normalizeWords(item.productText);
    const productSpans = spansOf(source, name).filter((span) => !usedProducts.has(span.start));
    if (productSpans.length === 0) continue;
    const quantityText = normalizeWords(item.quantityText);
    const unitText = normalizeWords(item.unitText);
    const quantitySpans = spansOf(source, quantityText).filter((span) =>
      !usedQuantities.has(span.start) && isWholeQuantity(source, span, quantityText));
    const unitSpans = spansOf(source, unitText);
    const matchingUnit = (Object.keys(unitWords) as Unit[]).find((unit) => unitWords[unit].includes(unitText));
    let productSpan = productSpans[0];
    let matchedQuantity: Span | undefined;
    let unit: Unit | null = null;
    for (const product of productSpans) {
      const quantity = quantitySpans.find((number) => {
        if (adjacent(source, [number, product])) return true;
        return unitSpans.some((measure) => adjacent(source, [number, measure, product]));
      });
      if (!quantity) continue;
      productSpan = product;
      matchedQuantity = quantity;
      if (matchingUnit && unitSpans.some((measure) => adjacent(source, [quantity, measure, product]) &&
          (adjacent(source, [quantity, measure]) || adjacent(source, [product, measure])))) unit = matchingUnit;
      break;
    }
    usedProducts.add(productSpan.start);
    if (matchedQuantity) usedQuantities.add(matchedQuantity.start);
    const quantity = matchedQuantity ? spokenQuantity(quantityText) : null;
    const productId = Object.keys(productWords).find((id) => productWords[id].includes(name)) ?? null;
    const unitFromCatalogue = catalogueSeed.find((product) => product.id === productId)?.unit;
    const countUnit = unitFromCatalogue !== "kg" && unitFromCatalogue !== "litre";
    const allowed = unit ?? (countUnit && !unitText ? unitFromCatalogue : undefined);
    candidates.push({
      spokenName: item.productText.trim(),
      productId,
      quantity: allowed && !isQuantity(quantity, allowed) ? null : quantity,
      unit: allowed ?? null,
    });
  }
  return candidates;
}

export function isVoiceReview(value: unknown): value is VoiceReview {
  if (!value || typeof value !== "object") return false;
  const { transcript, candidates } = value as VoiceReview;
  return typeof transcript === "string" && transcript.trim().length > 0 && transcript.length <= maxTranscript &&
    Array.isArray(candidates) && candidates.length > 0 && candidates.length <= maxCandidates &&
    candidates.every((item) => item && isName(item.spokenName) &&
      (item.productId === null || catalogueSeed.some(({ id }) => id === item.productId)) &&
      (item.unit === null || isUnit(item.unit)) &&
      (item.quantity === null || isQuantity(item.quantity, item.unit ?? "kg")));
}

export const sampleTranscript = "ரெண்டு மில்க் பாக்கெட், மூணு பிஸ்கட், ஒரு கிலோ சர்க்கரை, அரை கிலோ அரிசி";

export function sampleVoiceReview(): VoiceReview {
  return {
    transcript: sampleTranscript,
    candidates: extractCandidates(sampleTranscript, { items: [
      { productText: "மில்க் பாக்கெட்", quantityText: "ரெண்டு", unitText: "" },
      { productText: "பிஸ்கட்", quantityText: "மூணு", unitText: "" },
      { productText: "சர்க்கரை", quantityText: "ஒரு", unitText: "கிலோ" },
      { productText: "அரிசி", quantityText: "அரை", unitText: "கிலோ" },
    ] }),
  };
}
