/**
 * Play a short beep using Web Audio API (no asset required).
 * Used for scan/sale when sound effects are enabled in settings.
 */
export function playBeep(options?: { frequency?: number; durationMs?: number }): void {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = options?.frequency ?? 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (options?.durationMs ?? 80) / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (options?.durationMs ?? 80) / 1000);
  } catch {
    /* ignore */
  }
}

/** Slightly higher/longer beep for sale complete. */
export function playSaleBeep(): void {
  playBeep({ frequency: 1000, durationMs: 120 });
}
