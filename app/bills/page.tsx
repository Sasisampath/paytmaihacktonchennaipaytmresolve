"use client";

import { ChevronRight, Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BillLabel, BillPill } from "../../components/bill-ui";
import { ActionLink, DemoNote, Empty, Field, PageTitle } from "../../components/ui";
import { billNumber, billTotal } from "../../lib/billing";
import { useHydrated, useStore } from "../../lib/browser-store";
import { money } from "../../lib/money";

export default function Bills() {
  const ready = useHydrated();
  const { bills, draft } = useStore();
  const [query, setQuery] = useState("");
  const normal = query.trim().toLowerCase();
  const visible = bills.filter((bill) => [
    billNumber(bill.id), money(billTotal(bill)), bill.settlement.method, ...bill.items.map((item) => item.name),
  ].some((value) => value.toLowerCase().includes(normal)));
  return <>
    <PageTitle title="Bill history" description="Find saved bills and cash or demo UPI receipts." />
    <ActionLink href="/bills/new" className="full-action"><Plus size={17} /> {draft && billTotal(draft) > 0 ? "Continue Current Draft" : "Create Bill"}</ActionLink>
    {ready && bills.length > 0 && <Field label="Search bills" type="search" placeholder="Bill ID, amount, payment or product" value={query} onChange={(event) => setQuery(event.target.value)} />}
    {ready && (visible.length ? <div className="card list">
      {visible.map((bill) => <Link key={bill.id} href={`/bills/${bill.id}`} className="list-row">
        <i className="row-icon"><ReceiptText size={17} /></i>
        <div className="row-body"><BillLabel bill={bill} /></div>
        <div className="row-end"><strong>{money(billTotal(bill))}</strong><BillPill bill={bill} /></div>
        <ChevronRight className="chevron" size={16} />
      </Link>)}
    </div> : <Empty title={normal ? "No matching bills" : "No saved bills yet"} detail={normal ? "Try a different bill ID, amount, payment method, or product." : "Bills appear here when you save them or record a payment."} />)}
    <DemoNote>Bill history is stored locally in this browser.</DemoNote>
  </>;
}
