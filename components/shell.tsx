"use client";

import { ClipboardList, FlaskConical, House, ReceiptText, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PaytmArt } from "./paytm-art";

const tabs = [
  { label: "Home", href: "/", icon: House },
  { label: "Check", href: "/check-payment", icon: ScanLine },
  { label: "Bills", href: "/bills", icon: ReceiptText },
  { label: "Issues", href: "/issues", icon: ClipboardList },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <div className="app-shell">
    <header className="app-header">
      <Link className="brand" href="/" aria-label="Paytm for Business · Resolve home"><PaytmArt file="business-website-logo.svg" size={54} height={36} /><span className="brand-divider" /><span className="brand-product">Resolve</span></Link>
      <span className="demo-badge" title="Independent hackathon prototype"><FlaskConical size={13} /> Demo mode</span>
    </header>
    <main className={path.startsWith("/bills/new") ? "main billing-flow" : "main"}>{children}</main>
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map(({ label, href, icon: Icon }) => {
        const active = path === href || (href !== "/" && path.startsWith(`${href}/`));
        return <Link href={href} key={href} aria-current={active ? "page" : undefined}>
          <span className="nav-icon"><Icon size={21} strokeWidth={active ? 2.4 : 1.8} /></span><span>{label}</span>
        </Link>;
      })}
    </nav>
  </div>;
}
