import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { AppShell } from "../components/shell";

export const metadata: Metadata = {
  title: "Paytm Resolve | Merchant demo",
  description: "Your AI teammate for billing, payments and resolution. An independent PaytmKaro hackathon prototype.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body><AppShell>{children}</AppShell></body></html>;
}
