import type { BannerFx } from "../session/hud-fx";

export interface Tone {
  wave: "sine" | "square" | "sawtooth" | "triangle" | "noise";
  from: number;
  to: number;
  start: number;
  duration: number;
  gain: number;
}

const t = (
  wave: Tone["wave"],
  from: number,
  to: number,
  start: number,
  duration: number,
  gain: number,
): Tone => ({ wave, from, to, start, duration, gain });

const CUES: Record<BannerFx, Tone[]> = {
  "jack-in": [t("sawtooth", 180, 900, 0, 0.35, 0.12), t("sine", 1200, 1200, 0.32, 0.12, 0.1)],
  "jack-out": [t("sawtooth", 900, 160, 0, 0.4, 0.12)],
  "ice-attack": [t("sawtooth", 220, 440, 0, 0.18, 0.12), t("square", 440, 220, 0.2, 0.22, 0.1)],
  "ice-alert": [
    t("square", 880, 880, 0, 0.14, 0.09),
    t("square", 620, 620, 0.18, 0.14, 0.09),
    t("square", 880, 880, 0.36, 0.14, 0.09),
  ],
  breach: [t("triangle", 660, 660, 0, 0.1, 0.16), t("triangle", 990, 990, 0.1, 0.22, 0.16)],
  identify: [t("sine", 880, 1320, 0, 0.12, 0.12), t("triangle", 1320, 1320, 0.12, 0.18, 0.1)],
  mapped: [t("sine", 440, 880, 0, 0.2, 0.1), t("sine", 660, 1320, 0.15, 0.2, 0.08)],
  cloaked: [t("triangle", 900, 300, 0, 0.35, 0.1)],
  virus: [t("square", 300, 600, 0, 0.12, 0.08), t("square", 600, 300, 0.14, 0.18, 0.08)],
  control: [t("triangle", 520, 780, 0, 0.18, 0.14), t("sine", 1040, 1040, 0.18, 0.2, 0.12)],
  "zap-hit": [t("sawtooth", 1800, 400, 0, 0.12, 0.12), t("noise", 1600, 600, 0.05, 0.14, 0.16)],
  "program-hit": [t("square", 1200, 300, 0, 0.16, 0.1), t("noise", 1400, 500, 0.06, 0.16, 0.14)],
  damage: [t("noise", 1200, 300, 0, 0.18, 0.22), t("sine", 140, 70, 0, 0.22, 0.2)],
  derez: [t("sawtooth", 1400, 90, 0, 0.7, 0.12), t("noise", 2000, 200, 0.1, 0.5, 0.12)],
  fail: [t("square", 150, 110, 0, 0.35, 0.1)],
  evade: [t("sine", 300, 1600, 0, 0.3, 0.12)],
  "ice-hit": [t("sawtooth", 110, 60, 0, 0.4, 0.16), t("noise", 800, 200, 0, 0.3, 0.16)],
  "brain-damage": [t("sawtooth", 90, 40, 0, 0.5, 0.18), t("noise", 600, 120, 0.02, 0.45, 0.2)],
  "program-crash": [t("square", 900, 120, 0, 0.35, 0.12), t("noise", 2400, 300, 0.05, 0.3, 0.14)],
  "ice-miss": [t("sine", 700, 500, 0, 0.16, 0.08)],
  undo: [t("sine", 900, 450, 0, 0.12, 0.08), t("sine", 600, 300, 0.12, 0.12, 0.08)],
  "ice-turn": [t("square", 220, 180, 0, 0.14, 0.08), t("square", 220, 180, 0.18, 0.14, 0.08)],
  "runner-turn": [t("sine", 800, 1200, 0, 0.12, 0.08)],
  "npc-turn": [t("square", 330, 260, 0, 0.14, 0.08), t("square", 330, 260, 0.18, 0.14, 0.08)],
  "npc-hit": [t("sawtooth", 140, 60, 0, 0.4, 0.16), t("noise", 900, 200, 0, 0.3, 0.14)],
  "npc-miss": [t("sine", 700, 500, 0, 0.16, 0.08)],
  "npc-alert": [t("square", 330, 660, 0, 0.18, 0.1), t("square", 660, 330, 0.2, 0.18, 0.1)],
  "npc-attack": [t("sawtooth", 500, 180, 0, 0.3, 0.12)],
  "npc-down": [t("sawtooth", 1200, 80, 0, 0.6, 0.12), t("noise", 1500, 200, 0.1, 0.4, 0.1)],
  "new-turn": [t("sine", 1000, 1000, 0, 0.06, 0.08), t("sine", 1500, 1500, 0.08, 0.06, 0.08)],
};

export function soundCue(kind: BannerFx | null): Tone[] | null {
  return kind ? CUES[kind] : null;
}
