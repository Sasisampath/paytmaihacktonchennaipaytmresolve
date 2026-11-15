import assert from "node:assert/strict";
import test from "node:test";
import { billTotal, catalogueSeed, changeDraft, lineTotal, makeLine, newDraft } from "../lib/billing.ts";
import { emptyStore } from "../lib/storage.ts";
import { applyVoiceBatch } from "../lib/voice-merge.ts";
import { spokenPaise } from "../lib/voice-numbers.ts";
import { reviewedUnitPrice, voiceCatalogueMatches, type PriceBasis } from "../lib/voice-review.ts";
import { extractCandidates, type VoiceCandidate } from "../lib/voice.ts";

function item(evidenceText: string, productText: string, quantityText: string, unitText: string, priceText = "", priceBasisText = "") {
  return { evidenceText, productText, quantityText, unitText, priceText, priceBasisText };
}

function reviewedLine(candidate: VoiceCandidate, basis?: PriceBasis) {
  const catalogue = voiceCatalogueMatches(candidate, [...catalogueSeed])[0];
  const { unit, quantity, spokenPrice } = candidate;
  if (!unit || !quantity) throw new Error("Expected a complete test quantity and unit");
  const editable = { id: candidate.productId ?? "custom", name: catalogue?.name ?? candidate.spokenName, unit, quantity: String(quantity / 1000) };
  const choice = basis ?? (spokenPrice?.basis === "ambiguous" ? null : spokenPrice?.basis ?? null);
  return makeLine(editable.id, { ...editable, price: reviewedUnitPrice(editable, catalogue, spokenPrice, choice).price });
}

test("multiple Tamil-script and Tanglish products retain original evidence, quantities, and explicit rates", () => {
  const rice = "Arisi rendu kilo, kilo arubadhu rooba";
  const dal = "பருப்பு ஒரு கிலோ, கிலோ நூற்றி இருபது ரூபா";
  const candidates = extractCandidates(`${rice}, ${dal}.`, { items: [
    item(rice, "Arisi", "rendu", "kilo", "arubadhu rooba", "kilo"),
    item(dal, "பருப்பு", "ஒரு", "கிலோ", "நூற்றி இருபது ரூபா", "கிலோ"),
  ] });
  assert.deepEqual(candidates.map(({ productId, quantity, unit, spokenPrice, evidence }) => [productId, quantity, unit, spokenPrice, evidence]), [
    ["rice", 2000, "kg", { amount: 6000, basis: "per-unit" }, rice],
    ["toor-dal", 1000, "kg", { amount: 12000, basis: "per-unit" }, dal],
  ]);
  assert.deepEqual(candidates.map((candidate) => lineTotal(reviewedLine(candidate))), [12000, 12000]);
});

test("half kilos, per-packet prices and local Sarvam numerals normalize correctly", () => {
  const sugar = "Sakkarai ara kilo kilo aimbadhu rooba";
  const milk = "பால் 3 packet, 1 ₹30";
  const candidates = extractCandidates(`${sugar}, ${milk}.`, { items: [
    item(sugar, "Sakkarai", "ara", "kilo", "aimbadhu rooba", "kilo"),
    item(milk, "பால்", "3", "packet", "₹30", "1"),
  ] });
  assert.deepEqual(candidates.map(({ quantity, spokenPrice }) => [quantity, spokenPrice]), [
    [500, { amount: 5000, basis: "per-unit" }], [3000, { amount: 3000, basis: "per-unit" }],
  ]);
  assert.deepEqual(candidates.map((candidate) => lineTotal(reviewedLine(candidate))), [2500, 9000]);
});

test("expressed totals convert exactly and ambiguous amounts require a choice", () => {
  const totalText = "அரிசி 2 kg, மொத்தம் ₹100";
  const ambiguousText = "Arisi rendu kilo nooru rooba";
  const [total] = extractCandidates(totalText, { items: [item(totalText, "அரிசி", "2", "kg", "₹100", "மொத்தம்")] });
  const [ambiguous] = extractCandidates(ambiguousText, { items: [item(ambiguousText, "Arisi", "rendu", "kilo", "nooru rooba", "kilo")] });
  assert.equal(total.spokenPrice?.basis, "total");
  assert.equal(ambiguous.spokenPrice?.basis, "ambiguous");
  assert.equal(reviewedLine(total).price, 5000);
  assert.throws(() => reviewedLine(ambiguous), /selling price/);
  assert.equal(lineTotal(reviewedLine(ambiguous, "total")), 10000);
  assert.equal(lineTotal(reviewedLine(ambiguous, "per-unit")), 20000);
  const impossible = reviewedUnitPrice({ id: "p", name: "Milk", quantity: "3", unit: "packet" }, undefined, { amount: 10000, basis: "total" }, "total");
  assert.equal(impossible.price, "");
  assert.match(impossible.issue, /exactly/);
  const changedUnit = reviewedUnitPrice({ id: "p", name: "Rice", quantity: "2", unit: "packet" }, undefined, { amount: 6000, basis: "per-unit" }, "per-unit", "kg");
  assert.equal(changedUnit.price, "");
  assert.match(changedUnit.issue, /per kg/);
});

test("number expressions preserve rupees and paise and reject invalid amounts", () => {
  assert.equal(spokenPaise("sixty rupees and fifty paise"), 6050);
  assert.equal(spokenPaise("நூற்றி இருபது ரூபா ஐம்பது பைசா"), 12050);
  assert.equal(spokenPaise("fifty paise"), 50);
  assert.equal(spokenPaise("sixty point five"), 6050);
  assert.equal(spokenPaise("₹1,20,000.50"), 12_000_050);
  assert.equal(spokenPaise("noothi irubadhu rooba"), 12000);
  assert.equal(spokenPaise("sixty seventy rooba"), null);
  assert.equal(spokenPaise("₹0"), null);
  assert.equal(spokenPaise("₹60.123"), null);
});

test("ungrounded or neighboring prices cannot be assigned to a product", () => {
  const milk = "2 milk packet";
  const rice = "rice 2 kg ₹60/kg";
  const transcript = `${milk}, ${rice}`;
  const [first, second] = extractCandidates(transcript, { items: [
    item(transcript, "milk packet", "2", "", "₹60", "/kg"),
    item(rice, "rice", "2", "kg", "₹60", "/kg"),
  ] });
  assert.equal(first.spokenPrice, null);
  assert.equal(second.spokenPrice?.amount, 6000);
  assert.equal(reviewedLine(first).price, 2800);
  const [nameOnly] = extractCandidates("biscuit", { items: [item("biscuit", "biscuit", "2", "", "₹40")] });
  assert.equal(nameOnly.quantity, null);
  assert.equal(nameOnly.spokenPrice, null);
  const negative = "rice 2 kg, -₹60/kg";
  assert.equal(extractCandidates(negative, { items: [item(negative, "rice", "2", "kg", "₹60", "/kg")] })[0].spokenPrice, null);
});

test("catalogue collisions remain selectable and confirmed overrides stay in the existing draft", () => {
  const words = "rice 2 kg, ₹60/kg";
  const [candidate] = extractCandidates(words, { items: [item(words, "rice", "2", "kg", "₹60", "/kg")] });
  const matches = voiceCatalogueMatches(candidate, [{ id: "shop-rice", name: "Rice", unit: "kg", price: 9000 }, ...catalogueSeed]);
  assert.deepEqual(matches.map(({ id }) => id), ["shop-rice", "rice"]);
  const manual = makeLine("manual", { name: "Rice", unit: "kg", quantity: "1", price: "64" });
  const draft = changeDraft(newDraft("existing"), { items: [manual] });
  const store = { ...emptyStore, draft };
  const added = applyVoiceBatch(store, draft, draft, "voice-price-batch", [reviewedLine(candidate)]);
  assert.equal(added.draft?.items.length, 2);
  assert.equal(billTotal(added.draft!), 18400);
  assert.equal(added.catalogue.find(({ id }) => id === "rice")?.price, 6400);
  assert.equal(applyVoiceBatch(added, draft, draft, "voice-price-batch", []).draft?.items.length, 2);
});
