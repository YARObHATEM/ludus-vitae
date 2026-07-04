/** The Night Ledger — everything the engine did while you were away. */
import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import type { OracleResponse } from "../types/contracts";
import { Modal, fmtDate } from "./ui";

const KIND_COLOR: Record<string, string> = {
  MISS: "var(--crimson)",
  EXECUTION: "var(--green)",
  MILESTONE: "var(--gold-bright)",
  BOSS_DEFEATED: "var(--gold-bright)",
  WEAPON: "var(--steel)",
  TERRAIN: "var(--rust)",
  RECKONING: "var(--crimson)",
  LEVEL: "var(--gold-bright)",
  CYCLE: "var(--crimson)",
  GENESIS: "var(--gold-bright)",
};

export function NightLedger({ onClose }: { onClose: () => void }) {
  const { snap, refresh } = useSystem();
  const { t } = useI18n();
  const events = snap?.unseen_events ?? [];
  const [verdict, setVerdict] = useState<OracleResponse | null>(null);
  const [asking, setAsking] = useState(false);

  const acknowledge = async () => {
    await bridge.markEventsSeen();
    await refresh();
    onClose();
  };

  const askOracle = async () => {
    setAsking(true);
    try {
      const r = await bridge.fetchPersonaCritique("ORACLE", true);
      setVerdict(r);
      audio.oracleWhisper();
    } catch {
      /* the offline path inside the command already covers failures */
    } finally {
      setAsking(false);
    }
  };

  return (
    <Modal
      title={t("nl.title")}
      sub={t("nl.sub")}
      onClose={acknowledge}
      wide
    >
      {events.length === 0 ? (
        <div className="empty-slate">{t("nl.balanced")}</div>
      ) : (
        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {events.slice().reverse().map((e) => (
            <div key={e.id} className="kv" style={{ alignItems: "baseline", gap: 14 }}>
              <span className="k" style={{ color: KIND_COLOR[e.kind] ?? "var(--text-dim)", minWidth: 120 }}>
                {e.kind.replace("_", " ")}
              </span>
              <span style={{ flex: 1, fontSize: 13.5 }}>{e.detail}</span>
              <span className="faint mono-latin" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{fmtDate(e.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
      {verdict && (
        <div className="oracle-terminal" style={{ marginTop: 14, minHeight: 0 }}>
          <div className="head mono-latin">[{verdict.mode}] {t("or.oracleName")}</div>
          <div className="oracle-narrative" style={{ fontSize: 13 }}>"{verdict.narrative_log}"</div>
          {verdict.cognitive_bias_detected !== "NONE" && (
            <div className="oracle-bias" style={{ marginTop: 8 }}>{t("or.biasDetected")} // {verdict.cognitive_bias_detected}</div>
          )}
        </div>
      )}
      <div className="modal-actions">
        {events.length > 0 && !verdict && (
          <button className="btn" onClick={askOracle} disabled={asking}>
            <Sparkles /> {asking ? t("nl.reading") : t("nl.askOracle")}
          </button>
        )}
        <button className="btn primary" onClick={acknowledge}>{t("act.acknowledge")}</button>
      </div>
    </Modal>
  );
}
