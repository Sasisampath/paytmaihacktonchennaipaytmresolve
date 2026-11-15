import { isClaim, labels, verifyPayment, type Claim, type Status } from "./payment.ts";

export type CheckEvent = {
  action: "Saved" | "Rechecked";
  at: string;
  status: Status;
} | { action: "Closed"; at: string };

export type Issue = {
  id: string;
  claim: Claim;
  state: "open" | "closed";
  history: CheckEvent[];
};

export function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

export function isIssue(value: unknown): value is Issue {
  if (!value || typeof value !== "object") return false;
  const { id, claim, state, history } = value as Issue;
  if (typeof id !== "string" || !/^PR-\d{4,10}$/.test(id) || !isClaim(claim) ||
      (state !== "open" && state !== "closed") || !Array.isArray(history) || history.length === 0) return false;
  return history.every((event, index) => {
    if (!event || !isDate(event.at)) return false;
    if (index === 0) return event.action === "Saved" && Object.hasOwn(labels, event.status);
    if (event.action === "Closed") return state === "closed" && index === history.length - 1;
    return event.action === "Rechecked" && Object.hasOwn(labels, event.status);
  }) && (history.at(-1)?.action === "Closed") === (state === "closed");
}

export function saveIssue(issues: Issue[], claim: Claim, now = new Date().toISOString()) {
  if (!isClaim(claim)) throw new Error("Enter valid payment details before saving.");
  const { status } = verifyPayment(claim);
  if (status === "received") throw new Error("This payment already has a matching receipt.");
  const existing = issues.find((issue) => issue.state === "open" &&
    issue.claim.amount === claim.amount && issue.claim.reference === claim.reference && issue.claim.time === claim.time);
  if (existing) return { issues, id: existing.id };
  const sequence = issues.reduce((largest, { id }) => Math.max(largest, Number(id.slice(3))), 1000);
  const id = `PR-${sequence + 1}`;
  const issue: Issue = { id, claim, state: "open", history: [{ action: "Saved", at: now, status }] };
  return { issues: [issue, ...issues], id };
}

export function updateIssue(issues: Issue[], id: string, action: "Rechecked" | "Closed", now = new Date().toISOString()) {
  return issues.map((issue): Issue => {
    if (issue.id !== id || issue.state === "closed") return issue;
    if (action === "Closed") {
      return { ...issue, state: "closed", history: [...issue.history, { action, at: now }] };
    }
    return { ...issue, history: [...issue.history, { action, at: now, status: verifyPayment(issue.claim).status }] };
  });
}

export function lastIssueStatus(issue: Issue) {
  return issue.history.findLast((event) => event.action !== "Closed")!.status;
}

export function localDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
