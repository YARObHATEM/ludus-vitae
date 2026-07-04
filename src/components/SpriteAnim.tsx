/**
 * Animated spritesheet portraits (Gothicvania creatures, CC0 Ansimuz).
 * Renders a horizontal sheet crisp-scaled, stepping frames on a timer.
 */
import React, { useEffect, useRef } from "react";
import type { Sector } from "../types/contracts";

export interface SheetDef {
  src: string;
  frameW: number;
  frameH: number;
  frames: number;
  fps?: number;
}

export const SHEETS: Record<string, SheetDef> = {
  hero: { src: "/world/hero-idle.png", frameW: 38, frameH: 48, frames: 4, fps: 6 },
  demon: { src: "/world/bosses/demon.png", frameW: 160, frameH: 144, frames: 6, fps: 7 },
  fireSkull: { src: "/world/bosses/fire-skull.png", frameW: 96, frameH: 112, frames: 8, fps: 9 },
  ghost: { src: "/world/bosses/ghost.png", frameW: 64, frameH: 80, frames: 7, fps: 7 },
  hound: { src: "/world/bosses/hound.png", frameW: 64, frameH: 32, frames: 6, fps: 8 },
  hellBeast: { src: "/world/bosses/hell-beast.png", frameW: 66, frameH: 67, frames: 5, fps: 7 },
  nightmare: { src: "/world/bosses/nightmare.png", frameW: 128, frameH: 96, frames: 4, fps: 6 },
};

/** Every boss manifests as a creature — escalating with the chapters. */
export function bossSheet(sector: Sector, level: number): SheetDef {
  if (sector === "INTELLECTUAL") return SHEETS.ghost;
  if (sector === "FINANCIAL") {
    return level <= 4 ? SHEETS.fireSkull : level <= 8 ? SHEETS.demon : SHEETS.nightmare;
  }
  // PHYSICAL (and fallback)
  return level <= 4 ? SHEETS.hound : SHEETS.hellBeast;
}

/** The four voices manifest as familiars. */
export const PERSONA_SHEETS: Record<string, SheetDef> = {
  ORACLE: SHEETS.hero,
  MALACHAI: SHEETS.fireSkull,
  IGNATIUS: SHEETS.ghost,
  KALDOR: SHEETS.hound,
};

/** Wound tier for a boss portrait frame: '' | 'wounded' | 'desperate'. */
export function woundClass(completion: number, defeated: boolean): string {
  if (defeated) return "";
  if (completion >= 0.66) return " desperate";
  if (completion >= 0.33) return " wounded";
  return "";
}

export function SpriteAnim(props: { sheet: SheetDef; height?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = props.sheet;
  const scale = (props.height ?? 72) / s.frameH;

  useEffect(() => {
    let frame = 0;
    const el = ref.current;
    if (!el) return;
    const iv = window.setInterval(() => {
      frame = (frame + 1) % s.frames;
      el.style.backgroundPosition = `-${frame * s.frameW * scale}px 0px`;
    }, 1000 / (s.fps ?? 7));
    return () => window.clearInterval(iv);
  }, [s, scale]);

  return (
    <div
      ref={ref}
      style={{
        width: s.frameW * scale,
        height: s.frameH * scale,
        backgroundImage: `url(${s.src})`,
        backgroundSize: `${s.frameW * s.frames * scale}px ${s.frameH * scale}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        ...props.style,
      }}
    />
  );
}
