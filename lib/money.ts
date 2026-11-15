export const MAX_PAISE = 100_000_000;

export function parsePaise(value: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return paise <= MAX_PAISE ? paise : null;
}

export function rupeeInput(paise: number) {
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2,
  }).format(paise / 100);
}
