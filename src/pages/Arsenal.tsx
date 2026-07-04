/** ARSENAL — the great sword, the evidence bag, the earned relics. */
import React, { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { bridge } from "../api/bridge";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { Gauge, SectorTag, fmtDate } from "../components/ui";
import { GreatSword, PixelIcon } from "../components/pixelArt";

const WEAPON_STATE_KEY: Record<string, string> = {
  TEMPERED: "ws.tempered.d",
  BLUNTED: "ws.blunted.d",
  FRACTURED: "ws.fractured.d",
  BROKEN: "ws.broken.d",
};

interface EvidenceItem {
  id: string;
  label: string;
  sector: string | null;
  path: string;
  timestamp: string;
  kind: "COBBLESTONE" | "SCROLL";
}

export function ArsenalPage() {
  const { snap, pushToast } = useSystem();
  const { t } = useI18n();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const evidence: EvidenceItem[] = [];
  if (snap) {
    for (const log of snap.recent_logs) {
      if (log.proof_path) {
        const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(log.proof_path);
        evidence.push({
          id: `log-${log.id}`, label: log.habit_name, sector: log.sector,
          path: log.proof_path, timestamp: log.timestamp,
          kind: isImage ? "COBBLESTONE" : "SCROLL",
        });
      }
    }
    for (const b of snap.bosses) {
      for (const m of b.milestones) {
        if (m.completed && m.proof_path) {
          const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(m.proof_path);
          evidence.push({
            id: `ms-${m.id}`, label: m.description, sector: b.sector,
            path: m.proof_path, timestamp: m.completed_at ?? "",
            kind: isImage ? "COBBLESTONE" : "SCROLL",
          });
        }
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of evidence.filter((e) => e.kind === "COBBLESTONE").slice(0, 12)) {
        if (thumbs[item.id]) continue;
        try {
          const dataUrl = await bridge.readProofThumbnail(item.path);
          if (!cancelled) setThumbs((t) => ({ ...t, [item.id]: dataUrl }));
        } catch { /* moved evidence is reported on open */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  if (!snap) return null;
  const w = snap.weapon;

  const reveal = async (path: string) => {
    try { await revealItemInDir(path); }
    catch (e) { pushToast("error", "VAULT", `Could not reveal evidence: ${e}`); }
  };

  const equipIcon = (sector: string) =>
    sector === "FINANCIAL" ? "greaves" : sector === "INTELLECTUAL" ? "hood" : "pauldrons";

  return (
    <div>
      <div className="page-heading">
        <h1>{t("ars.title")}</h1>
        <div className="sub">{t("ars.sub")}</div>
      </div>

      <div className="cols-main-side">
        <div>
          <div className="panel" style={{ display: "flex", gap: 26, alignItems: "center" }}>
            <div style={{ textAlign: "center", minWidth: 140 }}>
              <GreatSword
                state={w.state}
                height={230}
                glow={Math.max(0, (w.sharpness - 25) / 75)}
                fire={w.fire_affinity > 0.25}
              />
              <div style={{
                marginTop: 8, fontSize: 13,
                color: w.state === "TEMPERED" ? "var(--gold-bright)" : "var(--crimson)",
              }}>
                {t(`ws.${w.state}`)}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="panel-title" style={{ marginBottom: 10 }}>{t("ars.forgedBlade")}</div>
              <Gauge label={t("ars.sharpLabel")} value={w.sharpness} max={100}
                color="gold" markerAt={snap.gate.reckoning_min_sharpness}
                display={`${w.sharpness.toFixed(1)} / 100`} />
              <Gauge label={t("ars.durLabel")} value={w.durability} max={100}
                color={w.durability < 30 ? "crimson" : "steel"} markerAt={30}
                display={`${w.durability.toFixed(1)} / 100`} />
              <div className="kv"><span className="k">🔥 {t("ars.fire")}</span>
                <span className="v mono-latin">{(w.fire_affinity * 100).toFixed(0)}%</span></div>
              <div className="kv"><span className="k">⚡ {t("ars.lightning")}</span>
                <span className="v mono-latin">{(w.lightning_affinity * 100).toFixed(0)}%</span></div>
              <div className="kv"><span className="k">{t("ars.whetstrokes")}</span>
                <span className="v mono-latin">{w.forge_count_total}</span></div>
              {w.state === "BROKEN" && (
                <div className="kv"><span className="k">{t("ws.BROKEN")}</span>
                  <span className="v crimson-text mono-latin">{w.reforge_progress} / 7</span></div>
              )}
              <div className="hint">{t(WEAPON_STATE_KEY[w.state])}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <PixelIcon kind="bag" height={30} /> {t("ars.bag")}
            </div>
            <div className="panel-sub">
              <span className="mono-latin">{snap.evidence_count}</span> {t("ars.bag")} · {(snap.paving_ratio * 100).toFixed(0)}% {t("world.paved")}
            </div>
            {evidence.length === 0 && (
              <div className="empty-slate">{t("ars.bagEmpty")}</div>
            )}
            <div className="bag-grid">
              {evidence.slice(0, 18).map((e) => (
                <div key={e.id} className="bag-slot">
                  {e.kind === "COBBLESTONE" && thumbs[e.id] ? (
                    <img src={thumbs[e.id]} alt={e.label}
                      style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 3, border: "1px solid var(--line)" }} />
                  ) : (
                    <div style={{ height: 64, display: "grid", placeItems: "center" }}>
                      <PixelIcon kind={e.kind === "COBBLESTONE" ? "stone" : "scroll"} height={44} />
                    </div>
                  )}
                  <div className="label">{e.label}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
                    <span className="faint" style={{ fontSize: 9 }}>{e.timestamp ? fmtDate(e.timestamp).slice(0, 11) : ""}</span>
                    <button className="btn small" onClick={() => void reveal(e.path)} title={e.path}>
                      <FolderOpen />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">{t("ars.relics")}</div>
          <div className="panel-sub">{t("ars.relicsSub")}</div>
          {snap.equipment.map((eq) => (
            <div key={`${eq.level}-${eq.sector}`} className="kv"
              style={{ opacity: eq.unlocked ? 1 : 0.4, alignItems: "center" }}>
              <span className="k" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ filter: eq.unlocked ? "none" : "grayscale(1) brightness(0.6)" }}>
                  <PixelIcon kind={equipIcon(eq.sector)} height={22} />
                </span>
                <span className="mono-latin">L{eq.level}</span> <SectorTag sector={eq.sector} />
              </span>
              <span className="v" style={{ color: eq.unlocked ? "var(--gold-bright)" : "var(--text-faint)" }}>
                {eq.unlocked ? eq.name : t("word.sealed")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
