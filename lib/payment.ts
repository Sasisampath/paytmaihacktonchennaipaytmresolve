import { MAX_PAISE } from "./money.ts";

export const ledgerDate = "13 November 2026";
export const windowMinutes = 10;
export type Claim = { amount: number; time: string; reference: string };
type LedgerStatus = "received" | "pending" | "failed";
export type Status = LedgerStatus | "not-verified" | "unavailable" | "more-details";
export type LedgerRecord = Claim & { id: string; status: LedgerStatus };

export const ledger: readonly LedgerRecord[] = [
  { id: "DEMO-206", amount: 50_000, time: "09:48", reference: "990000002006", status: "received" },
  { id: "DEMO-207", amount: 24_000, time: "10:21", reference: "990000002007", status: "pending" },
  { id: "DEMO-208", amount: 18_000, time: "10:54", reference: "990000002008", status: "failed" },
  { id: "DEMO-209", amount: 32_000, time: "11:15", reference: "990000002009", status: "received" },
  { id: "DEMO-210", amount: 32_000, time: "11:21", reference: "990000002010", status: "received" },
  { id: "DEMO-211", amount: 9_000, time: "14:05", reference: "990000002011", status: "received" },
];

export const labels: Record<Status, string> = {
  received: "Received", "not-verified": "Not verified", pending: "Pending",
  failed: "Failed", unavailable: "Unavailable", "more-details": "More details needed",
};

export const exampleChecks: ReadonlyArray<Claim & { status: Status }> = [
  { amount: 50_000, time: "09:48", reference: "990000002006", status: "received" },
  { amount: 200_000, time: "09:48", reference: "", status: "not-verified" },
  { amount: 24_000, time: "10:21", reference: "990000002007", status: "pending" },
  { amount: 18_000, time: "10:54", reference: "990000002008", status: "failed" },
  { amount: 50_000, time: "12:10", reference: "", status: "unavailable" },
  { amount: 32_000, time: "11:18", reference: "", status: "more-details" },
];

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isReference(value: unknown): value is string {
  return typeof value === "string" && /^(?:\d{12})?$/.test(value);
}

export function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== "object") return false;
  const { amount, time, reference } = value as Claim;
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_PAISE &&
    isTime(time) && isReference(reference);
}

function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

export function clockTime(time: string) {
  const [hours, mins] = time.split(":");
  const hour = Number(hours);
  return `${hour % 12 || 12}:${mins} ${hour < 12 ? "AM" : "PM"}`;
}

export type Verification = {
  status: Status;
  reason: string;
  next: string;
  evidence?: LedgerRecord;
};

export function verifyPayment(claim: Claim, records = ledger): Verification {
  if (!isClaim(claim)) {
    return { status: "more-details", reason: "The payment details are incomplete or invalid.", next: "Enter a valid amount and time, plus the 12-digit reference if available." };
  }

  const time = minutes(claim.time);
  if (time >= 720 && time < 750) {
    return { status: "unavailable", reason: "The simulated merchant ledger is unavailable from 12:00 to 12:29 PM.", next: "Save the case and recheck later. Confirm the approximate payment time before retrying." };
  }

  const nearby = records.filter((record) => record.amount === claim.amount &&
    Math.abs(minutes(record.time) - time) <= windowMinutes);
  const matching = claim.reference ? nearby.filter((record) => record.reference === claim.reference) : nearby;
  if (matching.length === 0) {
    return { status: "not-verified", reason: "No merchant ledger entry matches the details entered.", next: "Ask for the UPI reference or confirm the amount and time. Save the case if it is unresolved." };
  }
  const [record] = matching;
  if (matching.length > 1 || records.filter((entry) => entry.reference === record.reference).length !== 1) {
    return { status: "more-details", reason: "The details do not identify a unique merchant ledger entry.", next: "Ask for the 12-digit UPI reference and check again." };
  }
  const details: Record<LedgerStatus, { reason: string; next: string }> = {
    received: { reason: "One merchant ledger entry matches and is marked received.", next: "Use the matching merchant record to complete this demo payment check." },
    pending: { reason: "The matching merchant entry is still pending.", next: "Save this case and recheck before treating the payment as received." },
    failed: { reason: "The matching merchant entry is marked failed.", next: "Ask the customer to check their UPI app and arrange another payment if needed." },
  };
  return { status: record.status, ...details[record.status], evidence: record };
}
