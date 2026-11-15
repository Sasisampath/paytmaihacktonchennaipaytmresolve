import { isDate } from "./issues.ts";
import { MAX_PAISE, parsePaise } from "./money.ts";
import { isClaim, verifyPayment, type Claim } from "./payment.ts";

export const units = ["piece", "packet", "kg", "litre", "bottle"] as const;
export type Unit = typeof units[number];
export type Product = { id: string; name: string; unit: Unit; price: number };
export type Line = { id: string; productId?: string; name: string; unit: Unit; price: number; quantity: number };
export type Draft = {
  id: string; revision: number; items: Line[]; quickAmount: number | null; discount: number;
};
export type Settlement = { method: "saved" } | { method: "cash" } | { method: "upi"; claim: Claim };
export type Bill = Draft & { savedAt: string; settlement: Settlement };

export const catalogueSeed: readonly Product[] = [
  { id: "milk", name: "Milk packet", unit: "packet", price: 2_800 },
  { id: "rice", name: "Rice", unit: "kg", price: 6_400 },
  { id: "sugar", name: "Sugar", unit: "kg", price: 4_600 },
  { id: "biscuit", name: "Biscuit", unit: "packet", price: 1_000 },
  { id: "bread", name: "Bread", unit: "packet", price: 4_000 },
  { id: "oil", name: "Oil", unit: "litre", price: 14_500 },
  { id: "chocolate", name: "Chocolate", unit: "piece", price: 2_000 },
  { id: "curd", name: "Curd", unit: "packet", price: 2_500 },
  { id: "toor-dal", name: "Toor dal", unit: "kg", price: 13_500 },
  { id: "tea", name: "Tea powder", unit: "packet", price: 5_500 },
];

const maxQuantity = 9_999_999;
const maxLines = 100;

export function isUnit(value: unknown): value is Unit {
  return units.some((unit) => unit === value);
}

export function isName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 70 &&
    !/^(?:null|undefined|n\/a)$/i.test(value.trim()) && /[\p{L}\p{N}]/u.test(value) && !/[\u0000-\u001f]/.test(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{1,50}$/.test(value);
}

function isPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_PAISE;
}

export function isQuantity(quantity: unknown, unit: Unit): quantity is number {
  return typeof quantity === "number" && Number.isSafeInteger(quantity) && quantity > 0 &&
    quantity <= maxQuantity && (unit === "kg" || unit === "litre" || quantity % 1_000 === 0);
}

export function parseQuantity(value: string, unit: Unit): number | null {
  const match = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const quantity = Number(match[1]) * 1_000 + Number((match[2] ?? "").padEnd(3, "0"));
  return isQuantity(quantity, unit) ? quantity : null;
}

export function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const { id, name, unit, price } = value as Product;
  return isId(id) && isName(name) && isUnit(unit) && isPrice(price);
}

export function isLine(value: unknown): value is Line {
  if (!isProduct(value)) return false;
  const { productId, quantity } = value as Line;
  return (productId === undefined || isId(productId)) && isQuantity(quantity, value.unit);
}

export function makeLine(id: string, input: { name: string; unit: Unit; price: string; quantity: string; productId?: string }): Line {
  const name = input.name.trim();
  const price = parsePaise(input.price);
  const quantity = parseQuantity(input.quantity, input.unit);
  if (!isName(name)) throw new Error("Enter a valid product name.");
  if (!isPrice(price)) throw new Error("Enter a selling price from ₹0.01 to ₹10,00,000 with up to two decimals.");
  if (quantity === null) throw new Error(input.unit === "kg" || input.unit === "litre" ?
    "Enter a positive quantity with up to three decimal places." : "Enter a whole quantity from 1 to 9,999.");
  return { id, name, unit: input.unit, price, quantity, productId: input.productId };
}

export function lineTotal({ price, quantity }: Line) {
  return Math.floor((price * quantity + 500) / 1_000);
}

export function subtotal({ items, quickAmount }: Draft) {
  return quickAmount ?? items.reduce((sum, item) => sum + lineTotal(item), 0);
}

export function billTotal(draft: Draft) {
  return subtotal(draft) - draft.discount;
}

export function newDraft(id: string): Draft {
  return { id, revision: 0, items: [], quickAmount: null, discount: 0 };
}

export function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Draft;
  const { id, revision, items, quickAmount, discount } = draft;
  if (!isId(id) || !Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(items) ||
      items.length > maxLines || !items.every(isLine) || new Set(items.map((item) => item.id)).size !== items.length ||
      (quickAmount !== null && (!isPrice(quickAmount) || items.length > 0)) ||
      !Number.isSafeInteger(discount) || discount < 0) return false;
  const sum = subtotal(draft);
  return sum <= MAX_PAISE && discount <= Math.max(0, sum - 1);
}

export function changeDraft(draft: Draft, changes: Partial<Pick<Draft, "items" | "quickAmount" | "discount">>): Draft {
  const next = { ...draft, ...changes, revision: draft.revision + 1 };
  const total = subtotal(next);
  if (total > MAX_PAISE) throw new Error("The bill subtotal cannot exceed ₹10,00,000.");
  if (changes.discount === undefined && next.discount >= total) next.discount = 0;
  if (changes.discount !== undefined && next.discount > Math.max(0, total - 1)) {
    throw new Error("Enter a discount smaller than the subtotal.");
  }
  if (!isDraft(next)) throw new Error("The bill contains an invalid item or exceeds 100 line items.");
  return next;
}

export function isBill(value: unknown): value is Bill {
  if (!isDraft(value) || billTotal(value) <= 0) return false;
  const { savedAt, settlement } = value as Bill;
  if (!isDate(savedAt) || !settlement || typeof settlement !== "object") return false;
  if (settlement.method === "saved" || settlement.method === "cash") return true;
  return settlement.method === "upi" && isClaim(settlement.claim) &&
    settlement.claim.amount === billTotal(value) && verifyPayment(settlement.claim).status === "received";
}

export function receiptRef(bill: Bill) {
  if (bill.settlement.method !== "upi") return;
  return verifyPayment(bill.settlement.claim).evidence?.reference;
}

export function finalizeBill(draft: Draft, bills: Bill[], settlement: Settlement, now = new Date().toISOString()): Bill {
  if (!isDraft(draft) || billTotal(draft) <= 0) throw new Error("Add items or a quick amount before saving a bill.");
  if (settlement.method === "upi") {
    const { claim } = settlement;
    const result = verifyPayment(claim);
    if (claim.amount !== billTotal(draft) || result.status !== "received" || !result.evidence) {
      throw new Error("A matching received payment for this bill is required.");
    }
    const reference = result.evidence.reference;
    if (bills.some((bill) => receiptRef(bill) === reference)) {
      throw new Error("This demo transaction is already linked to another bill.");
    }
  }
  return { ...draft, savedAt: now, settlement };
}

export function billNumber(id: string) {
  return `BL-${id.slice(0, 8).toUpperCase()}`;
}

export function quantityText(quantity: number, unit: Unit) {
  return `${quantity / 1_000} ${unit}`;
}
