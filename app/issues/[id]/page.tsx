"use client";

import { useParams } from "next/navigation";
import { Archive, ClipboardList, RotateCw } from "lucide-react";
import { useRef, useState } from "react";
import { Action, ActionLink, DemoNote, Empty, ErrorMessage, PageTitle, Pill, Sheet, errorText } from "../../../components/ui";
import { PaymentResult } from "../../../components/payment-result";
import { transact, useHydrated, useStore } from "../../../lib/browser-store";
import { localDateTime, updateIssue } from "../../../lib/issues";
import { clockTime, verifyPayment } from "../../../lib/payment";
import { money } from "../../../lib/money";

export default function IssueDetails() {
  const { id } = useParams<{ id: string }>();
  const ready = useHydrated();
  const { issues } = useStore();
  const issue = issues.find((entry) => entry.id === id);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = useRef(false);
  if (!ready) return null;
  if (!issue) return <Empty title="Issue not found" detail="Cases are stored in the browser where they were saved." icon={ClipboardList}><ActionLink href="/issues">View Issues</ActionLink></Empty>;
  const { claim } = issue;

  async function update(action: "Rechecked" | "Closed") {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await transact((store) => ({ store: { ...store, issues: updateIssue(store.issues, id, action) }, result: undefined }));
      setShowConfirm(false);
      setNotice(action === "Closed" ? "Case closed. Check history has been kept." : "Payment rechecked against the simulated ledger.");
    } catch (error) {
      setError(errorText(error));
      setShowConfirm(false);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return <>
    <PageTitle title={issue.id} description="Payment issue" back={{ href: "/issues", label: "Payment issues" }} />
    <section className="card content-card">
      <div className="section-heading"><h2>Customer claim</h2><Pill status={issue.state} /></div>
      <dl className="detail-list"><div><dt>Claimed amount</dt><dd>{money(claim.amount)}</dd></div>
        <div><dt>Approximate time</dt><dd>{clockTime(claim.time)} IST</dd></div><div><dt>Claimed UPI reference</dt><dd>{claim.reference || "Not provided"}</dd></div></dl>
    </section>
    <PaymentResult claim={claim} verification={verifyPayment(claim)} />
    <ErrorMessage>{error}</ErrorMessage>
    {notice && <p className="notice success" role="status">{notice}</p>}
    {issue.state === "open" && <div className="actions-stack">
      <Action type="button" disabled={busy} onClick={() => update("Rechecked")}><RotateCw size={17} />Recheck Payment</Action>
      <Action type="button" tone="secondary" disabled={busy} onClick={() => setShowConfirm(true)}><Archive size={17} />Close Case</Action>
    </div>}
    <section className="card content-card"><h2>Case history</h2>
      <ol className="history">{[...issue.history].reverse().map((event, index) => <li key={`${event.at}-${index}`}>
        <span><strong>{event.action}</strong><small>{localDateTime(event.at)}</small></span>{"status" in event && <Pill status={event.status} />}
      </li>)}</ol>
    </section>
    <DemoNote>Cases and check history are stored on this browser.</DemoNote>
    {showConfirm && <Sheet title="Close this case?" onClose={() => { if (!busy) setShowConfirm(false); }}>
      <p>Closing archives this issue and keeps its payment status and check history.</p>
      <div className="actions-stack"><Action type="button" disabled={busy} onClick={() => update("Closed")}>Close Case</Action><Action type="button" tone="secondary" disabled={busy} onClick={() => setShowConfirm(false)}>Keep Open</Action></div>
    </Sheet>}
  </>;
}
