"use client";

import { ArrowDownLeft, ArrowRight, Check, ClipboardList, Clock3, Plus, ReceiptText, ScanLine, Store } from "lucide-react";
import Link from "next/link";
import { PaytmArt } from "../components/paytm-art";
import { BillLabel, BillPill } from "../components/bill-ui";
import { billTotal } from "../lib/billing";
import { DemoNote, Pill } from "../components/ui";
import { useStore } from "../lib/browser-store";
import { clockTime, ledger } from "../lib/payment";
import { money } from "../lib/money";

export default function Home() {
  const { issues, bills } = useStore();
  const open = issues.filter((issue) => issue.state === "open").length;
  const received = ledger.filter((record) => record.status === "received");
  return <div className="home">
    <div className="merchant">
      <span className="merchant-icon"><Store size={23} strokeWidth={1.85} /></span>
      <div><p>Merchant workspace</p><h1>Sri Murugan Stores</h1></div>
    </div>
    <section className="home-actions" aria-label="Merchant actions">
      <Link className="hero-action" href="/check-payment">
        <div className="hero-body">
          <span className="hero-icon"><ScanLine size={21} /></span>
          <h2>Check a Payment</h2>
          <p>Customer paid, but no<br /> confirmation?</p>
          <span className="hero-cta">Check Payment <ArrowRight size={16} /></span>
        </div>
        <span className="hero-art" aria-hidden="true"><span className="art-ring ring-outer" /><span className="art-ring ring-inner" /><span className="art-dot" /><span className="art-scan"><ScanLine size={70} strokeWidth={1.1} /><span className="art-check"><Check size={22} strokeWidth={2.8} /></span></span></span>
      </Link>
      <Link className="card secondary-action" href="/bills/new">
        <PaytmArt file="create-bill-home.png" size={53} />
        <span className="secondary-copy"><strong>Create a Bill</strong><small>Add products manually or by speaking Tamil.</small></span>
        <span className="secondary-cta"><Plus size={15} /> <span>Create Bill</span></span>
      </Link>
    </section>
    <section className="home-overview" aria-labelledby="overview-heading">
      <div className="section-heading"><h2 id="overview-heading">Merchant overview</h2><span>13 Nov 2026 ledger</span></div>
      <div className="stats">
        <div className="card stat"><i className="stat-green"><ArrowDownLeft size={16} /></i><strong>{money(received.reduce((sum, record) => sum + record.amount, 0))}</strong><span>Confirmed UPI<br /> demo receipts</span></div>
        <Link href="/issues" className="card stat"><i className="stat-amber"><ClipboardList size={15} /></i><strong>{open}</strong><span>Open issues</span></Link>
      </div>
    </section>
    <section aria-labelledby="bills-heading">
      <div className="section-heading"><h2 id="bills-heading">Recent bills</h2><Link href="/bills">View history <ArrowRight size={12} /></Link></div>
      <div className="card list">
        {bills.length ? bills.slice(0, 2).map((bill) => <Link key={bill.id} href={`/bills/${bill.id}`} className="list-row">
          <i className="row-icon"><ReceiptText size={16} /></i><div className="row-body"><BillLabel bill={bill} /></div>
          <div className="row-end"><strong>{money(billTotal(bill))}</strong><BillPill bill={bill} /></div>
        </Link>) : <div className="list-row home-empty"><PaytmArt file="no-bills.png" size={38} /><div className="row-body"><strong>No bills yet</strong><small>Saved bills will appear here.</small></div></div>}
      </div>
    </section>
    <section aria-labelledby="activity-heading">
      <div className="section-heading"><h2 id="activity-heading">Recent payment activity</h2></div>
      <div className="card list">
        {[ledger[2], ledger[1], ledger[0]].map((record) => <div className="list-row" key={record.id}>
          <i className={record.status === "received" ? "row-icon green" : "row-icon"}>{record.status === "received" ? <ArrowDownLeft size={18} /> : <Clock3 size={17} />}</i>
          <div className="row-body"><strong>UPI payment</strong><small>{clockTime(record.time)} · {record.id}</small></div>
          <div className="row-end"><strong>{money(record.amount)}</strong><Pill status={record.status} /></div>
        </div>)}
      </div>
    </section>
    <DemoNote>Synthetic ledger amounts · Independent hackathon prototype by PaytmKaro.</DemoNote>
  </div>;
}
