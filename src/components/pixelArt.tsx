/**
 * Hand-drawn pixel art rendered from character maps — the great sword of the
 * Arsenal, the evidence bag, cobblestones and scrolls. Crisp SVG rects, no
 * external assets, palette swapped by weapon state.
 */
import React from "react";
import type { WeaponState } from "../types/contracts";

type Palette = Record<string, string>;

function PixelMap(props: { map: string[]; palette: Palette; height?: number; style?: React.CSSProperties }) {
  const rows = props.map.length;
  const cols = props.map[0]?.length ?? 1;
  const h = props.height ?? 160;
  const cell = h / rows;
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      width={cols * cell}
      height={h}
      style={{ imageRendering: "pixelated", ...props.style }}
      shapeRendering="crispEdges"
    >
      {props.map.flatMap((row, y) =>
        row.split("").map((ch, x) => {
          const color = props.palette[ch];
          if (!color) return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />;
        }),
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The Great Sword — 13 × 44, vertical, state-palette
// ---------------------------------------------------------------------------

const SWORD_MAP = [
  "......e......",
  ".....eBe.....",
  ".....eBe.....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "...geBWBeg...",
  "..ggeBWBegg..",
  ".gGGGGGGGGGg.",
  "gGgggGGGgggGg",
  ".g...GGG...g.",
  ".....GhG.....",
  ".....GhG.....",
  ".....GhG.....",
  ".....GhG.....",
  ".....GhG.....",
  ".....GhG.....",
  "....GGhGG....",
  "...GGgggGG...",
  "...GGgggGG...",
  "....GGGGG....",
  ".....GGG.....",
];

// A broken blade: the top half is gone, the shear line jagged.
const SWORD_BROKEN_MAP = [
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  ".............",
  "....e..B.....",
  "....eB.Be....",
  ".....BW.e....",
  "....eBW......",
  "....e.WBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "....eBWBe....",
  "...geBWBeg...",
  "..ggeBWBegg..",
  ".gGGGGGGGGGg.",
  "gGgggGGGgggGg",
  ".g...GGG...g.",
  ".....GhG.....",
  ".....GhG.....",
  ".....GhG.....",
  ".....GhG.....",
  ".....GhG.....",
  ".....GhG.....",
  "....GGhGG....",
  "...GGgggGG...",
  "...GGgggGG...",
  "....GGGGG....",
  ".....GGG.....",
];

const SWORD_PALETTES: Record<WeaponState, Palette> = {
  TEMPERED: {
    B: "#b8bdcc", W: "#eef1f8", e: "#6a7080",
    G: "#c9a227", g: "#8a7326", h: "#4a3c14",
  },
  BLUNTED: {
    B: "#8e929e", W: "#b5b9c2", e: "#565a66",
    G: "#a08a3f", g: "#6e6030", h: "#3c3414",
  },
  FRACTURED: {
    B: "#9a8f8a", W: "#c4b6ae", e: "#5e524c",
    G: "#a07c3a", g: "#6e5630", h: "#3c2e14",
  },
  BROKEN: {
    B: "#6e6a66", W: "#8e8a86", e: "#46423e",
    G: "#7c6a3a", g: "#564a30", h: "#2c2414",
  },
};

export function GreatSword(props: { state: WeaponState; height?: number; glow?: number; fire?: boolean }) {
  const map = props.state === "BROKEN" ? SWORD_BROKEN_MAP : SWORD_MAP;
  const glow = Math.max(0, Math.min(1, props.glow ?? 0));
  return (
    <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
      {glow > 0.05 && props.state !== "BROKEN" && (
        <div
          style={{
            position: "absolute", inset: "-12%",
            background: `radial-gradient(ellipse at 50% 38%, ${props.fire ? "rgba(217,123,47," : "rgba(201,162,39,"}${0.12 + glow * 0.3}) 0%, transparent 65%)`,
            filter: "blur(6px)",
          }}
        />
      )}
      <PixelMap map={map} palette={SWORD_PALETTES[props.state]} height={props.height ?? 220}
        style={{ position: "relative" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small icons
// ---------------------------------------------------------------------------

const BAG_MAP = [
  "....rr....",
  "...r..r...",
  "..rBBBBr..",
  ".BBbBBbBB.",
  "BBBBBBBBBB",
  "BbBBBBBBbB",
  "BBBBgBBBBB",
  "BBBBggBBBB",
  ".BBBBBBBB.",
  "..BBBBBB..",
];
const BAG_PAL: Palette = { B: "#7a5a34", b: "#5e4426", r: "#8a7326", g: "#c9a227" };

const STONE_MAP = [
  "..SSSS..",
  ".SssssS.",
  "SssWWssS",
  "SsWWWWsS",
  "SsWWWWsS",
  "SssWWssS",
  ".SssssS.",
  "..SSSS..",
];
const STONE_PAL: Palette = { S: "#3a3a44", s: "#55555f", W: "#6e6e7a" };

const SCROLL_MAP = [
  "rr......",
  "rPPPPPP.",
  ".PppppP.",
  ".PppppP.",
  ".PppppP.",
  ".PppppP.",
  ".PPPPPPr",
  "......rr",
];
const SCROLL_PAL: Palette = { P: "#c9b88a", p: "#e5d7ae", r: "#8a7326" };

const GREAVES_MAP = [
  ".GG..GG.",
  ".Bb..bB.",
  ".Bb..bB.",
  ".Bb..bB.",
  ".BB..BB.",
  "BBb..bBB",
  "BBB..BBB",
];
const HOOD_MAP = [
  "...ss...",
  "..sSSs..",
  ".sSSSSs.",
  ".sSSSSs.",
  "sSSggSSs",
  "sSSSSSSs",
  ".ssssss.",
];
const PAULDRON_MAP = [
  ".pp..pp.",
  "pPPppPPp",
  "pPPppPPp",
  ".gg..gg.",
  ".pp..pp.",
];
const EQUIP_PAL: Palette = {
  G: "#c9a227", g: "#c9a227", B: "#8e929e", b: "#6a7080",
  s: "#4a5668", S: "#8ea7bd", p: "#7e5650", P: "#b0584f",
};

export function PixelIcon(props: { kind: "bag" | "stone" | "scroll" | "greaves" | "hood" | "pauldrons"; height?: number }) {
  const h = props.height ?? 34;
  switch (props.kind) {
    case "bag": return <PixelMap map={BAG_MAP} palette={BAG_PAL} height={h} />;
    case "stone": return <PixelMap map={STONE_MAP} palette={STONE_PAL} height={h} />;
    case "scroll": return <PixelMap map={SCROLL_MAP} palette={SCROLL_PAL} height={h} />;
    case "greaves": return <PixelMap map={GREAVES_MAP} palette={EQUIP_PAL} height={h} />;
    case "hood": return <PixelMap map={HOOD_MAP} palette={EQUIP_PAL} height={h} />;
    case "pauldrons": return <PixelMap map={PAULDRON_MAP} palette={EQUIP_PAL} height={h} />;
  }
}
