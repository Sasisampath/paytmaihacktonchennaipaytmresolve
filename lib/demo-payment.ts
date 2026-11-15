type BillIdentity = { id: string; revision: number };

export type DemoPaymentEvent = {
  provider: "paytm-resolve-demo";
  status: "succeeded";
  billId: string;
  revision: number;
  amount: number;
  reference: string;
};

export function createDemoPaymentEvent(bill: BillIdentity, amount: number): DemoPaymentEvent {
  return {
    provider: "paytm-resolve-demo",
    status: "succeeded",
    billId: bill.id,
    revision: bill.revision,
    amount,
    reference: `DEMO-UPI-${bill.id}`,
  };
}

export function matchesDemoPayment(value: unknown, bill: BillIdentity, amount: number): value is DemoPaymentEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as DemoPaymentEvent;
  const expected = createDemoPaymentEvent(bill, amount);
  return event.provider === expected.provider && event.status === expected.status &&
    event.billId === expected.billId && event.revision === expected.revision &&
    event.amount === expected.amount && event.reference === expected.reference;
}
