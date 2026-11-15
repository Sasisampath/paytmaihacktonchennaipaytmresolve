import { readAudio, recognizeVoice, VoiceError } from "../../../lib/sarvam.ts";

export const runtime = "nodejs";

const minute = 60_000;
let starts: number[] = [];
let active = 0;

function errorJSON(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function GET() {
  return Response.json({ configured: Boolean(process.env.SARVAM_API_KEY?.trim()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return errorJSON("Start the recording from the bill editor.", 403);
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) return errorJSON("Live Tamil voice is unavailable until Sarvam is configured. You can add items manually.", 503);
  const now = Date.now();
  starts = starts.filter((time) => now - time < minute);
  if (active >= 2 || starts.length >= 8) return errorJSON("Too many recordings are being processed. Try again in a minute or continue manually.", 429, { "Retry-After": "60" });
  starts.push(now);
  active++;
  const timeout = AbortSignal.timeout(25_000);
  const signal = AbortSignal.any([timeout, request.signal]);
  try {
    const { audio, format } = await readAudio(request, signal);
    const review = await recognizeVoice(audio, format, key, signal);
    return Response.json(review, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (timeout.aborted) return errorJSON("Voice recognition timed out. Try a shorter recording or continue manually.", 504);
    if (error instanceof VoiceError) return errorJSON(error.message, error.status);
    return errorJSON("Voice billing is temporarily unavailable. Try again or continue manually.", 502);
  } finally {
    active--;
  }
}
