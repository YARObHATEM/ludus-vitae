/** Forge a new directive (habit) — or edit an existing one. */
import React, { useState } from "react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import type { HabitView, NewHabitPayload, Sector, VerificationType, WeightClass } from "../types/contracts";
import { Modal } from "./ui";

const WEIGHTS: { key: WeightClass; meta: string }[] = [
  { key: "TRIVIAL", meta: "+0.02 · ×0.5" },
  { key: "STANDARD", meta: "+0.05 · ×1.0" },
  { key: "HEROIC", meta: "+0.10 · ×1.5" },
  { key: "MYTHIC", meta: "+0.20 · ×2.0" },
];

export function NewDirectiveModal(props: { onClose: () => void; edit?: HabitView }) {
  const { refresh, pushToast } = useSystem();
  const { t } = useI18n();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const e = props.edit;
  const [name, setName] = useState(e?.name ?? "");
  const [description, setDescription] = useState(e?.description ?? "");
  const [sector, setSector] = useState<Sector>(e?.sector ?? "FINANCIAL");
  const [weight, setWeight] = useState<WeightClass>(e?.weight ?? "STANDARD");
  const [verification, setVerification] = useState<VerificationType>(e?.verification ?? "MANUAL");
  const [freqDays, setFreqDays] = useState(e ? Math.max(1, Math.round(e.frequency_hours / 24)) : 1);
  const [winStart, setWinStart] = useState<string>(e?.window_start_hour?.toString() ?? "");
  const [winEnd, setWinEnd] = useState<string>(e?.window_end_hour?.toString() ?? "");
  const [swornBossId, setSwornBossId] = useState<number | null>(e?.sworn_boss_id ?? null);
  const [busy, setBusy] = useState(false);
  const { snap } = useSystem();
  const livingBosses = snap?.bosses.filter((b) => !b.defeated) ?? [];

  const submit = async () => {
    setBusy(true);
    try {
      const payload: NewHabitPayload = {
        name: name.trim(),
        description: description.trim(),
        sector,
        weight,
        verification,
        frequency_hours: freqDays * 24,
        window_start_hour: winStart === "" ? null : Math.max(0, Math.min(23, parseInt(winStart, 10))),
        window_end_hour: winEnd === "" ? null : Math.max(1, Math.min(24, parseInt(winEnd, 10))),
        sworn_boss_id: swornBossId,
      };
      if (e) {
        await bridge.editDirective({ ...payload, id: e.id });
        pushToast("success", "DIRECTIVE REVISED", `${payload.name} has been re-forged.`);
      } else {
        await bridge.createDirective(payload);
        pushToast("success", "DIRECTIVE FORGED", `${payload.name} enters the execution ledger.`);
      }
      audio.milestoneSeal();
      await refresh();
      props.onClose();
    } catch (err) {
      audio.declineThud();
      pushToast("error", "THE FORGE REFUSED", String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={e ? t("nd.revise") : t("nd.title")}
      onClose={props.onClose}
      wide
    >
      <label className="field">
        <span className="field-label">{t("nd.name")}</span>
        <input
          type="text"
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          autoFocus
        />
      </label>

      <div className="grid grid-2">
        <label className="field">
          <span className="field-label">{t("nd.sector")} {e && t("nd.sealedAfter")}</span>
          <select value={sector} disabled={!!e} onChange={(ev) => setSector(ev.target.value as Sector)}>
            <option value="FINANCIAL">{t("sec.FINANCIAL")}</option>
            <option value="INTELLECTUAL">{t("sec.INTELLECTUAL")}</option>
            <option value="PHYSICAL">{t("sec.PHYSICAL")}</option>
            <option value="RESPONSIBILITY">{t("sec.RESPONSIBILITY")}</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t("nd.verifyMode")}</span>
          <select value={verification} onChange={(ev) => setVerification(ev.target.value as VerificationType)}>
            <option value="MANUAL">{t("vt.MANUAL")}</option>
            <option value="IMAGE">{t("vt.IMAGE")}</option>
            <option value="FILE">{t("vt.FILE")}</option>
          </select>
        </label>
      </div>

      <span className="field-label">{t("nd.weightClass")}</span>
      <div className="choice-row" style={{ marginBottom: 16 }}>
        {WEIGHTS.map((w) => (
          <div
            key={w.key}
            className={`choice-card${weight === w.key ? " selected" : ""}`}
            onClick={() => { audio.uiTick(); setWeight(w.key); }}
          >
            <div className="choice-name">{t(`wt.${w.key}`)}</div>
            <div className="choice-meta mono-latin">{w.meta}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-3">
        <label className="field">
          <span className="field-label">{t("nd.freqDays")}</span>
          <input type="number" min={1} max={14} value={freqDays}
            onChange={(ev) => setFreqDays(Math.max(1, Math.min(14, parseInt(ev.target.value || "1", 10))))} />
        </label>
        <label className="field">
          <span className="field-label">{t("nd.winStart")}</span>
          <input type="number" min={0} max={23} value={winStart} placeholder="—"
            onChange={(ev) => setWinStart(ev.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t("nd.winEnd")}</span>
          <input type="number" min={1} max={24} value={winEnd} placeholder="—"
            onChange={(ev) => setWinEnd(ev.target.value)} />
        </label>
      </div>

      <label className="field" style={{ marginTop: 12 }}>
        <span className="field-label">{t("nd.swear")}</span>
        <select value={swornBossId ?? ""} onChange={(ev) => setSwornBossId(ev.target.value === "" ? null : parseInt(ev.target.value, 10))}>
          <option value="">{t("nd.unsworn")}</option>
          {livingBosses.map((b) => (
            <option key={b.id} value={b.id}>{b.name} — {b.current_hp.toFixed(0)} {t("word.hp")}</option>
          ))}
        </select>
      </label>

      <label className="field" style={{ marginTop: 12 }}>
        <span className="field-label">{t("nd.descOpt")}</span>
        <textarea value={description} onChange={(ev) => setDescription(ev.target.value)} />
      </label>

      <div className="modal-actions">
        <button className="btn" onClick={props.onClose}>{t("act.cancel")}</button>
        <button className="btn primary" onClick={submit} disabled={busy || name.trim().length === 0}>
          {e ? t("nd.sealRevision") : t("nd.create")}
        </button>
      </div>
    </Modal>
  );
}
