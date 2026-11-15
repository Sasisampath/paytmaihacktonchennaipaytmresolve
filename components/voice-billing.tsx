"use client";

import { FileText, Mic, Plus, Square, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UnitField } from "./bill-ui";
import { Action, ActionLink, DemoNote, ErrorMessage, Field, PageTitle, Sheet, errorText } from "./ui";
import { isName, lineTotal, makeLine, newDraft, parseQuantity, quantityText, type Draft, type Line, type Product, type Unit } from "../lib/billing";
import { transact, useHydrated, useStore } from "../lib/browser-store";
import { money, parsePaise } from "../lib/money";
import { audioFormats, isVoiceReview, maxAudioBytes, maxRecordingSeconds, sampleTranscript, sampleVoiceReview, type VoiceReview } from "../lib/voice";
import { reviewedUnitPrice, voiceCatalogueMatches, type PriceBasis } from "../lib/voice-review";
import { applyVoiceBatch, mergeVoiceLines, type Impact } from "../lib/voice-merge";

import { PaytmArt } from "./paytm-art";

type Review = VoiceReview & { id: string; source: "live" | "sample" };
type Status = "idle" | "permission" | "recording" | "recognizing";
type Recording = { recorder: MediaRecorder; stream: MediaStream; timer: number; ticker: number; cancel: boolean };
type Editable = {
  id: string; name: string; quantity: string; unit: Unit | ""; priceOverride: string | null;
  priceBasis: PriceBasis | null; productId?: string; chooseProduct: boolean; include: boolean;
};

export function InlineVoiceBilling({ disabled }: { disabled: boolean }) {
  const [session, setSession] = useState(0);
  return <VoiceBilling key={session} disabled={disabled} onDismiss={() => setSession((value) => value + 1)} />;
}

export function VoiceBilling({ disabled = false, onDismiss }: { disabled?: boolean; onDismiss?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const ready = useHydrated();
  const { draft, catalogue } = useStore();
  const [availability, setAvailability] = useState<"checking" | "ready" | "missing" | "offline">("checking");
  const [status, setStatus] = useState<Status>("idle");
  const [remaining, setRemaining] = useState(maxRecordingSeconds);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const inProgress = useRef(false);
  const current = useRef<Recording | null>(null);
  const upload = useRef<AbortController | null>(null);
  const amountOnly = draft?.quickAmount != null;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    fetch("/api/voice", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body: unknown = await response.json();
        if (!controller.signal.aborted) {
          setAvailability(body && typeof body === "object" && "configured" in body && body.configured === true ? "ready" : "missing");
        }
      })
      .catch(() => { if (!controller.signal.aborted) setAvailability("offline"); });
    function endHiddenRecording() {
      const recording = current.current;
      if (document.hidden && recording?.recorder.state === "recording") recording.recorder.stop();
    }
    document.addEventListener("visibilitychange", endHiddenRecording);
    return () => {
      mounted.current = false;
      controller.abort();
      upload.current?.abort();
      document.removeEventListener("visibilitychange", endHiddenRecording);
      const recording = current.current;
      if (recording) {
        recording.cancel = true;
        clearTimeout(recording.timer);
        clearInterval(recording.ticker);
        if (recording.recorder.state === "recording") recording.recorder.stop();
        recording.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  async function recognize(audio: Blob) {
    if (audio.size < 80) throw new Error("The recording is empty. Say the items and try again.");
    if (audio.size > maxAudioBytes) throw new Error("The recording is too large. Try a shorter clip.");
    setStatus("recognizing");
    const controller = new AbortController();
    upload.current = controller;
    try {
      const response = await fetch("/api/voice", {
        method: "POST", body: audio, headers: { "Content-Type": audio.type },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data ? data.error : null;
        throw new Error(typeof message === "string" ? message : "Voice billing is unavailable. Try again or continue manually.");
      }
      if (!isVoiceReview(data)) throw new Error("No valid candidates were returned. Try again or add items manually.");
      if (mounted.current) setReview({ ...data, id: crypto.randomUUID(), source: "live" });
    } catch (error) {
      if (error instanceof DOMException || error instanceof TypeError) {
        throw new Error("The voice service could not be reached in time. Try again or continue manually.");
      }
      throw error;
    } finally {
      upload.current = null;
    }
  }

  async function record() {
    if (inProgress.current || amountOnly || availability !== "ready") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return setError("Microphone recording needs a supported browser on HTTPS or localhost. You can add items manually.");
    }
    const mime = Object.keys(audioFormats).find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) return setError("This browser cannot record a supported audio format. Continue with manual billing.");
    inProgress.current = true;
    setError("");
    setStatus("permission");
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 });
      const parts: Blob[] = [];
      const started = Date.now();
      const stop = () => { if (recorder.state === "recording") recorder.stop(); };
      const recording: Recording = { recorder, stream, timer: 0, ticker: 0, cancel: false };
      current.current = recording;
      recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
      recorder.onerror = () => {
        recording.cancel = true;
        stop();
        if (mounted.current) setError("The microphone stopped unexpectedly. Try again or continue manually.");
      };
      recorder.onstop = async () => {
        clearTimeout(recording.timer);
        clearInterval(recording.ticker);
        recording.stream.getTracks().forEach((track) => track.stop());
        current.current = null;
        try {
          if (!recording.cancel && mounted.current) {
            await recognize(new Blob(parts, { type: mime }));
          }
        } catch (error) {
          if (mounted.current) setError(errorText(error));
        } finally {
          inProgress.current = false;
          if (mounted.current) setStatus("idle");
        }
      };
      recorder.start();
      recording.timer = window.setTimeout(stop, maxRecordingSeconds * 1000);
      recording.ticker = window.setInterval(() => {
        setRemaining(Math.max(0, maxRecordingSeconds - Math.floor((Date.now() - started) / 1000)));
      }, 200);
      setRemaining(maxRecordingSeconds);
      setStatus("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      current.current = null;
      inProgress.current = false;
      if (!mounted.current) return;
      setStatus("idle");
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setError(denied ? "Microphone access was denied. Enable it in this browser or add items manually." : "The microphone could not start. Check your device or add items manually.");
    }
  }

  const title = review?.source === "sample" ? "Review sample items" : "Review recognized items";

  function stopRecording() {
    if (current.current?.recorder.state === "recording") current.current.recorder.stop();
  }

  if (onDismiss) return <>
    <Action type="button" tone="secondary" className="voice-entry voice-entry-card full-action"
      disabled={disabled || !ready || availability === "checking"} aria-haspopup="dialog" onClick={() => {
        setOpen(true);
        void record();
      }}>
      <PaytmArt file="bill-voice-microphone.png" size={44} />
      <span>Add by Tamil Voice</span>
    </Action>
    {open && <Sheet title={review ? title : "Tamil voice billing"} onClose={onDismiss}>
      {review ? <CandidateReview key={review.id} review={review} draft={draft} catalogue={catalogue} onRestart={onDismiss} onDone={onDismiss} /> :
        <div className="voice-dialog-body">
          <div className="voice-dialog-visual">
            <PaytmArt file="voice-recording-waveform.png" size={252} height={101} />
            <p role="status">{status === "recording" ? <><span className="recording-dot" /> Recording</> :
              status === "permission" ? "Waiting for microphone permission…" :
              status === "recognizing" ? "Processing recording…" :
              availability === "missing" ? "Live voice is unavailable until Sarvam is configured." :
              availability === "offline" ? "The voice service could not be reached." : "Ready to record"}</p>
            {status === "recording" && <p className="voice-timer">{remaining} seconds remaining</p>}
            {status === "recording" && <p className="voice-send-note">Audio is sent to Sarvam when you stop.</p>}
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          <div className="actions-stack">
            {status === "recording" && <Action type="button" onClick={stopRecording}><Square size={16} /> Stop Recording</Action>}
            {status === "idle" && availability === "ready" && <Action type="button" onClick={record}><Mic size={17} /> Try Recording Again</Action>}
            <Action type="button" tone="secondary" onClick={onDismiss}>Cancel</Action>
          </div>
        </div>}
    </Sheet>}
  </>;

  if (ready && amountOnly) return <>
    <PageTitle title="Tamil voice billing" back={{ href: "/bills/new", label: "Bill editor" }} />
    <div className="card content-card"><p>Remove the quick amount in the bill editor before adding products by voice.</p></div>
  </>;
  if (review) return <CandidateReview key={review.id} review={review} draft={draft} catalogue={catalogue} onRestart={() => { setReview(null); setError(""); }} />;

  return <>
    <PageTitle title="Tamil voice billing" description="Say products and quantities in Tamil or Tanglish, then review the items." back={{ href: "/bills/new", label: "Bill editor" }} />
    <section className="card voice-recorder">
      <span className={`voice-icon ${status === "recording" ? "is-recording" : ""}`}><Mic size={27} /></span>
      <h2>{status === "recording" ? "Recording" : "Record your items"}</h2>
      {status === "recording" ? <p>{remaining} seconds remaining</p> :
        <p>Up to {maxRecordingSeconds} seconds. Audio is sent to Sarvam for transcription.</p>}
      {status !== "idle" && <p role="status">
        {status === "permission" ? "Waiting for microphone permission…" : status === "recognizing" ? "Transcribing and checking the product list…" : "Speak now."}
      </p>}
      {status === "recording" ? <Action type="button" onClick={stopRecording}><Square size={16} /> Stop Recording</Action> :
        <Action type="button" disabled={!ready || availability !== "ready" || status !== "idle"} onClick={record}><Mic size={17} /> Record</Action>}
      {availability === "checking" && <p role="status">Checking voice service…</p>}
      {availability === "missing" && <p className="voice-unavailable" role="status">Live voice is unavailable until Sarvam is configured.</p>}
      {availability === "offline" && <p className="voice-unavailable" role="status">The voice service could not be reached.</p>}
    </section>
    <ErrorMessage>{error}</ErrorMessage>
    <section className="card content-card grid gap-2">
      <div className="section-heading"><h2><Volume2 size={16} /> What to say</h2></div>
      <p className="tamil-text" lang="ta">{sampleTranscript}</p>
      <p>Try the same phrase as a text sample to explore the review.</p>
      <Action type="button" tone="secondary" disabled={!ready || status !== "idle"} onClick={() => {
        if (inProgress.current) return;
        setReview({ ...sampleVoiceReview(), id: crypto.randomUUID(), source: "sample" });
      }}><FileText size={16} /> Open Sample Review</Action>
    </section>
    <ActionLink href="/bills/new" tone="text" className="full-action">Continue Manually</ActionLink>
  </>;
}

function CandidateReview({ review, draft, catalogue, onRestart, onDone }: {
  review: Review; draft: Draft | null; catalogue: Product[]; onRestart: () => void; onDone?: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Editable[]>(() => review.candidates.map((candidate, index) => {
    const matches = voiceCatalogueMatches(candidate, catalogue);
    const product = matches.length === 1 ? matches[0] : undefined;
    return {
      id: `${review.id.slice(0, 16)}-${index}`, name: product?.name ?? candidate.spokenName,
      quantity: candidate.quantity == null ? "" : String(candidate.quantity / 1000),
      unit: candidate.unit ?? "", priceOverride: null,
      priceBasis: candidate.spokenPrice?.basis === "ambiguous" ? null : candidate.spokenPrice?.basis ?? null,
      productId: product?.id, chooseProduct: matches.length > 1, include: true,
    };
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locking = useRef(false);
  const reviewed = items.map((item, index) => {
    const candidate = review.candidates[index];
    const product = catalogue.find((row) => row.id === item.productId);
    const calculated = reviewedUnitPrice(item, product, candidate.spokenPrice, item.priceBasis, candidate.unit);
    const price = item.priceOverride ?? calculated.price;
    const quantityValid = Boolean(parseQuantity(item.quantity, item.unit || "kg"));
    const priceValid = Boolean(parsePaise(price));
    const priceNeedsChoice = candidate.spokenPrice?.basis === "ambiguous" && !item.priceBasis && item.priceOverride === null;
    let line: Line | null = null;
    if (item.include && !item.chooseProduct && isName(item.name) && item.unit && quantityValid && priceValid) {
      line = makeLine(item.id, { ...item, unit: item.unit, price });
    }
    return { item, candidate, calculated, price, priceNeedsChoice, quantityValid, priceValid, line };
  });
  const lines = reviewed.flatMap(({ line }) => line ? [line] : []);
  let impact: Impact[] = [];
  let validation = reviewed.some(({ item, line }) => item.include && !line)
    ? "Complete the highlighted details before adding these items." : "";
  if (!validation) {
    try {
      impact = mergeVoiceLines(draft?.items ?? [], lines).impact;
    } catch (error) {
      validation = errorText(error);
    }
  }

  function change(id: string, patch: Partial<Editable>) {
    setItems((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
    setError("");
  }
  async function confirm() {
    if (locking.current) return;
    if (validation || lines.length === 0) return setError(validation || "Select at least one item.");
    locking.current = true;
    setBusy(true);
    try {
      await transact((store) => ({
        store: applyVoiceBatch(store, draft, newDraft(crypto.randomUUID()), review.id, lines), result: undefined,
      }));
      if (onDone) onDone();
      else router.replace("/bills/new");
    } catch (error) {
      setError(errorText(error));
      locking.current = false;
      setBusy(false);
    }
  }
  return <div className="voice-review">
    {!onDone && <PageTitle title={review.source === "sample" ? "Review sample items" : "Review recognized items"} back={{ href: "/bills/new", label: "Bill editor" }} />}
    <section className="card content-card grid gap-2">
      <h2>{review.source === "sample" ? "Tamil text sample" : "Sarvam transcript"}</h2>
      <p className="transcript" dir="auto">{review.transcript}</p>
      {review.source === "sample" && <DemoNote>Text fixture for the demo. No audio was recorded or recognized.</DemoNote>}
    </section>
    {reviewed.map(({ item, candidate, calculated, price, priceNeedsChoice, quantityValid, priceValid, line }) => {
      const matches = voiceCatalogueMatches(candidate, catalogue);
      const transactionPrice = candidate.spokenPrice;
      const unresolvedChoice = matches.length > 1 && item.chooseProduct;
      const showPriceChoice = transactionPrice?.basis === "ambiguous";
      const perUnitLabel = `${transactionPrice ? money(transactionPrice.amount) : ""} per ${item.unit || "unit"}`;
      const totalLabel = `${transactionPrice ? money(transactionPrice.amount) : ""} total`;
      return <fieldset className="card voice-item" key={item.id}>
        <legend>{candidate.spokenName}</legend>
        <div className="voice-item-top">
          <label className="voice-include"><input type="checkbox" checked={item.include} onChange={(event) => change(item.id, { include: event.target.checked })} /> Include this item</label>
          {item.include && <CandidateArt confident={Boolean(line)} matched={Boolean(item.productId)} />}
        </div>
        {item.include && <>
          <p className="voice-evidence"><span>Heard</span> {candidate.evidence}</p>
          {matches.length > 1 && <label className="field">
            <span>Catalogue product</span>
            <span className="field-control"><select aria-invalid={unresolvedChoice || undefined} value={item.productId ?? (item.chooseProduct ? "" : "spoken")}
              onChange={(event) => {
                const chosen = matches.find((product) => product.id === event.target.value);
                change(item.id, { chooseProduct: !event.target.value, productId: chosen?.id, name: chosen?.name ?? candidate.spokenName });
              }}>
              <option value="">Choose a match</option>
              {matches.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.unit}, {money(product.price)})</option>)}
              <option value="spoken">Use spoken name</option>
            </select></span>
          </label>}
          <Field label="Product name" aria-invalid={!isName(item.name) || undefined} value={item.name} maxLength={70}
            onChange={(event) => change(item.id, { name: event.target.value, productId: undefined, chooseProduct: false })} />
          <div className="fields-two">
            <Field label="Quantity" aria-invalid={!quantityValid || undefined} inputMode="decimal" value={item.quantity}
              onChange={(event) => change(item.id, { quantity: event.target.value })} />
            <UnitField value={item.unit} invalid={!item.unit || undefined} onChange={(unit) => change(item.id, { unit, priceOverride: null })} />
          </div>
          {showPriceChoice && <div className={`voice-price-choice ${priceNeedsChoice ? "voice-needs-choice" : ""}`}>
            <p>{perUnitLabel} or {totalLabel}?</p>
            <div className="voice-price-options" role="group" aria-label="Spoken price basis">
              <button type="button" aria-pressed={item.priceBasis === "per-unit" && item.priceOverride === null}
                onClick={() => change(item.id, { priceBasis: "per-unit", priceOverride: null })}>{perUnitLabel}</button>
              <button type="button" aria-pressed={item.priceBasis === "total" && item.priceOverride === null}
                onClick={() => change(item.id, { priceBasis: "total", priceOverride: null })}>{totalLabel}</button>
            </div>
          </div>}
          <Field label="Price per unit" aria-invalid={(!priceValid && !priceNeedsChoice) || undefined} prefix="₹" inputMode="decimal" value={price}
            hint={item.priceOverride === null ? calculated.issue || (transactionPrice && item.priceBasis === "total" ? `Spoken total ${money(transactionPrice.amount)}` : undefined) : undefined}
            onChange={(event) => change(item.id, { priceOverride: event.target.value })} />
          {line && <div className="voice-line-total"><span>Line total</span><strong>{money(lineTotal(line))}</strong></div>}
        </>}
      </fieldset>;
    })}
    {impact.length > 0 && <section className="card content-card merge-preview">
      <h2>Changes to this bill</h2>
      <ul>{impact.map(({ line, previousQuantity }) => <li key={line.id}>
        <strong>{line.name}</strong><span>{previousQuantity > 0 ? `Merge: ${quantityText(previousQuantity, line.unit)} → ${quantityText(line.quantity, line.unit)}` : `Add ${quantityText(line.quantity, line.unit)}`}</span>
      </li>)}</ul>
    </section>}
    {validation && <p className="notice voice-unavailable">Fill in the missing or unclear details before confirming. {validation}</p>}
    <ErrorMessage>{error}</ErrorMessage>
    <div className="actions-stack">
      <Action type="button" disabled={busy} onClick={confirm}><Plus size={17} /> Confirm and Add to Bill</Action>
      <Action type="button" tone="text" disabled={busy} onClick={onRestart}>Discard Review</Action>
    </div>
  </div>;
}

function CandidateArt({ confident, matched }: { confident: boolean; matched: boolean }) {
  return <span className="candidate-detail">
    <PaytmArt file={confident ? "product-recognised-success.png" : "product-recognition-warning.png"} size={30} />
    <span>{confident ? matched ? "Catalogue match" : "Ready to add" : "Check details"}</span>
  </span>;
}
