const soundUrl = "/audio/payment-demo-success.mp3";

let stopActiveSound: (() => void) | undefined;

export function prepareDemoPaymentSound() {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return;
  }

  let closed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    if (stopActiveSound === close) stopActiveSound = undefined;
    void context.close().catch(() => {});
  };

  // Ask the browser to enable output synchronously inside the presenter tap.
  // Decode the original file while the bill is being saved.
  const ready = Promise.all([
    context.resume(),
    fetch(soundUrl, { signal: AbortSignal.timeout(5000) }).then((response) => {
      if (!response.ok) throw new Error("Could not load the payment sound.");
      return response.arrayBuffer();
    }).then((bytes) => closed ? null : context.decodeAudioData(bytes)),
  ]);
  void ready.catch(close);

  return (play: boolean) => {
    if (!play) return close();
    if (closed) return;

    stopActiveSound?.();
    stopActiveSound = close;
    timeout = setTimeout(close, 5000);
    void ready.then(([, buffer]) => {
      if (closed || !buffer || context.state !== "running") return close();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = close;
      source.start();
      clearTimeout(timeout);
    }).catch(close);
  };
}

export async function replayDemoPaymentSound() {
  stopActiveSound?.();
  const audio = new Audio(soundUrl);
  audio.volume = 1;
  const stop = () => {
    audio.pause();
    if (stopActiveSound === stop) stopActiveSound = undefined;
  };
  stopActiveSound = stop;
  audio.addEventListener("ended", stop, { once: true });
  audio.addEventListener("error", stop, { once: true });
  try {
    await audio.play();
  } catch (error) {
    stop();
    throw error;
  }
}
