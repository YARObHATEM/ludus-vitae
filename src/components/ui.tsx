/** Shared presentational atoms. No business logic lives here. */
import React, { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Sector, VerificationType, WeightClass } from "../types/contracts";
import { audio } from "../audio/engine";
import { useI18n } from "../i18n/I18nProvider";

export function Gauge(props: {
  label: string;
  value: number;
  max: number;
  color?: "gold" | "crimson" | "green" | "steel";
  display?: string;
  markerAt?: number;
}) {
  const pct = props.max > 0 ? Math.max(0, Math.min(100, (props.value / props.max) * 100)) : 0;
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span className="gauge-label">{props.label}</span>
        <span className="gauge-value">{props.display ?? `${props.value.toFixed(1)} / ${props.max.toFixed(0)}`}</span>
      </div>
      <div className="gauge-track">
        <div className={`gauge-fill ${props.color ?? "gold"}`} style={{ width: `${pct}%` }} />
        {props.markerAt !== undefined && props.max > 0 && (
          <div className="gauge-marker" style={{ left: `${(props.markerAt / props.max) * 100}%` }} />
        )}
      </div>
    </div>
  );
}

export function Modal(props: {
  title: string;
  sub?: string;
  wide?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    audio.uiOpen();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && props.onClose) {
        audio.uiClose();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className="modal-veil"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && props.onClose) {
          audio.uiClose();
          props.onClose();
        }
      }}
    >
      <div className={`modal${props.wide ? " wide" : ""}`}>
        <h2 className="modal-title">{props.title}</h2>
        {props.sub && <div className="modal-sub">{props.sub}</div>}
        {props.children}
      </div>
    </div>
  );
}

const sectorClass: Record<Sector, string> = {
  FINANCIAL: "fin",
  INTELLECTUAL: "int",
  PHYSICAL: "phy",
  RESPONSIBILITY: "resp",
};

export function SectorTag({ sector }: { sector: Sector }) {
  const { t } = useI18n();
  return <span className={`tag ${sectorClass[sector]}`}>{t(`sec.${sector}`)}</span>;
}

export function WeightTag({ weight }: { weight: WeightClass }) {
  const { t } = useI18n();
  const cls = weight === "MYTHIC" ? "gold" : weight === "HEROIC" ? "crimson" : "neutral";
  return <span className={`tag ${cls}`}>{t(`wt.${weight}`)}</span>;
}

export function VerifTag({ v }: { v: VerificationType }) {
  const { t } = useI18n();
  return <span className="tag neutral">{t(`vt.${v}`)}</span>;
}

/** File-evidence picker backed by the native dialog (Rust-mediated). */
export function ProofField(props: {
  verification: VerificationType;
  value: string | null;
  onChange: (path: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (props.verification === "MANUAL") {
    return (
      <div className="hint">
        Honest Manual Check — verified on your integrity alone. The system trusts you; the mirror keeps score.
      </div>
    );
  }
  const pick = async () => {
    setBusy(true);
    try {
      const selected = await open({
        multiple: false,
        title: props.verification === "IMAGE" ? "Select image evidence (cobblestone)" : "Select file evidence (archive scroll)",
        filters:
          props.verification === "IMAGE"
            ? [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"] }]
            : undefined,
      });
      if (typeof selected === "string") props.onChange(selected);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn small" onClick={pick} disabled={busy}>
          {props.verification === "IMAGE" ? "Attach Image Evidence" : "Attach File Evidence"}
        </button>
        {props.value && (
          <button className="btn small danger" onClick={() => props.onChange(null)}>
            Clear
          </button>
        )}
      </div>
      {props.value ? (
        <div className="mono dim" style={{ marginTop: 8, wordBreak: "break-all", fontSize: 11 }}>
          {props.value}
        </div>
      ) : (
        <div className="hint">
          {props.verification === "IMAGE"
            ? "Image proof required — a cobblestone is laid only over real evidence."
            : "File payload required — the archive accepts documents, spreadsheets, notes."}
        </div>
      )}
    </div>
  );
}

/** Minimal deterministic SVG trend chart. */
export function TrendChart(props: {
  series: { name: string; color: string; values: number[] }[];
  height?: number;
  yMax?: number;
  yMin?: number;
  refLine?: number;
}) {
  const h = props.height ?? 120;
  const w = 640;
  const all = props.series.flatMap((s) => s.values);
  if (all.length === 0) return <div className="empty-slate">No recorded days yet. The chronicle begins tonight.</div>;
  const max = props.yMax ?? Math.max(...all) * 1.08;
  const min = props.yMin ?? Math.min(0, ...all);
  const span = max - min || 1;
  const n = Math.max(...props.series.map((s) => s.values.length));
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * (w - 8) + 4);
  const y = (v: number) => h - 6 - ((v - min) / span) * (h - 12);
  return (
    <div className="chart-frame">
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", display: "block" }}>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={0} x2={w} y1={h * t} y2={h * t} stroke="#232330" strokeWidth={1} />
        ))}
        {props.refLine !== undefined && (
          <line x1={0} x2={w} y1={y(props.refLine)} y2={y(props.refLine)}
            stroke="#8a7326" strokeWidth={1} strokeDasharray="5 4" />
        )}
        {props.series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={1.8}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
        ))}
      </svg>
      <div className="chart-legend">
        {props.series.map((s) => (
          <span key={s.name}>
            <i className="legend-dot" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function fmtDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
