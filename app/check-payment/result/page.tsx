"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus, RotateCcw, ScanLine } from "lucide-react";
import { Action, ActionLink, DemoNote, Empty, ErrorMessage, PageTitle, errorText } from "../../../components/ui";
import { PaymentResult } from "../../../components/payment-result";
import { readClaim } from "../../../lib/check-session";
import { transact, useHydrated } from "../../../lib/browser-store";
import { saveIssue } from "../../../lib/issues";
import { verifyPayment } from "../../../lib/payment";

export default function Result() {
  const ready = useHydrated();
  const claim = ready ? readClaim() : null;
  const router = useRouter();
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!ready) return null;
  if (!claim) return <Empty title="No payment checked" detail="Enter the customer’s payment details to view a result." icon={ScanLine}><ActionLink href="/check-payment">Check a Payment</ActionLink></Empty>;
  const verification = verifyPayment(claim);
  async function save() {
    if (!claim || saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const id = await transact((store) => {
        const { issues, id } = saveIssue(store.issues, claim!);
        return { store: { ...store, issues }, result: id };
      });
      router.replace(`/issues/${id}`);
    } catch (error) {
      setError(errorText(error));
      saving.current = false;
      setBusy(false);
    }
  }
  return <>
    <PageTitle title="Payment result" back={{ href: "/check-payment", label: "Check payment" }} />
    <PaymentResult claim={claim} verification={verification} />
    <ErrorMessage>{error}</ErrorMessage>
    <div className="actions-stack">
      {verification.status !== "received" && <Action type="button" onClick={save} disabled={busy}><ClipboardPlus size={18} />{busy ? "Saving…" : "Save as Issue"}</Action>}
      <ActionLink href="/check-payment" tone={verification.status === "received" ? "primary" : "secondary"}><RotateCcw size={17} /> Check Again</ActionLink>
      <ActionLink href="/" tone="text">Back to Home</ActionLink>
    </div>
    <DemoNote>Verification uses synthetic merchant records.</DemoNote>
  </>;
}
