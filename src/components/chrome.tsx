/** App chrome: sidebar navigation, top metrics bar, toast rack. */
import React, { useState } from "react";
import {
  BookOpen, Castle, Compass, Feather, FlaskConical, Landmark, ScrollText,
  Settings2, Sword, User, Scale,
} from "lucide-react";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { audio } from "../audio/engine";
import { TheBook } from "./TheBook";
import type { ViewKey } from "../pages/views";

const NAV: { key: ViewKey; tkey: string; icon: React.ReactNode }[] = [
  { key: "today", tkey: "nav.today", icon: <Compass /> },
  { key: "domains", tkey: "nav.domains", icon: <Landmark /> },
  { key: "campaign", tkey: "nav.campaign", icon: <Castle /> },
  { key: "character", tkey: "nav.character", icon: <User /> },
  { key: "arsenal", tkey: "nav.arsenal", icon: <Sword /> },
  { key: "journal", tkey: "nav.journal", icon: <Feather /> },
  { key: "chronicle", tkey: "nav.chronicle", icon: <ScrollText /> },
  { key: "oracle", tkey: "nav.oracle", icon: <FlaskConical /> },
  { key: "settings", tkey: "nav.settings", icon: <Settings2 /> },
];

export function Sidebar(props: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  onNewDirective: () => void;
}) {
  const { snap } = useSystem();
  const { t } = useI18n();
  const unseen = snap?.unseen_events.length ?? 0;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark mono-latin">LV</div>
        <div>
          <div className="brand-name">LUDUS VITAE</div>
          <div className="brand-sub">Deterministic Life Engine</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`nav-item${props.view === n.key ? " active" : ""}`}
            onClick={() => {
              audio.uiTick();
              props.setView(n.key);
            }}
          >
            {n.icon}
            {t(n.tkey)}
            {n.key === "chronicle" && unseen > 0 && <span className="nav-badge mono-latin">{unseen}</span>}
          </button>
        ))}
        <div style={{ padding: "14px 2px 6px" }}>
          <button className="btn primary" style={{ width: "100%" }} onClick={props.onNewDirective}>
            <Scale /> {t("nav.newDirective")}
          </button>
        </div>
      </nav>
      <div className="sidebar-foot">
        <div>{t("sidebar.status")}</div>
        <div className="ok">{t("sidebar.local")}</div>
        <div className="ok">{t("sidebar.operational")}</div>
        <div className="mono-latin" style={{ marginTop: 8 }}>Ludus Vitae v1.0.0</div>
        <div className="mono-latin">TAURI · REACT · SQLITE</div>
      </div>
    </aside>
  );
}

export function TopBar() {
  const { snap } = useSystem();
  const { t } = useI18n();
  const [bookOpen, setBookOpen] = useState(false);
  if (!snap) return <div className="topbar" />;
  const p = snap.profile;
  const w = snap.weapon;
  const now = new Date();
  const staminaPct = (p.current_stamina / p.max_stamina) * 100;
  const momentumColor = p.momentum >= 1.2 ? "var(--gold)" : p.momentum >= 1.0 ? "var(--text-dim)" : "var(--crimson)";
  return (
    <header className="topbar">
      <div className="metric">
        <span className="metric-label">{t("top.level")}</span>
        <span className="metric-value gold mono-latin">{String(p.current_level).padStart(2, "0")}</span>
      </div>
      <div className="metric" style={{ minWidth: 180 }}>
        <span className="metric-label">{t("top.stamina")}</span>
        <span className="metric-value mono-latin">
          {p.current_stamina.toFixed(0)} <span className="unit">/ {p.max_stamina.toFixed(0)}</span>
        </span>
        <div className="metric-bar">
          <div style={{
            width: `${staminaPct}%`,
            background: staminaPct > 35 ? "linear-gradient(90deg,var(--gold-dim),var(--gold))" : "var(--crimson)",
          }} />
        </div>
      </div>
      <div className="metric">
        <span className="metric-label">{t("top.momentum")}</span>
        <span className="metric-value mono-latin" style={{ color: momentumColor }}>
          {p.momentum.toFixed(2)}
        </span>
      </div>
      <div className="metric">
        <span className="metric-label">{t("top.sharpness")}</span>
        <span className="metric-value mono-latin">
          {w.sharpness.toFixed(1)} <span className="unit">/ 100</span>
        </span>
      </div>
      <div className="metric">
        <span className="metric-label">{t("top.durability")}</span>
        <span className={`metric-value mono-latin${w.durability < 30 ? " crimson" : ""}`}>
          {w.durability.toFixed(0)} <span className="unit">/ 100</span>
        </span>
      </div>
      <div className="metric">
        <span className="metric-label">{t("top.chapterDay")}</span>
        <span className="metric-value mono-latin">{p.campaign_day}</span>
      </div>
      <div className="topbar-right">
        <span className="topbar-clock mono-latin">
          {now.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
          {" · "}
          {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="topbar-mode">{t("top.localMode")} ●</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", paddingInlineStart: 16 }}>
        <button
          className="btn small"
          title="The Book — everything explained, English & Arabic / الكتاب"
          onClick={() => { audio.uiOpen(); setBookOpen(true); }}
        >
          <BookOpen /> {t("top.theBook")}
        </button>
      </div>
      {bookOpen && <TheBook onClose={() => { audio.uiClose(); setBookOpen(false); }} />}
    </header>
  );
}

export function ToastRack() {
  const { toasts, dismissToast } = useSystem();
  return (
    <div className="toast-rack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismissToast(t.id)}>
          <div className="toast-head">{t.head}</div>
          <div>{t.body}</div>
        </div>
      ))}
    </div>
  );
}
