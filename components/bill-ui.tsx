"use client";

import { Pencil, Trash2 } from "lucide-react";
import { billNumber, billTotal, lineTotal, quantityText, subtotal, type Bill, type Draft, type Line, type Unit, units } from "../lib/billing";
import { money } from "../lib/money";
import { Pill } from "./ui";

export function UnitField({ value, onChange }: { value: Unit; onChange: (unit: Unit) => void }) {
  return <label className="field"><span>Unit</span><span className="field-control"><select value={value} onChange={(event) => onChange(event.target.value as Unit)}>
    {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
  </select></span></label>;
}

export function BillLine({ line, edit, remove }: { line: Line; edit?: () => void; remove?: () => void }) {
  return <li className="bill-line">
    <div className="bill-line-name"><strong>{line.name}</strong><small>{quantityText(line.quantity, line.unit)} × {money(line.price)}</small></div>
    <strong>{money(lineTotal(line))}</strong>
    {(edit || remove) && <div className="line-controls">
      {edit && <button className="icon-button" type="button" onClick={edit} aria-label={`Edit ${line.name}`}><Pencil size={15} /></button>}
      {remove && <button className="icon-button remove" type="button" onClick={remove} aria-label={`Remove ${line.name}`}><Trash2 size={15} /></button>}
    </div>}
  </li>;
}

export function Receipt({ draft }: { draft: Draft }) {
  return <section className="card receipt">
    <div className="receipt-header"><h2>{draft.quickAmount === null ? "Bill details" : "Amount-only bill"}</h2></div>
    {draft.quickAmount === null ? <ul>{draft.items.map((line) => <BillLine key={line.id} line={line} />)}</ul> :
      <div className="bill-line"><span>Quick amount</span><strong>{money(draft.quickAmount)}</strong></div>}
    <dl className="detail-list receipt-totals">
      <div><dt>Subtotal</dt><dd>{money(subtotal(draft))}</dd></div>
      <div><dt>Discount</dt><dd>{draft.discount ? `−${money(draft.discount)}` : money(0)}</dd></div>
      <div className="grand-total"><dt>Grand total</dt><dd>{money(billTotal(draft))}</dd></div>
    </dl>
  </section>;
}

export function BillPill({ bill }: { bill: Bill }) {
  const { method } = bill.settlement;
  if (method === "upi") return <Pill status="received">Demo UPI received</Pill>;
  return <Pill status={method} />;
}

export function BillLabel({ bill }: { bill: Bill }) {
  return <><strong>{billNumber(bill.id)}</strong><small>{bill.quickAmount === null ? `${bill.items.length} line item${bill.items.length === 1 ? "" : "s"}` : "Amount only"}</small></>;
}
