/**
 * CAMPAIGN — drill-down: the Ladder of chapters → one chapter's war room →
 * one boss's chamber. One thing per screen; depth behind doors.
 */
import React, { useState } from "react";
import { ChevronRight, DoorOpen, Hammer, PenLine, Skull, Sparkles, Swords, Trash2 } from "lucide-react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { Gauge, Modal, ProofField, SectorTag } from "../components/ui";
import { OracleDraftModal } from "../components/OracleDraftModal";
import { SpriteAnim, bossSheet, woundClass } from "../components/SpriteAnim";
import type { BossView, MilestoneView, VerificationType } from "../types/contracts";

export function CampaignPage() {
  const { snap, completeMilestone, callReckoning, pushToast, refresh, settings } = useSystem();
  const { t } = useI18n();
  const [openLevel, setOpenLevel] = useState<number | null>(null);
  const [openBossId, setOpenBossId] = useState<number | null>(null);
  const [proofFor, setProofFor] = useState<MilestoneView | null>(null);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [confirmReckoning, setConfirmReckoning] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [draftFor, setDraftFor] = useState<BossView | null>(null);
  const [editingMs, setEditingMs] = useState<MilestoneView | null>(null);
  const [forgeFor, setForgeFor] = useState<BossView | null>(null);
  const [msDesc, setMsDesc] = useState("");
  const [msDamage, setMsDamage] = useState(20);
  const [msProof, setMsProof] = useState<VerificationType>("MANUAL");
  const [msReqStat, setMsReqStat] = useState<string>("");
  const [msReqValue, setMsReqValue] = useState(12);
  const [busy, setBusy] = useState(false);

  if (!snap) return null;
  const gate = snap.gate;
  const currentLevel = snap.profile.current_level;
  const openBoss = snap.bosses.find((b) => b.id === openBossId) ?? null;

  // ---- shared actions ----------------------------------------------------

  const startMilestone = (m: MilestoneView) => {
    if (m.proof_type === "MANUAL") void completeMilestone(m.id, null);
    else { setProofFor(m); setProofPath(null); }
  };

  const submitProof = async () => {
    if (!proofFor) return;
    setBusy(true);
    const r = await completeMilestone(proofFor.id, proofPath);
    setBusy(false);
    if (r) setProofFor(null);
  };

  const openMsEditor = (m: MilestoneView) => {
    setEditingMs(m);
    setMsDesc(m.description);
    setMsDamage(m.damage_value);
    setMsProof(m.proof_type);
    setMsReqStat(m.req_stat ?? "");
    setMsReqValue(m.req_value ?? 12);
  };

  const saveMilestone = async () => {
    setBusy(true);
    try {
      if (editingMs) {
        await bridge.editBossMilestone(editingMs.id, msDesc.trim(), msDamage, msProof,
          msReqStat || null, msReqStat ? msReqValue : null);
        pushToast("success", "MILESTONE REVISED", "The vow is rewritten.");
      } else if (forgeFor) {
        await bridge.addBossMilestone(forgeFor.id, msDesc.trim(), msDamage, msProof,
          msReqStat || null, msReqStat ? msReqValue : null);
        pushToast("success", "MILESTONE FORGED", `A new vow binds ${forgeFor.name}.`);
      }
      audio.milestoneSeal();
      await refresh();
      setEditingMs(null);
      setForgeFor(null);
      setMsDesc("");
    } catch (e) {
      pushToast("error", "THE FORGE REFUSED", String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeMilestone = async (m: MilestoneView) => {
    try {
      await bridge.deleteBossMilestone(m.id);
      audio.declineThud();
      pushToast("success", "VOW WITHDRAWN", "The unsealed milestone is erased.");
      await refresh();
    } catch (e) {
      pushToast("error", "REFUSED", String(e));
    }
  };

  const reckon = async () => {
    setConfirmReckoning(false);
    await callReckoning();
  };

  const doForceGate = async () => {
    setConfirmForce(false);
    try {
      const r = await bridge.forceGate();
      audio.levelAscend();
      pushToast("success", `THE GATE IS FORCED — CHAPTER ${r.new_level}`,
        r.ascended_bosses.length > 0
          ? `${r.ascended_bosses.join(", ")} ascend${r.ascended_bosses.length === 1 ? "s" : ""} behind you: +35% HP and a sector curse until slain.`
          : `${r.new_level_title} begins.`);
      setOpenLevel(null); setOpenBossId(null);
      await refresh();
    } catch (e) {
      audio.declineThud();
      pushToast("error", "THE GATE HELD", String(e));
    }
  };

  const crumbs = (
    <div className="crumb-bar">
      <button className="crumb" onClick={() => { setOpenBossId(null); setOpenLevel(null); audio.uiTick(); }}>
        {t("camp.title")}
      </button>
      {openLevel !== null && (
        <>
          <ChevronRight size={12} style={{ color: "var(--text-faint)" }} />
          <button className="crumb" onClick={() => { setOpenBossId(null); audio.uiTick(); }}>
            {t("camp.chapter")} {openLevel}
          </button>
        </>
      )}
      {openBoss && (
        <>
          <ChevronRight size={12} style={{ color: "var(--text-faint)" }} />
          <span className="crumb crumb-here">{openBoss.name}</span>
        </>
      )}
    </div>
  );

  // ==== VIEW 3: one boss's chamber =========================================
  if (openBoss) {
    const b = openBoss;
    return (
      <div>
        {crumbs}
        <div className="panel" style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
          <div className={`portrait-frame big${b.defeated ? " gold" : ""}${woundClass(b.completion, b.defeated)}`}>
            <SpriteAnim sheet={bossSheet(b.sector, b.level)} height={110} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="page-heading" style={{ margin: 0 }}>
              <h1 style={{ fontSize: 22 }}>{b.name}</h1>
              <div className="sub" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <SectorTag sector={b.sector} />
                {b.ascended && <span className="ascended-mark">ASCENDED +35% HP</span>}
                {b.defeated && <span className="tag gold">DESTROYED</span>}
                <span>armor {b.armor.toFixed(0)}</span>
              </div>
            </div>
            <div className="boss-lore" style={{ fontSize: 14 }}>"{b.lore}"</div>
            <Gauge label={t("camp.vitality")} value={b.current_hp} max={b.total_hp} color="crimson"
              display={`${b.current_hp.toFixed(0)} / ${b.total_hp.toFixed(0)} ${t("word.hp")}`} />
            <Gauge label={t("camp.siege")} value={b.siege_dealt} max={b.siege_cap}
              color="steel" display={`${b.siege_dealt.toFixed(1)} / ${b.siege_cap.toFixed(0)}`} />
            {!b.defeated && (
              <div className="kv"><span className="k">{t("camp.projectedStrike")}</span>
                <span className="v gold-text mono-latin">{b.projected_strike.toFixed(1)}</span></div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">{t("camp.milestones")} — {b.name}</div>
          <div className="panel-sub">
            × {b.sector === "FINANCIAL" ? "1.5" : b.sector === "RESPONSIBILITY" ? "0.75" : "1.0"} {t("nd.sector")}
          </div>
          {b.milestones.length === 0 && (
            <div className="empty-slate">{t("camp.forgeMilestone")} · {t("camp.oracleDraft")}</div>
          )}
          {b.milestones.map((m) => (
            <div key={m.id} className="directive-row" style={{ opacity: m.completed ? 0.55 : 1 }}>
              <div className="directive-main">
                <div className="directive-name">
                  {m.description}
                  {m.req_stat && (
                    <span className={`tag ${m.stat_gate_open ? "green" : "crimson"}`}>
                      {m.req_stat} ≥ {m.req_value}
                    </span>
                  )}
                  {m.completed && <span className="tag gold">{t("word.sealed")}</span>}
                </div>
                <div className="directive-numbers" style={{ marginTop: 4 }}>
                  <span>{t("word.damage")} <b className="gold-text mono-latin">{m.damage_value}</b></span>
                  <span>{t("word.proof")} <b>{t(`vt.${m.proof_type}`)}</b></span>
                  {m.completed_at && <span className="faint mono-latin">{m.completed_at.slice(0, 10)}</span>}
                </div>
              </div>
              {!m.completed && !b.defeated && (
                <>
                  <button className="btn small" onClick={() => openMsEditor(m)} title={t("act.edit")}><PenLine /></button>
                  <button className="btn small danger" onClick={() => void removeMilestone(m)} title={t("act.delete")}><Trash2 /></button>
                  <button className="btn small primary" disabled={!m.stat_gate_open}
                    onClick={() => startMilestone(m)}>
                    <Swords /> {t("act.strike")}
                  </button>
                </>
              )}
            </div>
          ))}
          {!b.defeated && (
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn small" onClick={() => {
                setForgeFor(b); setMsDesc(""); setMsDamage(20); setMsProof("MANUAL"); setMsReqStat("");
              }}>
                <Hammer /> {t("camp.forgeMilestone")}
              </button>
              <button className="btn small primary" disabled={!snap.oracle_configured}
                onClick={() => setDraftFor(b)}>
                <Sparkles /> {t("camp.oracleDraft")}
              </button>
            </div>
          )}
        </div>

        {milestoneModals()}
        {draftFor && <OracleDraftModal boss={draftFor} onClose={() => setDraftFor(null)} />}
      </div>
    );
  }

  // ==== VIEW 2: one chapter's war room =====================================
  if (openLevel !== null) {
    const levelInfo = snap.levels.find((l) => l.level === openLevel)!;
    const isCurrent = openLevel === currentLevel;
    const bosses = isCurrent ? snap.bosses : [];
    return (
      <div>
        {crumbs}
        <div className="page-heading">
          <h1>{t("camp.chapter")} {openLevel}: {t(`ch.${openLevel}.t`)}</h1>
          <div className="sub">{t(`ch.${openLevel}.d`)}</div>
        </div>

        {!isCurrent ? (
          <div className="panel empty-slate">
            {levelInfo.status === "CLEARED"
              ? "This chapter is history — its bosses are dust and its relics are yours."
              : "This chapter is sealed. Its bosses take form only when you arrive."}
          </div>
        ) : (
          <div className="cols-main-side">
            <div>
              {bosses.map((b) => (
                <div key={b.id} className={`boss-door${b.defeated ? " defeated" : ""}`}
                  onClick={() => { setOpenBossId(b.id); audio.uiOpen(); }}>
                  <div className={`portrait-frame${b.defeated ? " gold" : ""}${woundClass(b.completion, b.defeated)}`}>
                    <SpriteAnim sheet={bossSheet(b.sector, b.level)} height={70} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="boss-name" style={{ fontSize: 17, display: "flex", gap: 10, alignItems: "center" }}>
                      {b.name}
                      {b.ascended && <span className="ascended-mark">ASCENDED</span>}
                      {b.defeated && <span className="tag gold">DESTROYED</span>}
                    </div>
                    <div className="directive-numbers" style={{ margin: "6px 0" }}>
                      <SectorTag sector={b.sector} />
                      <span>{b.milestones.filter((m) => m.completed).length}/{b.milestones.length} vows sealed</span>
                      {!b.defeated && <span>strike <b className="gold-text">{b.projected_strike.toFixed(1)}</b></span>}
                    </div>
                    <div className="hp-track">
                      <div className="hp-fill" style={{ width: `${(b.current_hp / b.total_hp) * 100}%` }} />
                    </div>
                  </div>
                  <ChevronRight style={{ color: "var(--text-faint)" }} />
                </div>
              ))}
            </div>

            <div>
              <div className="panel">
                <div className="panel-title">{t("camp.theGate")}</div>
                <div className="panel-sub">{t("camp.gateSub")}</div>
                <Gauge label="Global weighted progress" value={gate.global_progress * 100} max={100}
                  color={gate.global_ok ? "green" : "gold"} markerAt={80}
                  display={`${(gate.global_progress * 100).toFixed(0)}%`} />
                {gate.sector_progress.map((s) => (
                  <Gauge key={s.sector} label={`${s.sector}${s.cursed ? " · CURSED" : ""}`}
                    value={s.progress * 100} max={100} color={s.ok ? "green" : "crimson"} markerAt={50}
                    display={`${(s.progress * 100).toFixed(0)}%`} />
                ))}

                <button className="btn danger big" style={{ width: "100%", marginTop: 14 }}
                  disabled={!gate.reckoning_ready}
                  onClick={() => settings.confirm_destructive === "false" ? void reckon() : setConfirmReckoning(true)}>
                  <Skull /> {t("camp.callReckoning")}
                </button>
                <div className="hint">
                  {gate.reckoning_ready
                    ? "The blade is forged and the arm is rested. One strike against every living boss."
                    : snap.weapon.sharpness < gate.reckoning_min_sharpness
                      ? `Demands sharpness ≥ ${gate.reckoning_min_sharpness.toFixed(0)} (you hold ${snap.weapon.sharpness.toFixed(1)}). Verify more windows.`
                      : `The arm rests ${gate.reckoning_cooldown_left} more day(s).`}
                </div>

                {gate.forceable && (
                  <>
                    <button className="btn big" style={{ width: "100%", marginTop: 12, borderColor: "var(--gold-dim)" }}
                      onClick={() => setConfirmForce(true)}>
                      <DoorOpen /> {t("camp.forceGate")}
                    </button>
                    <div className="hint" style={{ color: "var(--crimson)" }}>
                      Thresholds met. You MAY advance now — every survivor follows you at +35% HP and
                      curses its sector until slain. Clean kills are cheaper.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {confirmReckoning && (
          <Modal title="Call the Reckoning?" sub="permanent — the blade strikes every living boss once"
            onClose={() => setConfirmReckoning(false)}>
            <div className="law-prose">
              The blade pays 10 durability. Any survivor blunts the edge (sharpness ×0.70). If the last boss
              falls, the chapter ends cleanly. Seven days must pass before the next call.
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmReckoning(false)}>Not yet</button>
              <button className="btn danger" onClick={() => void reckon()}><Skull /> I call it</button>
            </div>
          </Modal>
        )}
        {confirmForce && (
          <Modal title="Force the Gate?" sub="advance now — and pay the Ascended Debt"
            onClose={() => setConfirmForce(false)}>
            <div className="law-prose">
              Every living boss ascends behind you: +35% total HP, and a +20% stamina curse on its entire
              sector until you finally kill it. The debt compounds across chapters. Are you certain the speed
              is worth the weight?
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmForce(false)}>I will finish the kill</button>
              <button className="btn danger" onClick={() => void doForceGate()}><DoorOpen /> Force it — I accept the debt</button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ==== VIEW 1: the Ladder ==================================================
  return (
    <div>
      <div className="page-heading">
        <h1>{t("camp.title")}</h1>
        <div className="sub">{t("camp.sub")}</div>
      </div>
      {snap.levels.map((l) => {
        const sealed = l.status === "SEALED";
        const current = l.status === "CURRENT";
        return (
          <div key={l.level}
            className={`chapter-card${sealed ? " sealed" : ""}${current ? " current" : ""}`}
            onClick={() => { if (!sealed) { setOpenLevel(l.level); audio.uiOpen(); } }}>
            <div className="chapter-num mono-latin">{String(l.level).padStart(2, "0")}</div>
            <div style={{ flex: 1 }}>
              <div className="chapter-title">{t(`ch.${l.level}.t`)}</div>
              <div className="chapter-theme">{t(`ch.${l.level}.d`)}</div>
              {current && (
                <div style={{ marginTop: 10, maxWidth: 420 }}>
                  <Gauge label={t("camp.gateProgress")} value={gate.global_progress * 100} max={100}
                    color={gate.global_ok ? "green" : "gold"} markerAt={80}
                    display={`${(gate.global_progress * 100).toFixed(0)}%`} />
                </div>
              )}
            </div>
            <span className={`tag ${current ? "gold" : l.status === "CLEARED" ? "green" : "neutral"}`}>
              {t(`camp.status.${l.status.toLowerCase()}`)}
            </span>
            {!sealed && <ChevronRight style={{ color: "var(--text-faint)" }} />}
          </div>
        );
      })}
    </div>
  );

  // ---- milestone forge/edit + proof modals (shared) ------------------------
  function milestoneModals() {
    return (
      <>
        {proofFor && (
          <Modal title="Milestone Evidence" sub={proofFor.description} onClose={() => setProofFor(null)}>
            <ProofField verification={proofFor.proof_type} value={proofPath} onChange={setProofPath} />
            <div className="modal-actions">
              <button className="btn" onClick={() => setProofFor(null)}>Withdraw</button>
              <button className="btn primary" disabled={busy || !proofPath} onClick={() => void submitProof()}>
                Submit & Strike
              </button>
            </div>
          </Modal>
        )}
        {(forgeFor || editingMs) && (
          <Modal
            title={editingMs ? "Revise Milestone" : `Forge Milestone — ${forgeFor?.name}`}
            sub={editingMs ? "unsealed vows can be rewritten" : "a new vow with fixed damage equity"}
            onClose={() => { setForgeFor(null); setEditingMs(null); }}>
            <label className="field">
              <span className="field-label">Description</span>
              <input type="text" value={msDesc} onChange={(e) => setMsDesc(e.target.value)}
                placeholder="A concrete, provable outcome…" autoFocus />
            </label>
            <div className="grid grid-2">
              <label className="field">
                <span className="field-label">Damage Equity (5–100)</span>
                <input type="number" min={5} max={100} value={msDamage}
                  onChange={(e) => setMsDamage(parseInt(e.target.value || "5", 10))} />
              </label>
              <label className="field">
                <span className="field-label">Required Proof</span>
                <select value={msProof} onChange={(e) => setMsProof(e.target.value as VerificationType)}>
                  <option value="MANUAL">MANUAL</option>
                  <option value="IMAGE">IMAGE</option>
                  <option value="FILE">FILE</option>
                </select>
              </label>
            </div>
            <div className="grid grid-2">
              <label className="field">
                <span className="field-label">Stat Gate (optional)</span>
                <select value={msReqStat} onChange={(e) => setMsReqStat(e.target.value)}>
                  <option value="">— none —</option>
                  <option value="STR">STR — Strength</option>
                  <option value="INT">INT — Intelligence</option>
                  <option value="CHA">CHA — Charisma</option>
                  <option value="WIL">WIL — Willpower</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Required Value (11–40)</span>
                <input type="number" min={11} max={40} value={msReqValue} disabled={!msReqStat}
                  onChange={(e) => setMsReqValue(parseInt(e.target.value || "11", 10))} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setForgeFor(null); setEditingMs(null); }}>Cancel</button>
              <button className="btn primary" disabled={busy || msDesc.trim().length === 0}
                onClick={() => void saveMilestone()}>
                {editingMs ? "Seal Revision" : "Forge"}
              </button>
            </div>
          </Modal>
        )}
      </>
    );
  }
}
