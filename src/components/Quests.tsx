/**
 * Quests — one-shot goals. The philosophical opposite of a directive:
 * pure carrot, zero stick. Not everything in a life is a habit.
 */
import React, { useState } from "react";
import { Flag, Plus, Swords, X } from "lucide-react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import type { NewQuestPayload, QuestView, Sector, VerificationType, WeightClass } from "../types/contracts";
import { Modal, ProofField, SectorTag, WeightTag } from "./ui";

export function QuestsPanel() {
  const { snap, refresh, pushToast } = useSystem();
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [proofFor, setProofFor] = useState<QuestView | null>(null);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!snap) return null;
  const quests = snap.quests;

  const fulfill = async (q: QuestView, path: string | null) => {
    setBusy(true);
    try {
      const r = await bridge.completeQuest(q.id, path);
      audio.milestoneSeal();
      pushToast(
        "success",
        t("q.fulfilled"),
        `${r.title}: ${r.momentum_before.toFixed(2)} → ${r.momentum_after.toFixed(2)} · +${r.xp_banked.toFixed(0)} xp${r.late ? ` · ${t("q.late")}` : ""}`,
      );
      setProofFor(null);
      await refresh();
    } catch (e) {
      audio.declineThud();
      pushToast("error", "QUEST", String(e));
    } finally {
      setBusy(false);
    }
  };

  const startFulfill = (q: QuestView) => {
    if (q.verification === "MANUAL") void fulfill(q, null);
    else {
      setProofFor(q);
      setProofPath(null);
    }
  };

  const abandon = async (q: QuestView) => {
    try {
      await bridge.abandonQuest(q.id);
      audio.uiClose();
      await refresh();
    } catch (e) {
      pushToast("error", "QUEST", String(e));
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">
        <Flag size={15} /> {t("q.title")}
        <button className="btn small" style={{ marginInlineStart: "auto" }}
          onClick={() => { audio.uiOpen(); setCreating(true); }}>
          <Plus /> {t("q.new")}
        </button>
      </div>
      <div className="panel-sub">{t("q.sub")}</div>

      {quests.length === 0 && <div className="empty-slate">{t("q.none")}</div>}
      {quests.map((q) => (
        <div key={q.id} className="directive-row" style={{ borderColor: q.overdue ? "var(--crimson-deep)" : undefined }}>
          <div className="directive-main">
            <div className="directive-name">
              {q.title}
              <SectorTag sector={q.sector} />
              <WeightTag weight={q.weight} />
              {q.overdue && <span className="tag crimson">{t("q.overdue")}</span>}
            </div>
            {q.description && <div className="directive-desc">{q.description}</div>}
            <div className="directive-numbers" style={{ marginTop: 5 }}>
              <span>{t("q.reward")} <b className="mono-latin">+{q.momentum_reward.toFixed(2)} M · {q.xp_reward.toFixed(0)} xp</b></span>
              {q.deadline_day && <span className="mono-latin">→ {q.deadline_day}</span>}
              <span>{t("word.proof")} <b>{t(`vt.${q.verification}`)}</b></span>
            </div>
          </div>
          <button className="btn small danger" title={t("q.abandon")} onClick={() => void abandon(q)}>
            <X />
          </button>
          <button className="btn small primary" onClick={() => startFulfill(q)}>
            <Swords /> {t("q.fulfill")}
          </button>
        </div>
      ))}

      {creating && <NewQuestModal onClose={() => setCreating(false)} />}

      {proofFor && (
        <Modal title={proofFor.title} sub={t(`vt.${proofFor.verification}`)} onClose={() => setProofFor(null)}>
          <ProofField verification={proofFor.verification} value={proofPath} onChange={setProofPath} />
          <div className="modal-actions">
            <button className="btn" onClick={() => setProofFor(null)}>{t("act.cancel")}</button>
            <button className="btn primary" disabled={busy || !proofPath}
              onClick={() => void fulfill(proofFor, proofPath)}>
              {t("q.fulfill")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewQuestModal({ onClose }: { onClose: () => void }) {
  const { refresh, pushToast } = useSystem();
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState<Sector>("FINANCIAL");
  const [weight, setWeight] = useState<WeightClass>("HEROIC");
  const [verification, setVerification] = useState<VerificationType>("MANUAL");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const payload: NewQuestPayload = {
        title: title.trim(),
        description: description.trim(),
        sector,
        weight,
        verification,
        deadline_day: deadline || null,
      };
      await bridge.createQuest(payload);
      audio.uiOpen();
      await refresh();
      onClose();
    } catch (e) {
      audio.declineThud();
      pushToast("error", "QUEST", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("q.new")} onClose={onClose}>
      <label className="field">
        <span className="field-label">{t("q.name")}</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <div className="grid grid-2">
        <label className="field">
          <span className="field-label">{t("nd.sector")}</span>
          <select value={sector} onChange={(e) => setSector(e.target.value as Sector)}>
            <option value="FINANCIAL">{t("sec.FINANCIAL")}</option>
            <option value="INTELLECTUAL">{t("sec.INTELLECTUAL")}</option>
            <option value="PHYSICAL">{t("sec.PHYSICAL")}</option>
            <option value="RESPONSIBILITY">{t("sec.RESPONSIBILITY")}</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t("nd.weightClass")}</span>
          <select value={weight} onChange={(e) => setWeight(e.target.value as WeightClass)}>
            <option value="TRIVIAL">{t("wt.TRIVIAL")}</option>
            <option value="STANDARD">{t("wt.STANDARD")}</option>
            <option value="HEROIC">{t("wt.HEROIC")}</option>
            <option value="MYTHIC">{t("wt.MYTHIC")}</option>
          </select>
        </label>
      </div>
      <div className="grid grid-2">
        <label className="field">
          <span className="field-label">{t("nd.verifyMode")}</span>
          <select value={verification} onChange={(e) => setVerification(e.target.value as VerificationType)}>
            <option value="MANUAL">{t("vt.MANUAL")}</option>
            <option value="IMAGE">{t("vt.IMAGE")}</option>
            <option value="FILE">{t("vt.FILE")}</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t("q.deadline")}</span>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mono-latin" />
        </label>
      </div>
      <div className="hint">{t("q.deadlineHint")}</div>
      <label className="field" style={{ marginTop: 10 }}>
        <span className="field-label">{t("nd.descOpt")}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t("act.cancel")}</button>
        <button className="btn primary" disabled={busy || title.trim().length === 0} onClick={submit}>
          {t("q.take")}
        </button>
      </div>
    </Modal>
  );
}
