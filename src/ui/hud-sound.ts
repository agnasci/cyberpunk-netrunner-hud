import type { Tone } from "./sound-cues";

/**
 * Sintetiza as pistas no contexto de interface do Foundry (V12): `game.audio.interface`
 * existe após o primeiro gesto e tem `gainNode` ligado ao volume de interface do jogador.
 * Com o áudio ainda bloqueado, não toca nada. Devolve se tocou.
 */
export function playTones(tones: readonly Tone[]): boolean {
  const audio = game.audio;
  const ctx = audio.interface;
  if (audio.locked || !ctx) return false;
  const output = ctx.gainNode ?? ctx.destination;
  const now = ctx.currentTime + 0.01;
  for (const tone of tones) {
    const begin = now + tone.start;
    const end = begin + tone.duration;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, begin);
    envelope.gain.exponentialRampToValueAtTime(
      tone.gain,
      begin + Math.min(0.02, tone.duration / 4),
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(output);
    const { source, out } = voice(ctx, tone, begin, end);
    out.connect(envelope);
    source.addEventListener("ended", () => envelope.disconnect(), { once: true });
    source.start(begin);
    source.stop(end + 0.02);
  }
  return true;
}

/** Fonte agendável e o nó que leva o som ao envelope. */
function voice(
  ctx: AudioContext,
  tone: Tone,
  begin: number,
  end: number,
): { source: AudioScheduledSourceNode; out: AudioNode } {
  if (tone.wave !== "noise") {
    const osc = ctx.createOscillator();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(tone.from, begin);
    osc.frequency.exponentialRampToValueAtTime(tone.to, end);
    return { source: osc, out: osc };
  }
  // Ruído branco filtrado por um passa-banda que desliza de `from` a `to`.
  const length = Math.ceil(ctx.sampleRate * (tone.duration + 0.05));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(tone.from, begin);
  filter.frequency.exponentialRampToValueAtTime(tone.to, end);
  source.connect(filter);
  return { source, out: filter };
}
