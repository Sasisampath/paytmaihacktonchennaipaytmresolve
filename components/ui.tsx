"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, CircleAlert, FlaskConical, ReceiptText, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { labels, ledgerDate, type Status } from "../lib/payment";

export function Action({ tone = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "text" }) {
  return <button className={`action action-${tone} ${className}`} {...props} />;
}

export function ActionLink({ href, children, tone = "primary", className = "" }: {
  href: string; children: ReactNode; tone?: "primary" | "secondary" | "text"; className?: string;
}) {
  return <Link href={href} className={`action action-${tone} ${className}`}>{children}</Link>;
}

export function PageTitle({ title, description, back }: { title: string; description?: string; back?: { href: string; label: string } }) {
  return <div className="page-heading">
    {back && <Link className="back" href={back.href}><ArrowLeft size={16} /> {back.label}</Link>}
    <h1>{title}</h1>
    {description && <p>{description}</p>}
  </div>;
}

export function Pill({ status, children }: { status: Status | "open" | "closed" | "cash" | "saved"; children?: ReactNode }) {
  const label = status in labels ? labels[status as Status] : { open: "Open", closed: "Closed", cash: "Cash recorded", saved: "Saved for later" }[status as "open" | "closed" | "cash" | "saved"];
  return <span className={`pill pill-${status}`}><span aria-hidden="true" />{children ?? label}</span>;
}

export function Field({ label, hint, prefix, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; prefix?: string }) {
  const id = useId();
  return <label className="field">
    <span id={`${id}-label`}>{label}</span>
    <span className="field-control">{prefix && <span className="prefix" aria-hidden="true">{prefix}</span>}<input aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} {...props} /></span>
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </label>;
}

export function Empty({ title, detail, icon: Icon = ReceiptText, children }: { title: string; detail: string; icon?: LucideIcon; children?: ReactNode }) {
  return <div className="card empty-state"><i><Icon size={22} /></i><h2>{title}</h2><p>{detail}</p>{children}</div>;
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="notice error" role="alert"><CircleAlert size={17} />{children}</p>;
}

export function DemoDate() {
  return <div className="demo-date"><CalendarDays size={16} /><span>Ledger date <strong>{ledgerDate}</strong><small>India Standard Time</small></span></div>;
}

export function DemoNote({ children }: { children: ReactNode }) {
  return <p className="note"><FlaskConical size={15} />{children}</p>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="sheet" ref={ref} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="sheet-title">
    <div className="sheet-heading"><h2 id="sheet-title">{title}</h2><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
