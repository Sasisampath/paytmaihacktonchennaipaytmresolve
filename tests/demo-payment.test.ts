import assert from "node:assert/strict";
import test from "node:test";
import { billTotal, changeDraft, isBill, newDraft, receiptRef } from "../lib/billing.ts";
import { commitDraft, confirmDemoPayment } from "../lib/bill-store.ts";
import { createDemoPaymentEvent } from "../lib/demo-payment.ts";
import { exampleChecks, verifyPayment } from "../lib/payment.ts";
import { decodeStore, emptyStore } from "../lib/storage.ts";

function checkout() {
  const draft = changeDraft(newDraft("demo-checkout"), { quickAmount: 50_000, discount: 123 });
  return { draft, store: { ...emptyStore, draft }, event: createDemoPaymentEvent(draft, billTotal(draft)) };
}

test("demo checkout saves the exact discounted amount and persists with its own reference", () => {
  const { draft, store, event } = checkout();
  const confirmed = confirmDemoPayment(store, draft, event);
  assert.deepEqual(confirmed.result, { billId: draft.id, created: true });
  assert.equal(confirmed.store.draft, null);
  const saved = confirmed.store.bills[0];
  assert.deepEqual(saved.settlement, { method: "demo", event });
  assert.equal(event.amount, 49_877);
  assert.equal(event.reference, "DEMO-UPI-demo-checkout");
  assert.equal(receiptRef(saved), undefined);
  assert.deepEqual(decodeStore(JSON.stringify(confirmed.store)), confirmed.store);
  assert.equal(isBill({ ...saved, settlement: { method: "demo", event: { ...event, amount: 49_876 } } }), false);
});

test("wrong bills, stale revisions, and changed totals cannot confirm a demo payment", () => {
  const { draft, store, event } = checkout();
  for (const altered of [
    { ...event, billId: "other" },
    { ...event, revision: event.revision - 1 },
    { ...event, amount: event.amount + 1 },
    { ...event, reference: "990000002006" },
  ]) {
    assert.throws(() => confirmDemoPayment(store, draft, altered), /does not match/);
  }
  const changed = changeDraft(draft, { discount: 0 });
  assert.throws(() => confirmDemoPayment({ ...store, draft: changed }, draft, event), /bill changed/);
  assert.deepEqual(store.bills, []);
});

test("replayed demo events are idempotent and cannot overwrite another collection", () => {
  const { draft, store, event } = checkout();
  const confirmed = confirmDemoPayment(store, draft, event);
  const persisted = decodeStore(JSON.stringify(confirmed.store));
  const duplicate = confirmDemoPayment(persisted, draft, event);
  assert.equal(duplicate.result.created, false);
  assert.equal(duplicate.store, persisted);
  assert.equal(duplicate.store.bills.length, 1);

  const cash = commitDraft(store, draft, { method: "cash" });
  assert.throws(() => confirmDemoPayment(cash, draft, event), /already been saved or collected/);
  assert.equal(cash.bills[0].settlement.method, "cash");
});

test("the presenter simulation neither supplies nor consumes ledger evidence", () => {
  const { draft, store, event } = checkout();
  const { store: simulated } = confirmDemoPayment(store, draft, event);
  assert.equal(verifyPayment({ amount: event.amount, time: "09:48", reference: event.reference }).status, "more-details");
  assert.equal(verifyPayment(exampleChecks[0]).status, "received");
  const upiDraft = changeDraft(newDraft("upi-checkout"), { quickAmount: 50_000 });
  const final = commitDraft({ ...simulated, draft: upiDraft }, upiDraft, { method: "upi", claim: exampleChecks[0] });
  assert.equal(receiptRef(final.bills[0]), "990000002006");
  assert.equal(final.bills[1].settlement.method, "demo");
});
