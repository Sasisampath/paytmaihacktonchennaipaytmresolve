import assert from "node:assert/strict";
import test from "node:test";
import { changeDraft, makeLine, newDraft } from "../lib/billing.ts";
import { readAudio, recognizeVoice } from "../lib/sarvam.ts";
import { decodeStore, emptyStore } from "../lib/storage.ts";
import { applyVoiceBatch, mergeVoiceLines } from "../lib/voice-merge.ts";
import { extractCandidates, isVoiceReview, maxAudioBytes, sampleTranscript, sampleVoiceReview } from "../lib/voice.ts";
import { GET, POST } from "../app/api/voice/route.ts";

test("Tamil fixture preserves the four explicit quantities and catalogue IDs", () => {
  const review = sampleVoiceReview();
  assert.equal(isVoiceReview(review), true);
  assert.deepEqual(review.candidates.map(({ productId, unit, quantity }) => [productId, unit, quantity]), [
    ["milk", "packet", 2000], ["biscuit", "piece", 3000], ["sugar", "kg", 1000], ["rice", "kg", 500],
  ]);
});

test("voice rejects invented product names, null strings, substring matches, and model-supplied prices", () => {
  const entry = (productText: string) => ({ productText, quantityText: "2", unitText: "" });
  const rows = ["null", "Rice", "Bread"].map(entry);
  assert.deepEqual(extractCandidates("2 price tags and 1 biscuit", { items: [
    ...rows, { ...entry("biscuit"), price: 100 },
  ] }), []);
  assert.equal(isVoiceReview({ transcript: "test", candidates: [{ spokenName: "null", productId: null, quantity: 1000, unit: "piece" }] }), false);
  assert.equal(isVoiceReview({ transcript: "test", candidates: [{ spokenName: "milk", productId: "forged", quantity: 1200, unit: "packet" }] }), false);
});

test("Tanglish quantities must be grounded, adjacent and unambiguous", () => {
  const review = extractCandidates("rendu paal, arai kg arisi, biscuit konjam, 2 bread", { items: [
    { productText: "paal", quantityText: "rendu", unitText: "" },
    { productText: "arisi", quantityText: "arai", unitText: "kg" },
    { productText: "biscuit", quantityText: "2", unitText: "" },
    { productText: "bread", quantityText: "2", unitText: "" },
  ] });
  assert.deepEqual(review.map(({ quantity }) => quantity), [2000, 500, null, 2000]);
  for (const [phrase, number] of [["0.5 kg rice", "5"], ["-5 kg rice", "5"], ["one and a half kg rice", "half"]]) {
    const [row] = extractCandidates(phrase, { items: [{ productText: "rice", quantityText: number, unitText: "kg" }] });
    assert.equal(row.quantity, null);
  }
  assert.equal(extractCandidates("2 milk", { items: Array.from({ length: 3 }, () => ({
    productText: "milk", quantityText: "2", unitText: "",
  })) }).length, 1);
});

test("voice merges through the same draft, preserves line prices, and deduplicates batch retries after reload", () => {
  const milk = makeLine("milk", { name: "Milk packet", quantity: "2", unit: "packet", price: "28" });
  const rice = makeLine("rice", { name: "Rice", quantity: "0.5", unit: "kg", price: "64" });
  const draft = changeDraft(newDraft("draft"), { items: [milk] });
  const store = { ...emptyStore, draft };
  assert.deepEqual(mergeVoiceLines([milk], [milk, rice]).impact.map(({ line, previousQuantity }) => [line.name, previousQuantity, line.quantity]), [
    ["Milk packet", 2000, 4000], ["Rice", 0, 500],
  ]);
  const first = applyVoiceBatch(store, draft, draft, "batch", [milk, rice]);
  assert.equal(first.draft?.items.length, 2);
  assert.equal(first.draft?.items[0].quantity, 4000);
  const decoded = decodeStore(JSON.stringify(first));
  assert.deepEqual(applyVoiceBatch(decoded, draft, draft, "batch", [milk, rice]), decoded);
  assert.throws(() => applyVoiceBatch(decoded, draft, draft, "new-batch", [milk]), /bill changed/);
  const separate = mergeVoiceLines([milk], [{ ...milk, id: "premium-milk", price: 3200 }]);
  assert.equal(separate.items.length, 2);
});

function webm() {
  const bytes = new Uint8Array(90);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
}

test("voice upload validates MIME, file signatures and both declared and streaming size", async () => {
  const signal = new AbortController().signal;
  const request = (body: Uint8Array<ArrayBuffer>, type: string, length?: string) => new Request("http://localhost/api/voice", {
    method: "POST", body, headers: { "Content-Type": type, ...(length ? { "Content-Length": length } : {}) },
  });
  assert.equal((await readAudio(request(webm(), "audio/webm;codecs=opus"), signal)).format, "audio/webm");
  await assert.rejects(readAudio(request(webm(), "text/plain"), signal), { status: 415 });
  await assert.rejects(readAudio(request(new Uint8Array(90), "audio/webm"), signal), { status: 400 });
  await assert.rejects(readAudio(request(webm(), "audio/webm", String(maxAudioBytes + 1)), signal), { status: 413 });
  await assert.rejects(readAudio(request(new Uint8Array(maxAudioBytes + 1), "audio/webm"), signal), { status: 413 });
});

test("Sarvam adapter uses two documented requests, with structured extraction and safe failure handling", async () => {
  const paths: string[] = [];
  const fake: typeof fetch = async (input, init) => {
    paths.push(String(input));
    assert.equal(new Headers(init?.headers).get("api-subscription-key"), "unit-test");
    if (paths.length === 1) {
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get("language_code"), "ta-IN");
      assert.equal(init.body.get("model"), "saaras:v4");
      assert.equal((init.body.get("file") as File).name, "recording.webm");
      return Response.json({ transcript: sampleTranscript });
    }
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "sarvam-105b");
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.response_format.type, "json_schema");
    assert.ok(body.response_format.json_schema.strict);
    assert.deepEqual(body.response_format.json_schema.schema.properties.items.items.required,
      ["productText", "quantityText", "unitText", "priceText", "priceBasisText", "evidenceText"]);
    assert.equal(body.messages[1].content, sampleTranscript);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      items: [{ productText: "அரிசி", quantityText: "அரை", unitText: "கிலோ", priceText: "", priceBasisText: "", evidenceText: "அரை கிலோ அரிசி" }],
    }) } }] });
  };
  const signal = new AbortController().signal;
  const audio = new Blob([webm()], { type: "audio/webm" });
  const result = await recognizeVoice(audio, "audio/webm", "unit-test", signal, fake);
  assert.deepEqual(paths, ["https://api.sarvam.ai/speech-to-text", "https://api.sarvam.ai/v2/chat/completions"]);
  assert.equal(result.candidates[0].quantity, 500);
  await assert.rejects(recognizeVoice(audio, "audio/webm", "unit-test", signal,
    async () => new Response("private provider error", { status: 403 })), { status: 503 });
});

test("live-style Sarvam responses populate the same quantities with or without repeated modifiers", () => {
  const transcript = "2 milk packet, 3 biscuit, 1 kg சர்க்கரை, 0.5 kg அரிசி.";
  const clean = [
    { productText: "milk packet", quantityText: "2", unitText: "" },
    { productText: "biscuit", quantityText: "3", unitText: "" },
    { productText: "சர்க்கரை", quantityText: "1", unitText: "kg" },
    { productText: "அரிசி", quantityText: "0.5", unitText: "kg" },
  ];
  const repeated = [
    { ...clean[0], productText: "2 milk packet", unitText: "packet" },
    { ...clean[1], productText: "3 biscuit", unitText: "pieces" },
    { ...clean[2], productText: "1 kg சர்க்கரை" },
    { ...clean[3], productText: "0.5 kg அரிசி" },
  ];
  for (const items of [clean, repeated]) {
    const rows = extractCandidates(transcript, { items });
    assert.deepEqual(rows.map(({ productId, unit, quantity }) => [productId, unit, quantity]), [
      ["milk", "packet", 2000], ["biscuit", "piece", 3000], ["sugar", "kg", 1000], ["rice", "kg", 500],
    ]);
  }
  assert.deepEqual(extractCandidates(transcript, { items: [{ ...clean[0], productText: "2 cheese" }] }), []);
  const [unknownUnit] = extractCandidates("3 boxes biscuit", { items: [{ ...clean[1], unitText: "boxes" }] });
  assert.equal(unknownUnit.unit, null);
  const [spokenUnit] = extractCandidates("3 packets biscuit", { items: [{ ...clean[1], unitText: "packets" }] });
  assert.equal(spokenUnit.unit, "packet");
});

test("Sarvam failures identify credits, throttling, audio, network, and invalid extraction without exposing provider content", async () => {
  const audio = new Blob([webm()], { type: "audio/webm" });
  const signal = new AbortController().signal;
  for (const [status, expected] of [[402, /no credits/], [429, /rate limited/], [415, /audio format/]] as const) {
    await assert.rejects(recognizeVoice(audio, "audio/webm", "unit-test", signal,
      async () => new Response("private provider error", { status })), { status, message: expected });
  }
  await assert.rejects(recognizeVoice(audio, "audio/webm", "unit-test", signal,
    async () => { throw new TypeError("private connection detail"); }), { status: 502, message: /Could not reach Sarvam/ });
  await assert.rejects(recognizeVoice(audio, "audio/webm", "unit-test", signal,
    async () => Response.json({ transcript: "  " })), { status: 422, message: /No clear transcript/ });
  await assert.rejects(recognizeVoice(audio, "audio/webm", "unit-test", signal, async (url) =>
    String(url).endsWith("/speech-to-text") ? Response.json({ transcript: "2 milk" }) :
      Response.json({ choices: [{ finish_reason: "stop", message: { content: "null" } }] })),
  { status: 422, message: /No clear products/ });
});

test("voice POST accepts the browser origin when Next.js normalizes the loopback URL", async () => {
  const upload = (origin: string) => new Request("http://localhost:3000/api/voice", {
    method: "POST", body: "not audio", headers: { host: "127.0.0.1:3000", origin, "content-type": "text/plain" },
  });
  const previous = process.env.SARVAM_API_KEY;
  delete process.env.SARVAM_API_KEY;
  try {
    assert.equal((await POST(upload("http://127.0.0.1:3000"))).status, 503);
    assert.equal((await POST(upload("http://localhost:3000"))).status, 403);
  } finally {
    if (previous !== undefined) process.env.SARVAM_API_KEY = previous;
  }
});

test("voice route reports missing credentials and throttles repeated configured uploads", async () => {
  const previous = process.env.SARVAM_API_KEY;
  try {
    delete process.env.SARVAM_API_KEY;
    assert.deepEqual(await GET().json(), { configured: false });
    const upload = (origin?: string) => new Request("http://localhost/api/voice", {
      method: "POST", body: "not audio", headers: { "Content-Type": "text/plain", ...(origin ? { origin } : {}) },
    });
    assert.equal((await POST(upload())).status, 503);
    assert.equal((await POST(upload("https://other.test"))).status, 403);
    process.env.SARVAM_API_KEY = "unit-test";
    assert.deepEqual(await GET().json(), { configured: true });
    for (let i = 0; i < 8; i++) assert.equal((await POST(upload())).status, 415);
    const limited = await POST(upload());
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "60");
  } finally {
    if (previous === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = previous;
  }
});
