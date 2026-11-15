import test from "node:test";
import assert from "node:assert/strict";
import { billTotal, changeDraft, finalizeBill, lineTotal, makeLine, newDraft, parseQuantity, receiptRef } from "../lib/billing.ts";
import { commitDraft, editDraft, resumeBill } from "../lib/bill-store.ts";
import { parsePaise } from "../lib/money.ts";
import { exampleChecks } from "../lib/payment.ts";
import { decodeStore, emptyStore } from "../lib/storage.ts";

test("paise inputs and decimal quantities validate without floating-point arithmetic", () => {
  assert.equal(parsePaise("64.01"), 6401);
  assert.equal(parsePaise("1000000"), 100_000_000);
  for (const invalid of ["10.001", "+1", "0xF", "1e2", "-4", "", "1000000.01"]) assert.equal(parsePaise(invalid), null);
  assert.equal(parseQuantity("0.5", "kg"), 500);
  assert.equal(parseQuantity("0.125", "litre"), 125);
  assert.equal(parseQuantity("0.125", "packet"), null);
  assert.equal(parseQuantity("1.0001", "kg"), null);
  assert.equal(parseQuantity("0", "kg"), null);
});

test("line prices, units, subtotal and discount agree in integer paise", () => {
  const rice = makeLine("rice", { name: "Rice", price: "64.01", quantity: "0.5", unit: "kg" });
  const milk = makeLine("milk", { name: "Milk", price: "28", quantity: "2", unit: "packet" });
  assert.equal(lineTotal(rice), 3201);
  assert.equal(lineTotal(milk), 5600);
  const draft = changeDraft(newDraft("draft"), { items: [rice, milk], discount: 101 });
  assert.equal(billTotal(draft), 8700);
  assert.throws(() => changeDraft(draft, { discount: 8801 }), /smaller/);
  assert.throws(() => makeLine("bad", { name: "Bread", price: "0", quantity: "1", unit: "packet" }), /selling price/);
  assert.throws(() => changeDraft(draft, { quickAmount: 1 }), /invalid item/);
});

test("cash stays merchant recorded and UPI requires the matching amount and unique reference", () => {
  const draft = changeDraft(newDraft("first"), { quickAmount: 50000 });
  const cash = finalizeBill(draft, [], { method: "cash" });
  assert.equal(cash.settlement.method, "cash");
  assert.equal(receiptRef(cash), undefined);
  const upi = finalizeBill(draft, [cash], { method: "upi", claim: exampleChecks[0] });
  assert.equal(upi.settlement.method, "upi");
  assert.equal(receiptRef(upi), "990000002006");
  assert.throws(() => finalizeBill({ ...draft, id: "second" }, [upi], { method: "upi", claim: { ...exampleChecks[0], reference: "" } }), /already linked/);
  assert.throws(() => finalizeBill(draft, [], { method: "upi", claim: exampleChecks[1] }), /matching received/);
  assert.throws(() => finalizeBill(draft, [], { method: "upi", claim: exampleChecks[2] }), /matching received/);
});

test("bill commit is idempotent, stale edits fail, and saved bills resume with the same ID", () => {
  const draft = changeDraft(newDraft("quick"), { quickAmount: 50000 });
  const store = { ...emptyStore, draft };
  assert.throws(() => editDraft(store, null, { quickAmount: 100 }, draft), /changed/);
  const saved = commitDraft(store, draft, { method: "saved" });
  assert.equal(saved.draft, null);
  assert.deepEqual(commitDraft(saved, draft, { method: "saved" }), saved);
  const resumed = resumeBill(saved, draft.id);
  assert.equal(resumed.draft?.id, draft.id);
  assert.equal(resumed.bills.length, 0);
  assert.throws(() => commitDraft(resumed, draft, { method: "cash" }), /changed/);
});

test("storage decodes legacy data, edited prices and unique receipts and rejects forged UPI", () => {
  const draft = changeDraft(newDraft("first"), { quickAmount: 50000 });
  const upi = finalizeBill(draft, [], { method: "upi", claim: exampleChecks[0] });
  const forged = { ...upi, id: "forged", settlement: { method: "upi", claim: exampleChecks[1] } };
  const duplicate = { ...upi, id: "duplicate" };
  const edited = { ...emptyStore.catalogue[0], price: 3500 };
  const decoded = decodeStore(JSON.stringify({ bills: [forged, upi, duplicate, upi], catalogue: [edited], draft }));
  assert.deepEqual(decoded.bills, [upi]);
  assert.equal(decoded.draft, null);
  assert.equal(decoded.catalogue[0].price, 3500);
  assert.equal(decodeStore(JSON.stringify({ issues: [] })).catalogue.length, 10);
});
