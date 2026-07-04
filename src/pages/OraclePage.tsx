/** ORACLE — the read-only intelligence layer and its four voices. */
import React, { useEffect, useState } from "react";
import { RadioTower, ScrollText, Sparkles } from "lucide-react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { fmtDate } from "../components/ui";
import { PERSONA_SHEETS, SpriteAnim } from "../components/SpriteAnim";
import type { OracleLogView, OracleResponse, Persona } from "../types/contracts";

const PERSONAS: { key: Persona; name: string; roleKey: string }[] = [
  { key: "ORACLE", name: "The Oracle", roleKey: "or.oracleRole" },
  { key: "MALACHAI", name: "Malachai", roleKey: "or.malachaiRole" },
  { key: "IGNATIUS", name: "Ignatius", roleKey: "or.ignatiusRole" },
  { key: "KALDOR", name: "Cmdr. Kaldor", roleKey: "or.kaldorRole" },
];

export function OraclePage() {
  const { snap, refresh } = useSystem();
  const { t } = useI18n();
  const [persona, setPersona] = useState<Persona>("ORACLE");
  const [preferRemote, setPreferRemote] = useState(true);
  const [response, setResponse] = useState<OracleResponse | null>(null);
  const [logs, setLogs] = useState<OracleLogView[]>([]);
  const [busy, setBusy] = useState(false);
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    void bridge.getOracleLogs(30).then(setLogs).catch(() => setLogs([]));
  }, [response]);

  if (!snap) return null;

  const runDiagnostic = async () => {
    setBusy(true);
    try {
      const r = await bridge.fetchPersonaCritique(persona, preferRemote && snap.oracle_configured);
      setResponse(r);
      audio.oracleWhisper();
      if (r.trigger_glitch_vfx) {
        setGlitch(true);
        window.setTimeout(() => setGlitch(false), 900);
      }
      await refresh();
    } catch (e) {
      setResponse({
        persona_emitter: persona,
        cognitive_bias_detected: "NONE",
        narrative_log: `The bridge failed entirely: ${e}`,
        apply_low_pass_audio_filter: false,
        trigger_glitch_vfx: false,
        mode: "LOCAL_FALLBACK",
        timestamp: new Date().toISOString(),
        upstream_error: String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const modeTag =
    snap.oracle_configured && preferRemote
      ? { text: `REMOTE · ${snap.oracle_model}`, color: "var(--green)" }
      : { text: "OFFLINE DETERMINISTIC DIAGNOSTICS", color: "var(--steel)" };

  return (
    <div>
      <div className="page-heading">
        <h1>{t("oracle.title")}</h1>
        <div className="sub">{t("oracle.sub")}</div>
      </div>

      <div className="panel">
        <div className="panel-title">{t("oracle.chooseVoice")}</div>
        <div className="persona-row" style={{ marginTop: 12 }}>
          {PERSONAS.map((p) => (
            <div key={p.key}
              className={`persona-card${persona === p.key ? " selected" : ""}`}
              onClick={() => { audio.uiTick(); setPersona(p.key); }}>
              <div style={{ height: 72, display: "grid", placeItems: "center", marginBottom: 8 }}>
                <SpriteAnim sheet={PERSONA_SHEETS[p.key]} height={p.key === "KALDOR" ? 40 : 64} />
              </div>
              <div className="persona-name">{p.name}</div>
              <div className="persona-role">{t(p.roleKey)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn primary big" onClick={runDiagnostic} disabled={busy}>
            <Sparkles /> {busy ? t("or.consulting") : t("or.runDiag")}
          </button>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={preferRemote} disabled={!snap.oracle_configured}
              onChange={(e) => setPreferRemote(e.target.checked)} />
            <span className="dim" style={{ fontSize: 12 }}>
              {t("or.preferRemote")} {snap.oracle_configured ? "" : t("or.noKey")}
            </span>
          </label>
          <span className="mono-latin" style={{ marginInlineStart: "auto", fontSize: 10, color: modeTag.color }}>
            <RadioTower size={11} style={{ verticalAlign: "-1.5px" }} /> {modeTag.text}
          </span>
        </div>

        <div className={`oracle-terminal${glitch ? " glitch" : ""}`} style={{ marginTop: 16 }}>
          <div className="head mono-latin">
            [{response ? response.mode : "IDLE"}] {response ? `${response.persona_emitter} · ${fmtDate(response.timestamp)}` : t("or.chamberWaits")}
          </div>
          {response ? (
            <>
              <div className="oracle-narrative">"{response.narrative_log}"</div>
              <div className="oracle-bias">
                {t("or.biasDetected")} // {response.cognitive_bias_detected}
              </div>
              {response.upstream_error && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--crimson)" }}>
                  {response.upstream_error}
                </div>
              )}
            </>
          ) : (
            <div className="oracle-narrative faint">{t("or.idle")}</div>
          )}
        </div>
      </div>

      <details className="panel">
        <summary className="panel-title" style={{ cursor: "pointer" }}>
          <ScrollText size={14} /> {t("oracle.priorConsults")} (<span className="mono-latin">{logs.length}</span>)
        </summary>
        <div style={{ marginTop: 12, maxHeight: "40vh", overflowY: "auto" }}>
          {logs.length === 0 && <div className="empty-slate">No consultations recorded.</div>}
          {logs.map((l) => (
            <div key={l.id} className="kv" style={{ alignItems: "baseline", gap: 12 }}>
              <span className="k" style={{ minWidth: 88 }}>{l.persona}</span>
              <span style={{ flex: 1, fontSize: 13, fontStyle: "italic" }}>"{l.narrative}"</span>
              <span className="mono faint" style={{ fontSize: 9.5, whiteSpace: "nowrap" }}>
                {l.mode} · {fmtDate(l.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
