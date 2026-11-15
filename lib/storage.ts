import { isIssue, type Issue } from "./issues.ts";

export type Store = { issues: Issue[] };
export const storeKey = "paytm-resolve:v1";
export const emptyStore: Store = { issues: [] };

export function decodeStore(raw: string | null): Store {
  if (!raw) return emptyStore;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyStore;
    const { issues } = parsed as Store;
    const validIssues = Array.isArray(issues) ? issues.filter(isIssue) : [];
    return { issues: [...new Map(validIssues.map((issue) => [issue.id, issue])).values()] };
  } catch {
    return emptyStore;
  }
}
