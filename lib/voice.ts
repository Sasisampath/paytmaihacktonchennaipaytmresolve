import { MAX_PAISE } from "./money.ts";
import { paiseWords, rupeeWords, spokenInteger, spokenPaise } from "./voice-numbers.ts";
import { catalogueSeed, isName, isQuantity, isUnit, parseQuantity, type Unit } from "./billing.ts";

export const maxCandidates = 12;
export const maxTranscript = 1_500;
export const maxRecordingSeconds = 25;
export const maxAudioBytes = 2 * 1024 * 1024;
export const audioFormats = {
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav",
} as const;
export type AudioFormat = keyof typeof audioFormats;

export type VoicePrice = { amount: number; basis: "per-unit" | "total" | "ambiguous" };
export type VoiceCandidate = {
  spokenName: string; productId: string | null; quantity: number | null; unit: Unit | null;
  spokenPrice: VoicePrice | null; evidence: string;
};
export type VoiceReview = { transcript: string; candidates: VoiceCandidate[] };

const productWords: Record<string, string[]> = {
  milk: ["milk", "milk packet", "மில்க்", "மில்க் பாக்கெட்", "பால்", "பால் பாக்கெட்", "paal", "pal"],
  rice: ["rice", "அரிசி", "arisi", "arichi"],
  sugar: ["sugar", "சர்க்கரை", "சக்கரை", "sakkarai", "sarkkarai", "சீனி"],
  biscuit: ["biscuit", "biscuits", "பிஸ்கட்", "பிஸ்கெட்", "பிஸ்கட்டுகள்", "biskat"],
  bread: ["bread", "பிரெட்", "பிரட்", "ரொட்டி"],
  oil: ["oil", "எண்ணெய்", "ennai"],
  chocolate: ["chocolate", "சாக்லேட்"],
  curd: ["curd", "தயிர்", "thayir"],
  "toor-dal": ["toor dal", "tovar dal", "துவரம் பருப்பு", "துவரம்பருப்பு", "thuvaram paruppu", "பருப்பு", "paruppu", "dal"],
  tea: ["tea powder", "டீ தூள்", "தேயிலை தூள்"],
};

const unitWords: Record<Unit, string[]> = {
  piece: ["piece", "pieces", "pcs", "துண்டு", "துண்டுகள்"],
  packet: ["packet", "packets", "pack", "packs", "பாக்கெட்", "பாக்கெட்டுகள்", "பொட்டலம்"],
  kg: ["kg", "kilo", "kilos", "kilogram", "kilograms", "கிலோ", "கிலோகிராம்"],
  litre: ["litre", "litres", "liter", "liters", "l", "லிட்டர்", "லிட்ர்"],
  bottle: ["bottle", "bottles", "பாட்டில்", "பாட்டில்கள்"],
};

export function normalizeWords(text: string) {
  return text.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

function spokenQuantity(text: string) {
  const word = normalizeWords(text);
  if (["அரை", "பாதி", "ara", "arai", "paadhi", "paathi", "padi", "half", "a half"].includes(word)) return 500;
  if (["கால்", "kaal", "quarter", "a quarter"].includes(word)) return 250;
  if (["ஒன்றரை", "ஒன்னரை", "onnarai", "ondrarai", "one and a half", "one and half"].includes(word)) return 1500;
  const whole = spokenInteger(word);
  if (whole !== null) return parseQuantity(String(whole), "kg");
  const digits = word.replace(/[௦-௯]/g, (digit) => String(digit.charCodeAt(0) - 0x0be6));
  return parseQuantity(digits, "kg");
}

type Span = { start: number; end: number };
const wordCharacter = /[\p{L}\p{M}\p{N}]/u;

function spansOf(source: string, term: string, limit = 70): Span[] {
  if (!term || term.length > limit) return [];
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
    return previous.end <= span.start && /^(?:[\s,]*|\s+of\s+)$/u.test(source.slice(previous.end, span.start));
  });
}

function catalogueId(name: string) {
  return Object.keys(productWords).find((id) => productWords[id].includes(name)) ?? null;
}

function removeEdgeTerm(name: string, term: string) {
  if (!term) return name;
  if (name.startsWith(`${term} `)) return name.slice(term.length + 1);
  if (name.endsWith(` ${term}`)) return name.slice(0, -term.length - 1);
  return name;
}

const maxEvidence = 280;
const fields = ["productText", "quantityText", "unitText", "priceText", "priceBasisText", "evidenceText"];
const explicitCurrency = new RegExp(`₹|(?:^|\\s)(?:${rupeeWords}|${paiseWords})(?=$|\\s)`, "iu");
const currencySuffix = new RegExp(`^\\s+(?:${rupeeWords}|${paiseWords})(?=$|[\\s,.])`, "iu");
const totalCue = "(?:motham|mottam|total|in total|மொத்தம்|மொத்தமாக|மொத்த விலை)";
const eachCue = "(?:each|apiece|per unit|per item|வீதம்|தலா|veetham|thalaa)";

function contains(outer: Span, inner: Span) {
  return inner.start >= outer.start && inner.end <= outer.end;
}

function unitFor(text: string) {
  return (Object.keys(unitWords) as Unit[]).find((unit) => unitWords[unit].includes(text));
}

function cueAtPrice(before: string, after: string, cue: string) {
  return new RegExp(`(?:^|[\\s,])${cue}$`, "u").test(before) || new RegExp(`^${cue}(?=$|[\\s,.])`, "u").test(after);
}

function readPriceBasis(source: string, scope: Span, price: Span, quantity: Span | undefined, measure: Span | undefined, unit: Unit | null) {
  const before = source.slice(scope.start, price.start).replace(/[\s,]+$/u, "");
  const after = source.slice(price.end, scope.end).replace(/^[\s,]+/u, "");
  const tail = after.replace(/[.,]$/u, "");
  if (cueAtPrice(before, tail, totalCue)) return "total";
  const afterMeasure = /^(?:\/\s*|per\s+)([\p{L}\p{M}]+)(?=$|[\s,.])/u.exec(tail)?.[1];
  const beforeMeasure = /(?:^|\s)per\s+([\p{L}\p{M}]+)$/u.exec(before)?.[1];
  if (afterMeasure || beforeMeasure) {
    const basisUnit = unitFor(afterMeasure ?? beforeMeasure!);
    return basisUnit && (!unit || basisUnit === unit) ? "per-unit" : "ambiguous";
  }
  if (cueAtPrice(before, tail, eachCue)) return "per-unit";
  const last = before.split(/[\s,]+/u).at(-1) ?? "";
  const lastStart = scope.start + before.length - last.length;
  const afterQuantity = quantity && lastStart >= Math.max(quantity.end, measure?.end ?? 0);
  if (afterQuantity && ((unit && unitFor(last.replace(/க்கு$/u, "")) === unit) ||
    ((unit === "packet" || unit === "piece" || unit === "bottle") && spokenInteger(last) === 1))) return "per-unit";
  return "ambiguous";
}

function findPrice(source: string, scope: Span, priceText: string) {
  const clean = normalizeWords(priceText).replace(/\s*(?:\/|per\s+)[\p{L}\p{M}]+$/u, "").trim();
  const modelSpans = spansOf(source, clean, 100).filter((span) => contains(scope, span));
  const currencySpans = [...source.slice(scope.start, scope.end).matchAll(/₹\s*[\d௦-௯]+(?:,[\d௦-௯]+)*(?:\.[\d௦-௯]{1,2})?(?![\d௦-௯]|[.,][\d௦-௯])/gu)]
    .map(({ index, 0: literal }) => ({ start: scope.start + index, end: scope.start + index + literal.length }));
  const matches = [...modelSpans, ...currencySpans].flatMap((span) => {
    const prefix = /₹\s*$/u.exec(source.slice(scope.start, span.start));
    const suffix = currencySuffix.exec(source.slice(span.end, scope.end));
    const extended = { start: span.start - (prefix?.[0].length ?? 0), end: span.end + (suffix?.[0].length ?? 0) };
    const literal = source.slice(extended.start, extended.end);
    const leading = source.slice(scope.start, extended.start);
    if (/(?:[-−+]|(?:^|\s)(?:minus|negative|மைனஸ்))\s*$/u.test(leading)) return [];
    if (!isWholeQuantity(source, span, clean || literal)) return [];
    const hasCurrency = explicitCurrency.test(literal);
    const amount = spokenPaise(literal);
    return amount === null ? [] : [{ span: extended, amount, hasCurrency }];
  });
  // Prefer a complete currency expression to a number without a currency marker.
  const unique = new Map<string, (typeof matches)[number]>();
  for (const match of matches.sort((a, b) => b.span.end - b.span.start - (a.span.end - a.span.start))) {
    if ([...unique.values()].some((other) => contains(other.span, match.span))) continue;
    unique.set(`${match.span.start}:${match.span.end}`, match);
  }
  const prices = [...unique.values()].filter((match) => match.hasCurrency);
  return prices.length === 1 ? prices[0] : prices.length === 0 && unique.size === 1 ? [...unique.values()][0] : null;
}

function evidenceFor(transcript: string, source: string, span: Span) {
  const literal = source.slice(span.start, span.end);
  const pattern = literal.split(" ").map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  return transcript.match(new RegExp(pattern, "iu"))?.[0] ?? literal;
}

export function extractCandidates(transcript: string, payload: unknown): VoiceCandidate[] {
  if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) return [];
  const source = normalizeWords(transcript);
  const items = payload.items.slice(0, maxCandidates);
  const productAnchors = items.flatMap((item) => isName(item?.productText) ? spansOf(source, normalizeWords(item.productText)) : []);
  const usedProducts = new Set<number>();
  const usedQuantities = new Set<number>();
  const candidates: VoiceCandidate[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || !isName(item.productText) ||
        typeof item.quantityText !== "string" || typeof item.unitText !== "string" ||
        Object.keys(item).some((key) => !fields.includes(key)) ||
        ["priceText", "priceBasisText", "evidenceText"].some((key) => key in item && typeof item[key] !== "string")) continue;
    const originalName = normalizeWords(item.productText);
    const quantityText = normalizeWords(item.quantityText);
    const unitText = normalizeWords(item.unitText);
    const matchingUnit = unitFor(unitText);
    if (spansOf(source, originalName).length === 0) continue;
    // Some model responses repeat adjacent quantity and unit terms inside the product phrase.
    const withoutQuantity = spokenQuantity(quantityText) === null ? originalName : removeEdgeTerm(originalName, quantityText);
    const name = matchingUnit && !catalogueId(withoutQuantity) ? removeEdgeTerm(withoutQuantity, unitText) : withoutQuantity;
    if (!isName(name) || name === quantityText || name === unitText) continue;
    const productSpans = spansOf(source, name).filter((span) => !usedProducts.has(span.start));
    if (productSpans.length === 0) continue;
    const suppliedEvidence = typeof item.evidenceText === "string" ? normalizeWords(item.evidenceText) : "";
    const evidenceSpans = spansOf(source, suppliedEvidence, maxEvidence);
    const quantitySpans = spansOf(source, quantityText).filter((span) =>
      !usedQuantities.has(span.start) && isWholeQuantity(source, span, quantityText));
    const unitSpans = spansOf(source, unitText);
    let productSpan = productSpans[0];
    let matchedQuantity: Span | undefined;
    let matchedMeasure: Span | undefined;
    let evidenceSpan: Span | undefined;
    let price: ReturnType<typeof findPrice> = null;
    for (const product of productSpans) {
      const scope = evidenceSpans.find((span) => contains(span, product) &&
        !productAnchors.some((anchor) => contains(span, anchor) && (anchor.end <= product.start || anchor.start >= product.end)));
      const proposedPrice = scope ? findPrice(source, scope, item.priceText ?? "") : null;
      const quantity = quantitySpans.find((number) => {
        if (scope && !contains(scope, number)) return false;
        if (proposedPrice?.hasCurrency && contains(proposedPrice.span, number)) return false;
        if (adjacent(source, [number, product])) return true;
        return unitSpans.some((measure) => (!scope || contains(scope, measure)) &&
          (adjacent(source, [number, measure, product]) || (scope && adjacent(source, [number, measure]) &&
            Math.min(Math.abs(number.start - product.end), Math.abs(product.start - number.end)) <= 20)));
      });
      if (!quantity && !scope) continue;
      productSpan = product;
      evidenceSpan = scope;
      matchedQuantity = quantity;
      price = proposedPrice;
      matchedMeasure = unitSpans.find((measure) => (!scope || contains(scope, measure)) &&
        (quantity ? adjacent(source, [quantity, measure, product]) ||
          (scope && adjacent(source, [quantity, measure])) ||
          (measure.start >= product.start && measure.end === product.end) : adjacent(source, [product, measure])));
      break;
    }
    usedProducts.add(productSpan.start);
    if (matchedQuantity) usedQuantities.add(matchedQuantity.start);
    const quantity = matchedQuantity ? spokenQuantity(quantityText) : null;
    const productId = catalogueId(name);
    const unitFromCatalogue = catalogueSeed.find((product) => product.id === productId)?.unit;
    const countUnit = unitFromCatalogue !== "kg" && unitFromCatalogue !== "litre";
    const allowed = matchedMeasure ? matchingUnit : countUnit ? unitFromCatalogue : undefined;
    let spokenPrice: VoicePrice | null = null;
    if (evidenceSpan && price) {
      const basis = readPriceBasis(source, evidenceSpan, price.span, matchedQuantity, matchedMeasure, allowed ?? null);
      if (price.hasCurrency || basis !== "ambiguous") spokenPrice = { amount: price.amount, basis };
    }
    const supported = evidenceSpan ?? {
      start: Math.min(productSpan.start, matchedQuantity?.start ?? Infinity, matchedMeasure?.start ?? Infinity),
      end: Math.max(productSpan.end, matchedQuantity?.end ?? 0, matchedMeasure?.end ?? 0),
    };
    candidates.push({
      spokenName: name === originalName ? item.productText.trim() : name,
      productId,
      quantity: allowed && !isQuantity(quantity, allowed) ? null : quantity,
      unit: allowed ?? null,
      spokenPrice,
      evidence: evidenceFor(transcript, source, supported),
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
      (item.quantity === null || isQuantity(item.quantity, item.unit ?? "kg")) &&
      typeof item.evidence === "string" && item.evidence.trim().length > 0 && item.evidence.length <= maxEvidence &&
      (item.spokenPrice === null || (item.spokenPrice && Number.isInteger(item.spokenPrice.amount) &&
        item.spokenPrice.amount > 0 && item.spokenPrice.amount <= MAX_PAISE &&
        ["per-unit", "total", "ambiguous"].includes(item.spokenPrice.basis))));
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
