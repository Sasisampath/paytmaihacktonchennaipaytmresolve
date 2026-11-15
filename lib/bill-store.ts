import { changeDraft, finalizeBill, type Draft, type Settlement } from "./billing.ts";
import type { Store } from "./storage.ts";

export function editDraft(store: Store, expected: Draft | null, changes: Partial<Pick<Draft, "items" | "quickAmount" | "discount">>, fresh: Draft) {
  if (store.draft?.id !== expected?.id || store.draft?.revision !== expected?.revision) {
    throw new Error("The bill changed in another tab. Review the current draft and try again.");
  }
  return { ...store, draft: changeDraft(store.draft ?? fresh, changes) };
}

export function commitDraft(store: Store, expected: Draft, settlement: Settlement) {
  const previous = store.bills.find((bill) => bill.id === expected.id);
  if (previous) return store;
  if (store.draft?.id !== expected.id || store.draft.revision !== expected.revision) {
    throw new Error("The bill changed in another tab. Review the draft before continuing.");
  }
  const bill = finalizeBill(store.draft, store.bills, settlement);
  return { ...store, draft: null, bills: [bill, ...store.bills] };
}

export function resumeBill(store: Store, id: string): Store {
  if (store.draft?.id === id) return store;
  if (store.draft) throw new Error("Finish or save the current draft before resuming another bill.");
  const bill = store.bills.find((entry) => entry.id === id && entry.settlement.method === "saved");
  if (!bill) throw new Error("This saved bill is no longer available to edit.");
  const draft: Draft = {
    id: bill.id, revision: bill.revision + 1, items: bill.items, quickAmount: bill.quickAmount, discount: bill.discount,
  };
  return { ...store, draft, bills: store.bills.filter((entry) => entry.id !== id) };
}
