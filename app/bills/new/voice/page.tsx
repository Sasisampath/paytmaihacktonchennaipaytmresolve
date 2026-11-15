"use client";

import { FileText, Mic, Plus, Square, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UnitField } from "../../../../components/bill-ui";
import { Action, ActionLink, DemoNote, ErrorMessage, Field, PageTitle, errorText } from "../../../../components/ui";
import { makeLine, newDraft, quantityText, type Draft, type Line, type Product, type Unit } from "../../../../lib/billing";
import { transact, useHydrated, useStore } from "../../../../lib/browser-store";
import { rupeeInput } from "../../../../lib/money";
import { audioFormats, isVoiceReview, maxAudioBytes, maxRecordingSeconds, sampleTranscript, sampleVoiceReview, type VoiceReview } from "../../../../lib/voice";
import { applyVoiceBatch, mergeVoiceLines, type Impact } from "../../../../lib/voice-merge";

type Review = VoiceReview & { id: string; source: "live" | "sample" };
type Status = "idle" | "permission" | "recording" | "recognizing";
type Recording = { recorder: MediaRecorder; stream: MediaStream; timer: number; ticker: number; cancel: boolean };
type Editable = { id: string; name: string; quantity: string; unit: Unit | ""; price: string; productId?: string; include: boolean };

export default function VoicePage() {
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
      {status === "recording" ? <Action type="button" onClick={() => {
        if (current.current?.recorder.state === "recording") current.current.recorder.stop();
      }}><Square size={16} /> Stop Recording</Action> :
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

function CandidateReview({ review, draft, catalogue, onRestart }: { review: Review; draft: Draft | null; catalogue: Product[]; onRestart: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<Editable[]>(() => review.candidates.map((candidate, index) => {
    const product = catalogue.find((row) => row.id === candidate.productId);
    return {
      id: `${review.id.slice(0, 16)}-${index}`, name: product?.name ?? candidate.spokenName,
      quantity: candidate.quantity == null ? "" : String(candidate.quantity / 1000), unit: candidate.unit ?? "",
      price: product && product.unit === candidate.unit ? rupeeInput(product.price) : "",
      productId: product?.id, include: true,
    };
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locking = useRef(false);
  const selected = items.filter((item) => item.include);
  let lines: Line[] = [];
  let impact: Impact[] = [];
  let validation = "";
  try {
    lines = selected.map((item) => {
      if (!item.unit) throw new Error(`Choose a unit for ${item.name || "the selected product"}.`);
      return makeLine(item.id, { ...item, unit: item.unit });
    });
    impact = mergeVoiceLines(draft?.items ?? [], lines).impact;
  } catch (error) {
    validation = errorText(error);
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
      router.replace("/bills/new");
    } catch (error) {
      setError(errorText(error));
      locking.current = false;
      setBusy(false);
    }
  }
  return <>
    <PageTitle title={review.source === "sample" ? "Review sample items" : "Review recognized items"} back={{ href: "/bills/new", label: "Bill editor" }} />
    <section className="card content-card grid gap-2">
      <h2>{review.source === "sample" ? "Tamil text sample" : "Sarvam transcript"}</h2>
      <p className="transcript" dir="auto">{review.transcript}</p>
      {review.source === "sample" && <DemoNote>Text fixture for the demo. No audio was recorded or recognized.</DemoNote>}
    </section>
    {items.map((item, index) => {
      const candidate = review.candidates[index];
      return <fieldset className="card voice-item" key={item.id}>
        <legend>{candidate.spokenName}</legend>
        <label className="voice-include"><input type="checkbox" checked={item.include} onChange={(event) => change(item.id, { include: event.target.checked })} /> Include this item</label>
        {item.include && <>
          <Field label="Product name" value={item.name} maxLength={70} onChange={(event) => change(item.id, { name: event.target.value, price: "", productId: undefined })} />
          <div className="fields-two">
            <Field label="Quantity" inputMode="decimal" value={item.quantity} onChange={(event) => change(item.id, { quantity: event.target.value })} />
            <UnitField value={item.unit} onChange={(unit) => {
              const product = catalogue.find(({ id }) => id === item.productId);
              change(item.id, { unit, price: product?.unit === unit ? rupeeInput(product.price) : "" });
            }} />
          </div>
          <Field label="Price per unit" prefix="₹" inputMode="decimal" value={item.price} onChange={(event) => change(item.id, { price: event.target.value })} />
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
  </>;
}
