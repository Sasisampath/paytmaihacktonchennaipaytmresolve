"use client";

import { useRef, useState, type FormEvent } from "react";
import { Banknote, ClipboardPlus, FlaskConical, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { Action, ActionLink, DemoDate, DemoNote, Empty, ErrorMessage, Field, PageTitle, Sheet, errorText } from "../../../../components/ui";
import { DemoCheckoutQr } from "../../../../components/demo-checkout-qr";
import { PaymentResult } from "../../../../components/payment-result";
import { commitDraft, confirmDemoPayment } from "../../../../lib/bill-store";
import { billTotal, receiptRef, type Draft, type Settlement } from "../../../../lib/billing";
import { transact, useHydrated, useStore } from "../../../../lib/browser-store";
import { prepareDemoPaymentSound } from "../../../../lib/demo-payment-sound";
import { createDemoPaymentEvent } from "../../../../lib/demo-payment";
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
  const [showCheck, setShowCheck] = useState(false);
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
      return true;
    } catch (error) {
      setError(errorText(error));
      setConfirm(false);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function collect(settlement: Settlement) {
    return run(() => transact((store) => ({ store: commitDraft(store, draft, settlement), result: draft.id })),
      (id) => router.replace(`/bills/${id}`));
  }

  async function simulatePayment() {
    if (lock.current) return;
    const finishSound = prepareDemoPaymentSound();
    const event = createDemoPaymentEvent(draft, amount);
    const completed = await run(
      () => transact((store) => confirmDemoPayment(store, draft, event)),
      ({ billId, created }) => {
        finishSound?.(created);
        router.replace(`/bills/${billId}/demo-success`);
      },
    );
    if (!completed) finishSound?.(false);
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
    <DemoCheckoutQr billId={draft.id} revision={draft.revision} amount={amount} />
    <div className="actions-stack checkout-actions">
      <Action type="button" aria-haspopup="dialog" disabled={busy} onClick={() => { setShowCheck(true); setError(""); }}><ScanLine size={18} /> Check Payment Status</Action>
      <Action type="button" tone="secondary" aria-haspopup="dialog" disabled={busy} onClick={() => { setConfirm(true); setError(""); }}><Banknote size={18} /> Collected via Cash</Action>
    </div>
    <DemoNote>Payment checks use the synthetic merchant ledger.</DemoNote>
    <section className="presenter-panel" aria-label="Presenter controls">
      <div><FlaskConical size={15} /><h2>Presenter controls</h2></div>
      <Action type="button" tone="secondary" disabled={busy} onClick={simulatePayment}>Simulate Customer Payment</Action>
    </section>
    {showCheck && <Sheet title="Check payment status" onClose={() => { if (!busy) { setShowCheck(false); setError(""); } }}>
      <div className="checkout-check">
        <DemoDate />
        <form className="card form-card" onSubmit={check}>
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
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    </Sheet>}
    {!showCheck && <ErrorMessage>{error}</ErrorMessage>}
    {confirm && <Sheet title="Record cash collection?" onClose={() => { if (!busy) setConfirm(false); }}>
      <p>Confirm that you collected {money(amount)} in cash for this bill.</p>
      <div className="actions-stack">
        <Action type="button" disabled={busy} onClick={() => collect({ method: "cash" })}>Confirm Cash</Action>
        <Action type="button" tone="secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Action>
      </div>
    </Sheet>}
  </>;
}
