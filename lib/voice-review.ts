import { lineTotal, parseQuantity, type Line, type Product, type Unit } from "./billing.ts";
import { MAX_PAISE, rupeeInput } from "./money.ts";
import { normalizeWords, type VoiceCandidate, type VoicePrice } from "./voice.ts";

export type PriceBasis = Exclude<VoicePrice["basis"], "ambiguous">;

export function voiceCatalogueMatches(candidate: VoiceCandidate, catalogue: Product[]) {
  const spoken = normalizeWords(candidate.spokenName);
  return catalogue.filter((entry) => entry.id === candidate.productId || normalizeWords(entry.name) === spoken);
}

export function reviewedUnitPrice(
  line: { id: string; name: string; quantity: string; unit: Unit | ""; productId?: string },
  product: Product | undefined,
  spoken: VoicePrice | null,
  basis: PriceBasis | null,
  spokenUnit?: Unit | null,
) {
  if (!spoken) return {
    price: product && product.unit === line.unit ? rupeeInput(product.price) : "",
    issue: "",
  };
  if (basis === "per-unit") {
    if (line.unit && spokenUnit && line.unit !== spokenUnit) {
      return { price: "", issue: `Enter a price for the new unit. The spoken price was per ${spokenUnit}.` };
    }
    return { price: rupeeInput(spoken.amount), issue: "" };
  }
  if (basis !== "total" || !line.unit) return { price: "", issue: "" };
  const quantity = parseQuantity(line.quantity, line.unit);
  if (quantity === null) return { price: "", issue: "" };

  const price = Math.round(spoken.amount * 1000 / quantity);
  const converted: Line = { ...line, unit: line.unit, price, quantity };
  if (price <= 0 || price > MAX_PAISE || lineTotal(converted) !== spoken.amount) {
    return { price: "", issue: "This total cannot be billed exactly at this quantity with a price in whole paise. Enter an agreed unit price." };
  }
  return { price: rupeeInput(price), issue: "" };
}
