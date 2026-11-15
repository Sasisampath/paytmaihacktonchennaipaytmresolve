import { changeDraft, isLine, type Draft, type Line } from "./billing.ts";
import type { Store } from "./storage.ts";
import { normalizeWords } from "./voice.ts";

export type Impact = { line: Line; previousQuantity: number };

export function mergeVoiceLines(existing: Line[], additions: Line[]): { items: Line[]; impact: Impact[] } {
  const items = [...existing];
  const changes = new Map<string, Impact>();
  for (const line of additions) {
    if (!isLine(line)) throw new Error("Review the name, quantity, unit and price for every selected item.");
    const match = items.findIndex((item) => normalizeWords(item.name) === normalizeWords(line.name) &&
      item.unit === line.unit && item.price === line.price);
    if (match < 0) {
      items.push(line);
      changes.set(line.id, { line, previousQuantity: 0 });
      continue;
    }
    const original = items[match];
    const combined = { ...original, quantity: original.quantity + line.quantity };
    if (!isLine(combined)) throw new Error(`Combined quantity for ${line.name} is too large.`);
    items[match] = combined;
    changes.set(original.id, { line: combined, previousQuantity: changes.get(original.id)?.previousQuantity ?? original.quantity });
  }
  return { items, impact: [...changes.values()] };
}

export function applyVoiceBatch(store: Store, expected: Draft | null, fresh: Draft, batchId: string, additions: Line[]) {
  const { draft } = store;
  if (draft?.voiceBatches?.includes(batchId) || store.bills.some((bill) => bill.voiceBatches?.includes(batchId))) return store;
  if (draft?.id !== expected?.id || draft?.revision !== expected?.revision) {
    throw new Error("The bill changed while you were reviewing. Check the current draft and confirm again.");
  }
  if (draft?.quickAmount != null) throw new Error("Remove the quick amount before adding voice items.");
  if (additions.length === 0) throw new Error("Select at least one item to add.");
  const current = draft ?? fresh;
  const { items } = mergeVoiceLines(current.items, additions);
  const next = changeDraft(current, { items });
  return { ...store, draft: { ...next, voiceBatches: [...(current.voiceBatches ?? []), batchId].slice(-100) } };
}
