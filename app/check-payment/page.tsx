"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, ScanLine } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Action, DemoDate, DemoNote, ErrorMessage, Field, PageTitle, Pill, errorText } from "../../components/ui";
import { clockTime, exampleChecks, isReference, isTime, labels } from "../../lib/payment";
import { money, parsePaise, rupeeInput } from "../../lib/money";
import { writeClaim } from "../../lib/check-session";

const empty = { amount: "", time: "", reference: "" };

export default function CheckPayment() {
  const router = useRouter();
  const [values, setValues] = useState(empty);
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = parsePaise(values.amount);
    const reference = values.reference.trim();
    if (amount === null || amount <= 0) return setError("Enter an amount from ₹0.01 to ₹10,00,000.");
    if (!isTime(values.time)) return setError("Enter the approximate payment time.");
    if (!isReference(reference)) return setError("Enter exactly 12 digits for the UPI reference, or leave it blank.");
    try {
      writeClaim({ amount, time: values.time, reference });
      router.push("/check-payment/result");
    } catch (error) {
      setError(errorText(error));
    }
  }

  return <>
    <PageTitle title="Check a payment" description="Look up a customer’s UPI payment in the simulated merchant ledger." />
    <DemoDate />
    <form className="card form-card" onSubmit={submit}>
      <Field label="Payment amount" prefix="₹" inputMode="decimal" placeholder="0.00" value={values.amount} onChange={(event) => setValues({ ...values, amount: event.target.value })} required />
      <Field label="Approximate payment time" type="time" value={values.time} onChange={(event) => setValues({ ...values, time: event.target.value })} required />
      <Field label="UPI reference (optional)" inputMode="numeric" hint="Find the 12-digit reference in the customer’s UPI app." maxLength={12} placeholder="e.g. 990000002006" value={values.reference} onChange={(event) => setValues({ ...values, reference: event.target.value })} />
      <ErrorMessage>{error}</ErrorMessage>
      <Action type="submit"><ScanLine size={18} /> Check Payment</Action>
    </form>
    <details className="card examples">
      <summary>Try a demo scenario <ChevronDown size={16} /></summary>
      {exampleChecks.map((example) => <button type="button" className="example-row" key={example.status} onClick={() => {
        setValues({ amount: rupeeInput(example.amount), time: example.time, reference: example.reference });
        setError("");
      }} aria-label={`Fill ${labels[example.status]} example`}>
        <span><strong>{money(example.amount)} · {clockTime(example.time)}</strong><small>{example.reference || "No reference"}</small></span>
        <Pill status={example.status} /><ArrowRight size={14} />
      </button>)}
    </details>
    <DemoNote>Demo records only. Screenshots cannot confirm receipt.</DemoNote>
  </>;
}
