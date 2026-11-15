import { MAX_PAISE, parsePaise } from "./money.ts";

const numberWords = [
  ["zero", "பூஜ்யம்", "பூஜ்ஜியம்"],
  ["one", "ஒரு", "ஒன்று", "ஒன்னு", "onnu", "oru", "ondru"],
  ["two", "இரண்டு", "இரு", "ரெண்டு", "ரண்டு", "irandu", "rendu", "randu"],
  ["three", "மூன்று", "மூணு", "moonu", "moondru", "munu"],
  ["four", "நான்கு", "நாலு", "naalu", "nangu"],
  ["five", "ஐந்து", "அஞ்சு", "anju", "aindhu"],
  ["six", "ஆறு", "aaru"],
  ["seven", "ஏழு", "ezhu"],
  ["eight", "எட்டு", "ettu"],
  ["nine", "ஒன்பது", "onbadhu", "onpathu"],
  ["ten", "பத்து", "pathu", "patthu"],
  ["eleven", "பதினொன்று", "pathinonnu"],
  ["twelve", "பன்னிரண்டு", "pannirandu"],
  ["thirteen", "பதின்மூன்று"],
  ["fourteen", "பதினான்கு"],
  ["fifteen", "பதினைந்து"],
  ["sixteen", "பதினாறு"],
  ["seventeen", "பதினேழு"],
  ["eighteen", "பதினெட்டு"],
  ["nineteen", "பத்தொன்பது"],
];

const tens = [
  ["twenty", "இருபது", "இருபத்து", "irubadhu", "irubathu", "irupathu", "irupadhu", "irubaththu"],
  ["thirty", "முப்பது", "முப்பத்து", "muppadhu", "muppathu", "mupathu"],
  ["forty", "நாற்பது", "நாற்பத்து", "naarbadhu", "naarpathu", "narpathu"],
  ["fifty", "ஐம்பது", "ஐம்பத்து", "aimbadhu", "aimbathu", "aimpathu", "ambathu"],
  ["sixty", "அறுபது", "அறுபத்து", "arubadhu", "arubathu", "arupathu", "aarubathu"],
  ["seventy", "எழுபது", "எழுபத்து", "ezhubadhu", "ezhubathu"],
  ["eighty", "எண்பது", "எண்பத்து", "enbadhu", "enbathu"],
  ["ninety", "தொண்ணூறு", "தொண்ணூற்று", "thonnooru", "thonnuru"],
];

const smallNumbers = new Map<string, number>();
numberWords.forEach((words, value) => words.forEach((word) => smallNumbers.set(word, value)));
tens.forEach((words, index) => words.forEach((word) => smallNumbers.set(word, (index + 2) * 10)));
const hundreds = ["hundred", "நூறு", "நூற்றி", "நூற்று", "nooru", "nuru", "noothi", "nootri", "nootru"];
const thousands = ["thousand", "ஆயிரம்", "ஆயிரத்து", "aayiram", "ayiram", "aayirathu"];
const fusedHundreds = ["இருநூறு", "முந்நூறு", "நானூறு", "ஐந்நூறு", "அறுநூறு", "எழுநூறு", "எண்ணூறு", "தொள்ளாயிரம்"];
const fusedHundredsLinks = ["இருநூற்று", "முந்நூற்று", "நானூற்று", "ஐந்நூற்று", "அறுநூற்று", "எழுநூற்று", "எண்ணூற்று", "தொள்ளாயிரத்து"];

function numberText(text: string) {
  return text.normalize("NFKC").toLowerCase().trim().replace(/[௦-௯]/g, (digit) => String(digit.charCodeAt(0) - 0x0be6));
}

export function spokenInteger(input: string): number | null {
  const text = numberText(input);
  if (/^\d+$/.test(text)) return Number(text);
  if (!text) return null;
  const words = text.split(/[\s-]+/u).filter((word) => word !== "and" && word !== "மற்றும்");
  let total = 0;
  let group = 0;
  let lastSmall = 0;
  let usedHundred = false;
  for (const word of words) {
    if (thousands.includes(word) && total === 0) {
      total = (group || 1) * 1000;
      group = 0;
      lastSmall = 0;
      usedHundred = false;
      continue;
    }
    if (hundreds.includes(word) && !usedHundred && group < 10) {
      group = (group || 1) * 100;
      lastSmall = 0;
      usedHundred = true;
      continue;
    }
    const fused = Math.max(fusedHundreds.indexOf(word), fusedHundredsLinks.indexOf(word));
    if (fused >= 0 && group === 0 && !usedHundred) {
      group = (fused + 2) * 100;
      usedHundred = true;
      continue;
    }
    const small = /^\d{1,2}$/.test(word) ? Number(word) : smallNumbers.get(word);
    if (small === undefined || (lastSmall > 0 && (lastSmall < 20 || lastSmall % 10 !== 0 || small < 1 || small > 9))) return null;
    group += small;
    lastSmall = small;
  }
  return words.length ? total + group : null;
}

export const rupeeWords = "rupees?|rs\\.?|inr|rooba(?:i|s)?|rubaa?|rupaa?|ரூபாய்கள்|ரூபாய்|ரூபா|ரூ\\.?";
export const paiseWords = "paise|paisa|பைசா|காசு";

export function spokenPaise(input: string) {
  const text = numberText(input).replace(/^₹\s*/u, "");
  const split = new RegExp(`^(.*?)\\s+(?:${rupeeWords})(?:\\s+(?:and\\s+)?(.+?)\\s+(?:${paiseWords}))?$`, "iu").exec(text);
  const subunit = new RegExp(`^(.*?)\\s+(?:${paiseWords})$`, "iu").exec(text);
  let value: number | null;
  if (split?.[2]) {
    const whole = spokenInteger(split[1]);
    const fraction = spokenInteger(split[2]);
    value = whole !== null && fraction !== null && fraction < 100 ? whole * 100 + fraction : null;
  } else if (subunit) {
    const fraction = spokenInteger(subunit[1]);
    value = fraction !== null && fraction < 100 ? fraction : null;
  } else {
    const amount = (split?.[1] ?? text).replace(new RegExp(`^(?:${rupeeWords})\\s*`, "iu"), "").trim();
    const digits = /^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(amount) ? amount.replaceAll(",", "") : amount;
    const parts = digits.split(/\s+(?:point|புள்ளி|pulli)\s+/u);
    if (parts.length === 2) {
      const whole = spokenInteger(parts[0]);
      const decimals = /^\d{1,2}$/.test(parts[1]) ? parts[1] : parts[1].split(/\s+/u)
        .map((token) => { const digit = smallNumbers.get(token); return digit !== undefined && digit < 10 ? String(digit) : "x"; }).join("");
      value = whole !== null ? parsePaise(`${whole}.${decimals}`) : null;
    } else {
      const whole = spokenInteger(digits);
      value = parsePaise(digits) ?? (whole === null ? null : whole * 100);
    }
  }
  return value !== null && Number.isSafeInteger(value) && value > 0 && value <= MAX_PAISE ? value : null;
}
