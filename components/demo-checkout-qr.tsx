import { create } from "qrcode";
import { useMemo } from "react";
import { money } from "../lib/money";

export function DemoCheckoutQr({ billId, revision, amount }: { billId: string; revision: number; amount: number }) {
  const symbol = useMemo(() => {
    const payload = `PAYTM RESOLVE DEMO - NON-PAYABLE\nAMOUNT INR ${(amount / 100).toFixed(2)}\nBILL ${billId}\nREVISION ${revision}`;
    const { modules } = create(payload);
    let path = "";
    for (let row = 0; row < modules.size; row++) {
      for (let column = 0; column < modules.size; column++) {
        if (modules.get(row, column)) path += `M${column} ${row}h1v1h-1z`;
      }
    }
    return { path, size: modules.size };
  }, [billId, revision, amount]);

  return <figure className="card checkout-qr">
    <figcaption>
      <span>Amount to collect</span>
      <strong>{money(amount)}</strong>
    </figcaption>
    <svg className="checkout-qr-symbol" role="img" aria-label={`Non-payable demo QR for ${money(amount)}`}
      viewBox={`-4 -4 ${symbol.size + 8} ${symbol.size + 8}`} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={symbol.size + 8} height={symbol.size + 8} fill="white" />
      <path d={symbol.path} fill="#002e6e" />
    </svg>
    <div className="checkout-qr-caption">
      <strong>Non-payable demo QR</strong>
      <p>Scanning shows the bill amount as text.</p>
    </div>
  </figure>;
}
