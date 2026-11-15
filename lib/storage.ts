import { catalogueSeed, isBill, isDraft, isProduct, receiptRef, type Bill, type Draft, type Product } from "./billing.ts";
import { isIssue, type Issue } from "./issues.ts";

export type Store = { issues: Issue[]; bills: Bill[]; draft: Draft | null; catalogue: Product[] };
export const storeKey = "paytm-resolve:v1";
export const emptyStore: Store = { issues: [], bills: [], draft: null, catalogue: [...catalogueSeed] };

export function decodeStore(raw: string | null): Store {
  if (!raw) return emptyStore;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyStore;
    const { issues, draft, bills, catalogue } = parsed as Store;
    const validIssues = Array.isArray(issues) ? issues.filter(isIssue) : [];
    const validBills: Bill[] = [];
    const billIds = new Set<string>();
    const refs = new Set<string>();
    for (const bill of Array.isArray(bills) ? bills : []) {
      if (!isBill(bill) || billIds.has(bill.id)) continue;
      const ref = receiptRef(bill);
      if (ref && refs.has(ref)) continue;
      billIds.add(bill.id);
      if (ref) refs.add(ref);
      validBills.push(bill);
    }
    const edited = new Map((Array.isArray(catalogue) ? catalogue.filter(isProduct) : []).map((product) => [product.id, product]));
    return {
      issues: [...new Map(validIssues.map((issue) => [issue.id, issue])).values()],
      bills: validBills,
      draft: isDraft(draft) && !billIds.has(draft.id) ? draft : null,
      catalogue: catalogueSeed.map((seed) => edited.get(seed.id) ?? seed),
    };
  } catch {
    return emptyStore;
  }
}
