/** TODAY — the Execution Command Center. */
import React, { useEffect, useState } from "react";
import { ChevronRight, Crosshair, Skull, Swords } from "lucide-react";
import { bridge } from "../api/bridge";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { Gauge, Modal, ProofField, SectorTag, WeightTag } from "../components/ui";
import { WorldStrip } from "../components/WorldStrip";
import { SpriteAnim, bossSheet } from "../components/SpriteAnim";
import type { OracleResponse } from "../types/contracts";
import type { HabitView, ViewSetter } from "./pageProps";

export function TodayPage({ setView }: { setView: ViewSetter }) {
  const { snap, executeHabit } = useSystem();
  const { t } = useI18n();
  const [proofFor, setProofFor] = useState<HabitView | null>(null);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [ambient, setAmbient] = useState<OracleResponse | null>(null);

  const doneCount = snap?.habits.filter((h) => !h.is_archived && h.executed_today).length ?? 0;

  // Ambient oracle: the offline deterministic diagnostician watches the day.
  // Re-reads after each verified execution, since findings shift with state.
  useEffect(() => {
    let cancelled = false;
    void bridge.getAmbientDiagnostic("ORACLE").then((r) => {
      if (!cancelled) setAmbient(r);
    }).catch(() => { /* the snapshot error path covers real failures */ });
    return () => { cancelled = true; };
  }, [snap?.today_key, doneCount]);

  if (!snap) return null;
  const p = snap.profile;
  const due = snap.habits.filter((h) => !h.is_archived && h.due_today);
  const done = snap.habits.filter((h) => !h.is_archived && h.executed_today);
  const upcoming = snap.habits.filter((h) => !h.is_archived && !h.due_today && !h.executed_today);
  const alive = snap.bosses.filter((b) => !b.defeated);

  const startExecution = (h: HabitView) => {
    if (h.verification === "MANUAL") {
      void executeHabit(h.id, null, null);
    } else {
      setProofFor(h);
      setProofPath(null);
      setNote("");
    }
  };

  // Keyboard warfare: 1–9 executes the nth due directive.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (proofFor) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) {
        const target = snap.habits.filter((h) => !h.is_archived && h.due_today)[n - 1];
        if (target) startExecution(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, proofFor]);

  const submitProof = async () => {
    if (!proofFor) return;
    setBusy(true);
    const r = await executeHabit(proofFor.id, proofPath, note.trim() || null);
    setBusy(false);
    if (r) setProofFor(null);
  };

  const windowText = (h: HabitView) =>
    h.window_start_hour !== null && h.window_end_hour !== null
      ? `${String(h.window_start_hour).padStart(2, "0")}:00–${String(h.window_end_hour).padStart(2, "0")}:00`
      : "any hour";

  return (
    <div>
      <div className="page-heading">
        <h1>
          {t("nav.today")}, {new Date().toLocaleDateString(undefined, { day: "2-digit", month: "long" })}
        </h1>
        <div className="sub">
          {t("today.sub")} · {t("camp.chapter")} {p.current_level}: {p.level_title}
        </div>
      </div>

      {(snap.gate.reckoning_ready || snap.gate.forceable) && (
        <div
          className="panel"
          style={{
            marginBottom: 16,
            borderColor: snap.gate.forceable ? "var(--gold)" : "var(--crimson-deep)",
            display: "flex", alignItems: "center", gap: 16, padding: "14px 20px",
          }}
        >
          <Skull size={20} style={{ color: snap.gate.forceable ? "var(--gold-bright)" : "var(--crimson)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-display)", letterSpacing: 2, fontSize: 15,
              color: snap.gate.forceable ? "var(--gold-bright)" : "var(--crimson)" }}>
              {snap.gate.forceable ? t("today.gateForce") : t("today.bladeForged")}
            </div>
            <div className="dim mono-latin" style={{ fontSize: 10.5, marginTop: 3 }}>
              {(snap.gate.global_progress * 100).toFixed(0)}% · {snap.weapon.sharpness.toFixed(0)}
            </div>
          </div>
          <button className={`btn ${snap.gate.forceable ? "primary" : "danger"}`} onClick={() => setView("campaign")}>
            {t("act.toCampaign")} <ChevronRight />
          </button>
        </div>
      )}

      <WorldStrip paused={proofFor !== null} />

      <div className="cols-main-side" style={{ marginTop: 16 }}>
        <div>
          <div className="panel">
            <div className="panel-title">{t("today.battlePlan")}</div>
            <div className="panel-sub">
              <span className="mono-latin">{due.length}</span> {t("today.awaiting")} · <span className="mono-latin">{done.length}</span> {t("today.verified")} · {t("today.tonightMomentum")}:{" "}
              <b className="gold-text mono-latin">{snap.projection.momentum_if_all_executed.toFixed(2)}</b> {t("today.ifExecuted")},{" "}
              <b className="crimson-text mono-latin">{snap.projection.momentum_if_all_missed.toFixed(2)}</b> {t("today.ifAbandoned")}
              {" "}· {t("today.keysExecute")}
            </div>

            {snap.recommended && (
              <div
                className="directive-row"
                style={{ borderColor: "var(--gold-dim)", background: "linear-gradient(90deg, var(--gold-glow), var(--bg2) 60%)" }}
              >
                <Crosshair size={17} style={{ color: "var(--gold-bright)", marginInlineStart: 4 }} />
                <div className="directive-main">
                  <div style={{ fontSize: 10.5, color: "var(--gold-dim)" }}>
                    {t("today.nextStrike")} <span className="mono-latin">{snap.recommended.score.toFixed(2)}</span>
                  </div>
                  <div className="directive-name" style={{ marginTop: 2 }}>{snap.recommended.habit_name}</div>
                  <div className="directive-desc">{snap.recommended.reason}</div>
                </div>
                <button
                  className="btn primary"
                  onClick={() => {
                    const h = snap.habits.find((x) => x.id === snap.recommended!.habit_id);
                    if (h) startExecution(h);
                  }}
                >
                  <Swords /> {t("today.strikeNow")}
                </button>
              </div>
            )}

            {due.length === 0 && done.length === 0 && (
              <div className="empty-slate">{t("today.nothingDue")}</div>
            )}

            {due.map((h, i) => (
              <div key={h.id} className={`directive-row${h.rusted ? " rusted" : ""}`}>
                <div className="directive-idx mono-latin">{i + 1}</div>
                <div className="directive-main">
                  <div className="directive-name">
                    {h.name}
                    <SectorTag sector={h.sector} />
                    <WeightTag weight={h.weight} />
                    {h.sworn_boss_name && (
                      <span className="tag gold">⚔ {h.sworn_boss_name}</span>
                    )}
                    {h.cursed && <span className="tag crimson">{t("word.cursed")}</span>}
                    {h.rusted && <span className="rust-chip mono-latin">⚠ ×{h.consecutive_misses}</span>}
                    {!h.in_window_now && <span className="tag neutral">{t("word.offWindow")}</span>}
                  </div>
                  {h.description && <div className="directive-desc">{h.description}</div>}
                  <div className="directive-numbers" style={{ marginTop: 5 }}>
                    <span>{t("word.window")} <b className="mono-latin">{windowText(h)}</b></span>
                    <span>{t("word.cost")} <b className="mono-latin">{h.activation_cost.toFixed(1)}</b></span>
                    <span>{t("word.yield")} <b className="mono-latin">+{h.momentum_gain.toFixed(2)}</b></span>
                    <span>{t("word.proof")} <b>{t(`vt.${h.verification}`)}</b></span>
                    <span>{t("word.streak")} <b className="mono-latin">{h.streak_days}{t("dom.days")}</b></span>
                  </div>
                </div>
                <button className="btn primary" onClick={() => startExecution(h)}>
                  <Swords /> {t("act.execute")}
                </button>
              </div>
            ))}

            {done.map((h) => (
              <div key={h.id} className="directive-row done">
                <div className="directive-idx">✓</div>
                <div className="directive-main">
                  <div className="directive-name">
                    {h.name} <SectorTag sector={h.sector} /> <WeightTag weight={h.weight} />
                    <span className="tag green">{t("word.verified")}</span>
                  </div>
                  <div className="directive-numbers" style={{ marginTop: 4 }}>
                    <span>{t("word.streak")} <b className="mono-latin">{h.streak_days}{t("dom.days")}</b></span>
                    <span>{t("dom.lifetime")} <b className="mono-latin">{h.total_executions}</b></span>
                  </div>
                </div>
              </div>
            ))}

            {upcoming.length > 0 && (
              <div className="hint">
                {t("today.dormant")}: {upcoming.map((h) => h.name).join(" · ")}
              </div>
            )}
          </div>

          {ambient && (
            <div className="panel">
              <div className="panel-title">{t("today.oracleWatches")}</div>
              <div className="panel-sub">
                {t("today.oracleSub")} ·{" "}
                <span
                  className="gold-text"
                  style={{ cursor: "pointer" }}
                  onClick={() => setView("oracle")}
                >
                  {t("today.consultChamber")}
                </span>
              </div>
              <div className="oracle-terminal" style={{ minHeight: 0, padding: "14px 16px" }}>
                <div className="oracle-narrative" style={{ fontSize: 13 }}>"{ambient.narrative_log}"</div>
                {ambient.cognitive_bias_detected !== "NONE" && (
                  <div className="oracle-bias" style={{ marginTop: 8 }}>
                    {t("or.biasDetected")} // {ambient.cognitive_bias_detected}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="panel">
            <div className="panel-title">{t("today.activeCampaign")}</div>
            <div className="panel-sub">
              {t("camp.chapter")} {p.current_level}: {t(`ch.${p.current_level}.t`)}
            </div>
            {snap.bosses.map((b) => (
              <div key={b.id} className={`boss-card${b.defeated ? " defeated" : ""}`}
                style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className={`portrait-frame${b.defeated ? " gold" : ""}`}
                  style={{ width: 54, height: 54, minWidth: 54 }}>
                  <SpriteAnim sheet={bossSheet(b.sector, b.level)} height={40} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="boss-head">
                    <span className="boss-name" style={{ fontSize: 13 }}>
                      {b.name} {b.ascended && <span className="ascended-mark">{t("word.ascended")}</span>}
                    </span>
                    <span className="boss-hp mono-latin">{b.current_hp.toFixed(0)}/{b.total_hp.toFixed(0)}</span>
                  </div>
                  <div className="hp-track" style={{ marginTop: 5 }}>
                    <div className="hp-fill" style={{ width: `${(b.current_hp / b.total_hp) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}

            <Gauge
              label={t("camp.gateProgress")}
              value={snap.gate.global_progress * 100}
              max={100}
              color={snap.gate.global_ok ? "green" : "gold"}
              display={`${(snap.gate.global_progress * 100).toFixed(0)}%`}
              markerAt={80}
            />
            {snap.gate.sector_progress.map((s) => (
              <Gauge
                key={s.sector}
                label={`${t(`sec.${s.sector}`)}${s.cursed ? " · " + t("word.cursed") : ""}`}
                value={s.progress * 100}
                max={100}
                color={s.ok ? "green" : "crimson"}
                display={`${(s.progress * 100).toFixed(0)}%`}
                markerAt={50}
              />
            ))}
            <Gauge label={t("top.sharpness")} value={snap.weapon.sharpness} max={100} color="gold"
              markerAt={snap.gate.reckoning_min_sharpness}
              display={`${snap.weapon.sharpness.toFixed(0)} / ${snap.gate.reckoning_min_sharpness.toFixed(0)}`} />
            <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={() => setView("campaign")}>
              {t("act.openCampaign")} <ChevronRight />
            </button>
          </div>
        </div>
      </div>

      {proofFor && (
        <Modal
          title={`${t("today.verifyTitle")}: ${proofFor.name}`}
          sub={`${t(`vt.${proofFor.verification}`)} · ${t("word.cost")} ${proofFor.activation_cost.toFixed(1)} · +${proofFor.momentum_gain.toFixed(2)}`}
          onClose={() => setProofFor(null)}
        >
          <ProofField verification={proofFor.verification} value={proofPath} onChange={setProofPath} />
          <label className="field" style={{ marginTop: 16 }}>
            <span className="field-label">{t("today.fieldNote")}</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setProofFor(null)}>{t("today.withdraw")}</button>
            <button className="btn primary" onClick={submitProof}
              disabled={busy || (proofFor.verification !== "MANUAL" && !proofPath)}>
              {t("today.submitEvidence")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
