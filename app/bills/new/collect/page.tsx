"use client";

import { useRef, useState, type FormEvent } from "react";
import { Banknote, ClipboardPlus, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { Action, ActionLink, DemoDate, DemoNote, Empty, ErrorMessage, Field, PageTitle, Sheet, errorText } from "../../../../components/ui";
import { PaymentResult } from "../../../../components/payment-result";
import { commitDraft } from "../../../../lib/bill-store";
import { billTotal, receiptRef, type Draft, type Settlement } from "../../../../lib/billing";
import { transact, useHydrated, useStore } from "../../../../lib/browser-store";
import { saveIssue } from "../../../../lib/issues";
import { money } from "../../../../lib/money";
import { isReference, isTime, verifyPayment, type Claim } from "../../../../lib/payment";

export default function Collect() {
  const ready = useHydrated();
  const { draft } = useStore();
  if (!ready) return null;
  if (!draft || billTotal(draft) <= 0) return <Empty title="No bill to collect" detail="Create a bill before recording a payment."><ActionLink href="/bills/new">Create Bill</ActionLink></Empty>;
  return <Collection key={`${draft.id}:${draft.revision}`} draft={draft} />;
}

function Collection({ draft }: { draft: Draft }) {
  const router = useRouter();
  const { bills } = useStore();
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const [time, setTime] = useState("");
  const [reference, setReference] = useState("");
  const [claim, setClaim] = useState<Claim | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const amount = billTotal(draft);
  const verification = claim ? verifyPayment(claim) : null;
  const ref = verification?.evidence?.reference;
  const used = ref && bills.some((bill) => receiptRef(bill) === ref);

  async function run<T>(operation: () => Promise<T>, success: (result: T) => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      success(await operation());
    } catch (error) {
      setError(errorText(error));
      setConfirm(false);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function collect(settlement: Settlement) {
    return run(() => transact((store) => ({ store: commitDraft(store, draft, settlement), result: draft.id })),
      (id) => router.replace(`/bills/${id}`));
  }

  function check(event: FormEvent) {
    event.preventDefault();
    const cleanReference = reference.trim();
    if (!isTime(time) || !isReference(cleanReference)) return setError("Enter a valid time and an optional 12-digit UPI reference.");
    setError("");
    setClaim({ amount, time, reference: cleanReference });
  }

  return <>
    <PageTitle title="Collect payment" back={{ href: "/bills/new/review", label: "Review bill" }} />
    <div className="card collection-total"><span>Amount to collect</span><strong>{money(amount)}</strong></div>
    <div className="segments" aria-label="Payment method">
      <button type="button" disabled={busy} aria-pressed={method === "cash"} onClick={() => { setMethod("cash"); setError(""); }}><Banknote size={16} /> Cash</button>
      <button type="button" disabled={busy} aria-pressed={method === "upi"} onClick={() => { setMethod("upi"); setError(""); }}><ScanLine size={16} /> Simulated UPI</button>
    </div>
    {method === "cash" ? <div className="card content-card actions-stack">
      <h2>Record cash</h2><p>Record the bill after you have collected cash from the customer.</p>
      <Action type="button" disabled={busy} onClick={() => setConfirm(true)}><Banknote size={18} /> Record Cash</Action>
    </div> : <>
      <DemoDate />
      <form className="card form-card" onSubmit={check}>
        <h2>Simulated payment verification</h2>
        <Field label="Approximate payment time" type="time" required value={time} onChange={(event) => { setTime(event.target.value); setClaim(null); }} />
        <Field label="UPI reference (optional)" inputMode="numeric" maxLength={12} value={reference} onChange={(event) => { setReference(event.target.value); setClaim(null); }} />
        <Action type="submit" disabled={busy}><ScanLine size={18} /> Check UPI Payment</Action>
      </form>
      {claim && verification && <>
        <PaymentResult claim={claim} verification={verification} />
        {verification.status === "received" ? (used ? <ErrorMessage>This demo transaction is already linked to another bill.</ErrorMessage> :
          <Action type="button" className="full-action" disabled={busy} onClick={() => collect({ method: "upi", claim })}>Save Verified Demo Bill</Action>) :
          <Action type="button" tone="secondary" className="full-action" disabled={busy} onClick={() => run(() => transact((store) => {
            const { issues, id } = saveIssue(store.issues, claim);
            return { store: { ...store, issues }, result: id };
          }), (id) => router.push(`/issues/${id}`))}><ClipboardPlus size={17} /> Save as Issue</Action>}
      </>}
    </>}
    <ErrorMessage>{error}</ErrorMessage>
    <DemoNote>Cash is recorded by the merchant. UPI checks use a synthetic ledger.</DemoNote>
    {confirm && <Sheet title="Record cash collection?" onClose={() => { if (!busy) setConfirm(false); }}>
      <p>Confirm that you collected {money(amount)} in cash for this bill.</p>
      <div className="actions-stack">
        <Action type="button" disabled={busy} onClick={() => collect({ method: "cash" })}>Confirm Cash</Action>
        <Action type="button" tone="secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Action>
      </div>
    </Sheet>}
  </>;
}
