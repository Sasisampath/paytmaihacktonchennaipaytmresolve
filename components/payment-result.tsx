import { CircleHelp, WifiOff } from "lucide-react";
import { clockTime, ledgerDate, type Claim, type Verification } from "../lib/payment";
import { money } from "../lib/money";
import { PaytmArt } from "./paytm-art";
import { Pill } from "./ui";

const art = {
  received: "payment-received.png",
  "not-verified": "payment-not-verified.png",
  pending: "payment-pending.png",
  failed: "payment-failed.png",
};

export function PaymentResult({ claim, verification }: { claim: Claim; verification: Verification }) {
  const { status, evidence } = verification;
  const Icon = status === "unavailable" ? WifiOff : CircleHelp;
  return <div className="card result-card">
    <div className={`result-top result-${status}`}>
      <div className="result-heading">
        <div><Pill status={status} /><h2>{money(claim.amount)}</h2></div>
        {status === "unavailable" || status === "more-details" ? <Icon size={26} /> :
          <PaytmArt file={art[status]} size={62} />}
      </div>
      <p>{verification.reason}</p>
    </div>
    <div className="result-content">
      <h3>Merchant evidence</h3>
      {evidence ? <dl className="detail-list">
        <div><dt>Simulated record</dt><dd>{evidence.id}</dd></div>
        <div><dt>UPI reference</dt><dd>{evidence.reference}</dd></div>
        <div><dt>Ledger date</dt><dd>{ledgerDate}</dd></div>
        <div><dt>Transaction time</dt><dd>{clockTime(evidence.time)} IST</dd></div>
      </dl> : <p>No unique merchant record could be presented for this check.</p>}
      <div className="next-step"><strong>Next step</strong><p>{verification.next}</p></div>
    </div>
  </div>;
}
