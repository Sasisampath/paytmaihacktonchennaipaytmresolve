"use client";

import { ArrowRight, Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Receipt } from "../../../../components/bill-ui";
import { Action, ActionLink, Empty, ErrorMessage, Field, PageTitle, errorText } from "../../../../components/ui";
import { commitDraft, editDraft } from "../../../../lib/bill-store";
import { billTotal } from "../../../../lib/billing";
import { transact, useHydrated, useStore } from "../../../../lib/browser-store";
import { parsePaise, rupeeInput } from "../../../../lib/money";

export default function BillReview() {
  const ready = useHydrated();
  const { draft } = useStore();
  if (!ready) return null;
  if (!draft || billTotal(draft) <= 0) return <Empty title="No bill to review" detail="Add items or a quick amount first."><ActionLink href="/bills/new">Create Bill</ActionLink></Empty>;
  return <ReviewForm key={draft.id} draft={draft} />;
}

function ReviewForm({ draft }: { draft: NonNullable<ReturnType<typeof useStore>["draft"]> }) {
  const router = useRouter();
  const [discount, setDiscount] = useState(rupeeInput(draft.discount));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function act(mode: "apply" | "save" | "collect", event?: FormEvent) {
    event?.preventDefault();
    if (lock.current) return;
    const amount = parsePaise(discount === "" ? "0" : discount);
    if (amount === null) return setError("Enter a valid discount with up to two decimal places.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode !== "collect" || amount !== draft.discount) {
        await transact((store) => {
          const edited = amount === draft.discount ? store : editDraft(store, draft, { discount: amount }, draft);
          const expected = amount === draft.discount ? draft : edited.draft!;
          return { store: mode === "save" ? commitDraft(edited, expected, { method: "saved" }) : edited, result: undefined };
        });
      }
      if (mode === "save") router.replace(`/bills/${draft.id}`);
      if (mode === "collect") router.push("/bills/new/collect");
    } catch (error) {
      setError(errorText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <>
    <PageTitle title="Review bill" description="Confirm the quantities and prices before collecting payment." back={{ href: "/bills/new", label: "Edit Bill" }} />
    <Receipt draft={draft} illustrated />
    <form className="card discount-form" onSubmit={(event) => act("apply", event)}>
      <Field label="Discount amount" prefix="₹" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} />
      <Action type="submit" tone="secondary" disabled={busy}>Apply</Action>
    </form>
    <ErrorMessage>{error}</ErrorMessage>
    <div className="actions-stack">
      <Action type="button" onClick={() => act("collect")} disabled={busy}>Continue to Payment <ArrowRight size={17} /></Action>
      <Action type="button" tone="secondary" onClick={() => act("save")} disabled={busy}><Bookmark size={17} /> Save for Later</Action>
    </div>
  </>;
}
