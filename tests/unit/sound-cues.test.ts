import { describe, expect, it } from "vitest";
import { BANNER_FX } from "../../src/session/hud-fx";
import { soundCue } from "../../src/ui/sound-cues";

describe("soundCue", () => {
  it("toda faixa de evento tem um som", () => {
    for (const kind of BANNER_FX) expect(soundCue(kind)?.length ?? 0).toBeGreaterThan(0);
  });

  it("sem faixa, sem som", () => {
    expect(soundCue(null)).toBeNull();
  });

  it("sons curtos e baixos: até 1,2 s, ganho até 0,4, frequências audíveis", () => {
    for (const kind of BANNER_FX) {
      for (const tone of soundCue(kind) ?? []) {
        expect(tone.start + tone.duration).toBeLessThanOrEqual(1.2);
        expect(tone.duration).toBeGreaterThan(0);
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(0.4);
        for (const hz of [tone.from, tone.to]) {
          expect(hz).toBeGreaterThanOrEqual(40);
          expect(hz).toBeLessThanOrEqual(4000);
        }
      }
    }
  });

  it("ameaça e sucesso soam diferente", () => {
    expect(soundCue("ice-alert")).not.toEqual(soundCue("breach"));
  });
});
