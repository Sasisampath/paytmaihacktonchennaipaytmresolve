import test from "node:test";
import assert from "node:assert/strict";
import { exampleChecks, ledger, verifyPayment } from "../lib/payment.ts";
import { lastIssueStatus, saveIssue, updateIssue } from "../lib/issues.ts";
import { decodeStore } from "../lib/storage.ts";

for (const claim of exampleChecks) {
  test(`ledger example returns ${claim.status}`, () => {
    const result = verifyPayment(claim);
    assert.equal(result.status, claim.status);
    if (result.status === "received") assert.equal(result.evidence?.reference, "990000002006");
  });
}

test("wrong amount, distant time, and wrong reference never confirm", () => {
  const claim = exampleChecks[0];
  for (const change of [{ amount: 50_001 }, { time: "10:00" }, { reference: "990000000000" }]) {
    assert.equal(verifyPayment({ ...claim, ...change }).status, "not-verified");
  }
  assert.equal(verifyPayment({ ...claim, amount: NaN }).status, "more-details");
});

test("multiple candidate records or repeated references require more details", () => {
  assert.equal(verifyPayment(exampleChecks[0], [...ledger, { ...ledger[0], time: "16:00" }]).status, "more-details");
  assert.equal(verifyPayment({ ...exampleChecks[5], reference: "990000002009" }).status, "received");
});

test("issues deduplicate, recheck, close with history, and retain the verification outcome", () => {
  const claim = exampleChecks[1];
  const { issues, id } = saveIssue([], claim);
  assert.equal(id, "PR-1001");
  assert.equal(saveIssue(issues, claim).issues.length, 1);
  const rechecked = updateIssue(issues, id, "Rechecked");
  const closed = updateIssue(rechecked, id, "Closed");
  assert.equal(closed[0].state, "closed");
  assert.equal(lastIssueStatus(closed[0]), "not-verified");
  assert.deepEqual(closed[0].history.map(({ action }) => action), ["Saved", "Rechecked", "Closed"]);
  assert.deepEqual(updateIssue(closed, id, "Rechecked"), closed);
  assert.equal(saveIssue(closed, claim).id, "PR-1002");
  assert.throws(() => saveIssue(issues, exampleChecks[0]), /already has a matching receipt/);
});

test("issue state survives storage and invalid history is discarded", () => {
  const { issues, id } = saveIssue([], exampleChecks[1]);
  const closed = updateIssue(issues, id, "Closed");
  assert.deepEqual(decodeStore(JSON.stringify({ issues: closed })).issues, closed);
  assert.deepEqual(decodeStore(JSON.stringify({ issues: [{ ...closed[0], history: [] }] })).issues, []);
  assert.deepEqual(decodeStore("unparseable").issues, []);
});
