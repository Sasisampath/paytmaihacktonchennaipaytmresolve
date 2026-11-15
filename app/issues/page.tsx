"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { useState } from "react";
import { ActionLink, Empty, PageTitle, Pill } from "../../components/ui";
import { useHydrated, useStore } from "../../lib/browser-store";
import { lastIssueStatus } from "../../lib/issues";
import { money } from "../../lib/money";

export default function Issues() {
  const ready = useHydrated();
  const { issues } = useStore();
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const count = issues.filter((issue) => issue.state === "open").length;
  const visible = issues.filter((issue) => issue.state === filter);
  return <>
    <PageTitle title="Payment issues" description="Track unresolved checks and keep a record of what happened." />
    <div className="segments" aria-label="Filter issues">
      <button type="button" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Open <span>{count}</span></button>
      <button type="button" aria-pressed={filter === "closed"} onClick={() => setFilter("closed")}>Closed <span>{issues.length - count}</span></button>
    </div>
    {ready && (visible.length ? <div className="card list">
      {visible.map((issue) => <Link key={issue.id} href={`/issues/${issue.id}`} className="list-row">
        <i className="row-icon"><ClipboardList size={18} /></i><div className="row-body"><strong>{issue.id}</strong><small>Customer claim</small></div>
        <div className="row-end"><strong>{money(issue.claim.amount)}</strong><Pill status={lastIssueStatus(issue)} /></div><ChevronRight className="chevron" size={16} />
      </Link>)}
    </div> : <Empty title={filter === "open" ? "No open issues" : "No closed issues"} detail={filter === "open" ? "Save a case after an unresolved payment check." : "Closed cases and their check history appear here."} icon={ClipboardList}>
      {filter === "open" && <ActionLink href="/check-payment" tone="secondary">Check a Payment</ActionLink>}
    </Empty>)}
  </>;
}
