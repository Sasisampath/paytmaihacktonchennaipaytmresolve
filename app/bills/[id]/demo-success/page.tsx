"use client";

import { Plus, ReceiptText, Volume2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PaytmArt } from "../../../../components/paytm-art";
import { Action, ActionLink, Empty, ErrorMessage } from "../../../../components/ui";
import { useHydrated, useStore } from "../../../../lib/browser-store";
import { replayDemoPaymentSound } from "../../../../lib/demo-payment-sound";
import { money } from "../../../../lib/money";

export default function DemoSuccess() {
  const { id } = useParams<{ id: string }>();
  const ready = useHydrated();
  const { bills, draft } = useStore();
  const bill = bills.find((entry) => entry.id === id);
  const [soundError, setSoundError] = useState("");

  if (!ready) return null;
  if (!bill || bill.settlement.method !== "demo") {
    return <Empty title="Demo confirmation unavailable" detail="Open Bill history to see the saved payment status.">
      <ActionLink href="/bills">Bill History</ActionLink>
    </Empty>;
  }
  const { event } = bill.settlement;

  function replaySound() {
    setSoundError("");
    void replayDemoPaymentSound().catch(() => {
      setSoundError("The sound could not play. Check browser sound permissions and try Replay Sound again.");
    });
  }

  return <div className="demo-success">
    <section className="card demo-success-card" aria-labelledby="demo-success-title">
      <span className="demo-success-label">Demo Transaction</span>
      <PaytmArt file="payment-success-receipt.png" size={190} className="demo-success-art" />
      <h1 id="demo-success-title">Demo Payment Successful</h1>
      <strong className="demo-success-amount">{money(event.amount)}</strong>
      <p className="demo-success-note">Simulated UPI Payment · No money moved.</p>
      <dl className="demo-success-details">
        <dt>Simulated UPI reference</dt>
        <dd className="demo-reference">{event.reference}</dd>
      </dl>
      <Action type="button" tone="text" onClick={replaySound}><Volume2 size={16} /> Replay Sound</Action>
      <ErrorMessage>{soundError}</ErrorMessage>
    </section>
    <div className="actions-stack">
      <ActionLink href={`/bills/${id}`}><ReceiptText size={17} /> View Bill</ActionLink>
      <ActionLink href="/bills/new" tone="secondary"><Plus size={17} /> {draft ? "Continue Current Draft" : "Create Another Bill"}</ActionLink>
    </div>
  </div>;
}
