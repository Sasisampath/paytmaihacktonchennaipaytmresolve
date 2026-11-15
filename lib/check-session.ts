import { isClaim, type Claim } from "./payment.ts";

const key = "paytm-resolve:payment-check";

export function readClaim(): Claim | null {
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return isClaim(data) ? data : null;
  } catch {
    return null;
  }
}

export function writeClaim(claim: Claim) {
  try {
    sessionStorage.setItem(key, JSON.stringify(claim));
  } catch {
    throw new Error("Browser storage is unavailable. Enable site storage and try again.");
  }
}
