"use client";

import { useParams, useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { BillPill, Receipt } from "../../../components/bill-ui";
import { Action, ActionLink, DemoNote, Empty, ErrorMessage, PageTitle, errorText } from "../../../components/ui";
import { PaymentResult } from "../../../components/payment-result";
import { billNumber } from "../../../lib/billing";
import { resumeBill } from "../../../lib/bill-store";
import { transact, useHydrated, useStore } from "../../../lib/browser-store";
import { localDateTime } from "../../../lib/issues";
import { verifyPayment } from "../../../lib/payment";

export default function BillDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ready = useHydrated();
  const { bills, draft } = useStore();
  const bill = bills.find((entry) => entry.id === id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  if (!ready) return null;
  if (!bill && draft?.id === id) return <Empty title="Bill in progress" detail="This bill is open in the bill editor."><ActionLink href="/bills/new">Continue Editing</ActionLink></Empty>;
  if (!bill) return <Empty title="Bill not found" detail="Bills are available in the browser where they were saved."><ActionLink href="/bills">Bill History</ActionLink></Empty>;
  const { settlement } = bill;

  async function edit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await transact((store) => ({ store: resumeBill(store, id), result: undefined }));
      router.replace("/bills/new");
    } catch (error) {
      setError(errorText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <>
    <PageTitle title={billNumber(id)} description={localDateTime(bill.savedAt)} back={{ href: "/bills", label: "Bill history" }} />
    <Receipt draft={bill} />
    <section className="card content-card settlement">
      <div className="section-heading"><h2>Payment</h2><BillPill bill={bill} /></div>
      <p>{settlement.method === "cash" ? "Cash recorded by merchant" : settlement.method === "upi" ? "Simulated payment verification" : settlement.method === "demo" ? "Demo Transaction · Simulated provider confirmation" : "Payment collection is still open."}</p>
      {settlement.method === "demo" && <p className="demo-reference">{settlement.event.reference}</p>}
    </section>
    {settlement.method === "upi" && <PaymentResult claim={settlement.claim} verification={verifyPayment(settlement.claim)} />}
    <ErrorMessage>{error}</ErrorMessage>
    {settlement.method === "saved" && <Action type="button" className="full-action" disabled={busy} onClick={edit}><Pencil size={16} /> Resume Bill</Action>}
    <DemoNote>Independent hackathon demo receipt.</DemoNote>
  </>;
}
