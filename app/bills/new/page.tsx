"use client";

import { Calculator, ChevronRight, Pencil, Plus, ReceiptText, Search } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { BillLine, UnitField } from "../../../components/bill-ui";
import { Action, ActionLink, DemoNote, Empty, ErrorMessage, Field, PageTitle, Sheet, errorText } from "../../../components/ui";
import { billTotal, makeLine, newDraft, type Draft, type Line, type Product, type Unit } from "../../../lib/billing";
import { editDraft } from "../../../lib/bill-store";
import { transact, useHydrated, useStore } from "../../../lib/browser-store";
import { money, parsePaise, rupeeInput } from "../../../lib/money";

type Editor = { name: string; quantity: string; price: string; unit: Unit; productId?: string; lineId?: string; catalogueId?: string };
type Panel = "products" | "item" | "quick" | null;
const initialEditor: Editor = { name: "", quantity: "1", price: "", unit: "piece" };

export default function BillEditor() {
  const ready = useHydrated();
  const { draft, catalogue } = useStore();
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor>(initialEditor);
  const [quick, setQuick] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locking = useRef(false);
  const items = draft?.items ?? [];
  const amountOnly = draft?.quickAmount != null;
  const matches = catalogue.filter((product) => product.name.toLowerCase().includes(query.toLowerCase().trim()));

  function openPanel(next: Panel) {
    setError("");
    setPanel(next);
  }
  function openEditor(next: Editor) {
    setEditor(next);
    openPanel("item");
  }
  function selectProduct(product: Product, catalogueEdit = false) {
    openEditor({ ...product, quantity: "1", price: rupeeInput(product.price), productId: product.id,
      catalogueId: catalogueEdit ? product.id : undefined });
  }
  async function run(update: Parameters<typeof transact<void>>[0]) {
    if (locking.current) return;
    locking.current = true;
    setBusy(true);
    setError("");
    try {
      await transact(update);
      setPanel(null);
    } catch (error) {
      setError(errorText(error));
    } finally {
      locking.current = false;
      setBusy(false);
    }
  }
  function write(changes: Partial<Pick<Draft, "items" | "quickAmount">>) {
    return run((store) => ({ store: editDraft(store, draft, changes, newDraft(crypto.randomUUID())), result: undefined }));
  }
  function saveItem(event: FormEvent) {
    event.preventDefault();
    let line: Line;
    try {
      line = makeLine(editor.lineId ?? crypto.randomUUID(), editor);
    } catch (error) {
      return setError(errorText(error));
    }
    if (editor.catalogueId) {
      const { name, unit, price } = line;
      return run((store) => ({
        store: { ...store, catalogue: store.catalogue.map((product) =>
          product.id === editor.catalogueId ? { ...product, name, unit, price } : product) },
        result: undefined,
      }));
    }
    return write({ items: editor.lineId ? items.map((item) => item.id === editor.lineId ? line : item) : [...items, line] });
  }

  return <>
    <PageTitle title="Create a bill" description="Use demo catalogue prices or enter your own products." back={{ href: "/bills", label: "Bill history" }} />
    <div className="bill-tools">
      <Action type="button" onClick={() => { setQuery(""); openPanel("products"); }} disabled={!ready || amountOnly || busy}><Plus size={17} /> Add Product</Action>
      <Action type="button" tone="secondary" onClick={() => { setQuick(amountOnly ? rupeeInput(draft!.quickAmount!) : ""); openPanel("quick"); }} disabled={!ready || items.length > 0 || busy}><Calculator size={17} /> Quick Amount</Action>
    </div>
    {ready && (amountOnly ? <div className="card content-card">
      <div className="section-heading"><h2>Quick amount</h2><strong>{money(draft!.quickAmount!)}</strong></div>
      <Action type="button" tone="text" onClick={() => write({ quickAmount: null })} disabled={busy}>Remove Quick Amount</Action>
    </div> : items.length > 0 ? <section className="card receipt">
      <div className="receipt-header"><h2>Items on this bill</h2><span>{items.length}</span></div>
      <ul>{items.map((line) => <BillLine key={line.id} line={line}
        edit={() => openEditor({ ...line, lineId: line.id, quantity: String(line.quantity / 1_000), price: rupeeInput(line.price) })}
        remove={() => write({ items: items.filter((item) => item.id !== line.id) })} />)}</ul>
    </section> : <Empty title="Your bill is empty" detail="Add a product or enter a quick amount." icon={ReceiptText} />)}
    {!panel && <ErrorMessage>{error}</ErrorMessage>}
    {draft && billTotal(draft) > 0 && <div className="card bill-preview">
      <div><small>Bill total</small><strong>{money(billTotal(draft))}</strong></div>
      <ActionLink href="/bills/new/review">Review Bill <ChevronRight size={17} /></ActionLink>
    </div>}
    <DemoNote>Drafts and catalogue edits stay in this browser.</DemoNote>
    {panel === "products" && <Sheet title="Add a product" onClose={() => openPanel(null)}>
      <div className="product-picker">
        <Field label="Search demo catalogue" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search milk, rice, sugar…" />
        <Action type="button" tone="secondary" onClick={() => openEditor({ ...initialEditor, name: query.trim() })}><Plus size={16} /> Add Custom Product</Action>
        {matches.length ? <ul className="catalogue-list">{matches.map((product) => <li key={product.id}>
          <button className="catalogue-pick" type="button" onClick={() => selectProduct(product)}>
            <span>{product.name}</span><small>{money(product.price)} / {product.unit}</small>
          </button>
          <button className="icon-button" type="button" aria-label={`Edit catalogue ${product.name}`} onClick={() => selectProduct(product, true)}><Pencil size={15} /></button>
        </li>)}</ul> : <p className="notice">No products match. Add a custom product with your selling price.</p>}
      </div>
    </Sheet>}
    {panel === "item" && <Sheet title={editor.catalogueId ? "Edit catalogue product" : editor.lineId ? "Edit bill item" : "Add bill item"} onClose={() => { if (!busy) openPanel(null); }}>
      <form className="sheet-form" onSubmit={saveItem}>
        <Field label="Product name" maxLength={70} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} required />
        <div className="fields-two">
          {!editor.catalogueId && <Field label="Quantity" inputMode="decimal" value={editor.quantity} onChange={(event) => setEditor({ ...editor, quantity: event.target.value })} required />}
          <UnitField value={editor.unit} onChange={(unit) => setEditor({ ...editor, unit })} />
        </div>
        <Field label="Selling price per unit" inputMode="decimal" prefix="₹" value={editor.price} onChange={(event) => setEditor({ ...editor, price: event.target.value })} required />
        <ErrorMessage>{error}</ErrorMessage>
        <Action type="submit" disabled={busy}>{editor.catalogueId ? "Save Catalogue Product" : editor.lineId ? "Save Item" : "Add to Bill"}</Action>
        {!editor.lineId && <Action type="button" tone="text" disabled={busy} onClick={() => openPanel("products")}><Search size={15} /> Back to Catalogue</Action>}
      </form>
    </Sheet>}
    {panel === "quick" && <Sheet title="Quick amount" onClose={() => { if (!busy) openPanel(null); }}>
      <p>Create an amount-only bill.</p>
      <form className="sheet-form" onSubmit={(event) => {
        event.preventDefault();
        const amount = parsePaise(quick);
        if (!amount) return setError("Enter an amount from ₹0.01 to ₹10,00,000.");
        return write({ quickAmount: amount });
      }}>
        <Field label="Bill amount" prefix="₹" inputMode="decimal" value={quick} onChange={(event) => setQuick(event.target.value)} placeholder="0.00" required />
        <ErrorMessage>{error}</ErrorMessage>
        <Action type="submit" disabled={busy}>Set Amount</Action>
      </form>
    </Sheet>}
  </>;
}
