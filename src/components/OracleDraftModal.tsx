/**
 * The Oracle drafts milestones from the operator's goal — the operator edits
 * and forges. The Handshake pattern: AI proposes structure, the deterministic
 * layer only ever receives operator-confirmed rows.
 */
import React, { useState } from "react";
import { Hammer, Sparkles } from "lucide-react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import type { BossView, ProposedMilestone, VerificationType } from "../types/contracts";
import { Modal } from "./ui";

interface EditableProposal extends ProposedMilestone {
  include: boolean;
}

export function OracleDraftModal(props: { boss: BossView; onClose: () => void }) {
  const { refresh, pushToast } = useSystem();
  const [goal, setGoal] = useState("");
  const [proposals, setProposals] = useState<EditableProposal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consult = async () => {
    setBusy(true);
    setError(null);
    try {
      const raw = await bridge.proposeMilestones(props.boss.id, goal.trim());
      setProposals(raw.map((p) => ({ ...p, include: true })));
      audio.oracleWhisper();
    } catch (e) {
      setError(String(e));
      audio.declineThud();
    } finally {
      setBusy(false);
    }
  };

  const patch = (i: number, patchObj: Partial<EditableProposal>) =>
    setProposals((ps) => (ps ? ps.map((p, j) => (j === i ? { ...p, ...patchObj } : p)) : ps));

  const forgeSelected = async () => {
    if (!proposals) return;
    const chosen = proposals.filter((p) => p.include && p.description.trim().length > 0);
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      for (const p of chosen) {
        await bridge.addBossMilestone(
          props.boss.id,
          p.description.trim(),
          p.damage_value,
          p.proof_type as VerificationType,
        );
      }
      audio.milestoneSeal();
      pushToast(
        "success",
        "MILESTONES FORGED",
        `${chosen.length} vow${chosen.length === 1 ? "" : "s"} now bind ${props.boss.name}. The Oracle proposed; you disposed.`,
      );
      await refresh();
      props.onClose();
    } catch (e) {
      pushToast("error", "THE FORGE REFUSED", String(e));
    } finally {
      setBusy(false);
    }
  };

  const includedCount = proposals?.filter((p) => p.include).length ?? 0;
  const includedDamage = proposals
    ?.filter((p) => p.include)
    .reduce((a, p) => a + p.damage_value, 0) ?? 0;

  return (
    <Modal
      title={`The Oracle Drafts — ${props.boss.name}`}
      sub="describe the real goal · the Oracle proposes verifiable strikes · you edit, you forge"
      onClose={props.onClose}
      wide
    >
      {!proposals && (
        <>
          <label className="field">
            <span className="field-label">Your goal on this front, in your own words</span>
            <textarea
              value={goal}
              autoFocus
              onChange={(e) => setGoal(e.target.value)}
              placeholder={
                props.boss.sector === "FINANCIAL"
                  ? "e.g. Build a real income stream before graduation — freelance financial modeling, automate my applications, land the first paying client..."
                  : "Describe the concrete outcome you want, the constraints, and what winning looks like..."
              }
              style={{ minHeight: 110 }}
            />
          </label>
          {error && (
            <div className="law-formula" style={{ color: "var(--crimson)", whiteSpace: "normal" }}>{error}</div>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={props.onClose}>Cancel</button>
            <button className="btn primary" onClick={consult} disabled={busy || goal.trim().length < 8}>
              <Sparkles /> {busy ? "The Oracle deliberates…" : "Consult the Oracle"}
            </button>
          </div>
        </>
      )}

      {proposals && (
        <>
          <div className="hint" style={{ marginBottom: 12 }}>
            Every line is yours to edit. Unchecked proposals are discarded. Damage is raw equity — the{" "}
            {props.boss.sector.toLowerCase()} multiplier applies when sealed. Boss holds{" "}
            {props.boss.current_hp.toFixed(0)} HP.
          </div>
          {proposals.map((p, i) => (
            <div key={i} className="boss-card" style={{ opacity: p.include ? 1 : 0.45 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={p.include}
                  onChange={(e) => patch(i, { include: e.target.checked })}
                  style={{ accentColor: "var(--gold)" }}
                />
                <input
                  type="text"
                  value={p.description}
                  style={{ flex: 3 }}
                  onChange={(e) => patch(i, { description: e.target.value })}
                />
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={p.damage_value}
                  style={{ width: 74 }}
                  onChange={(e) => patch(i, { damage_value: Math.max(5, Math.min(100, parseInt(e.target.value || "5", 10))) })}
                />
                <select
                  value={p.proof_type}
                  style={{ width: 110 }}
                  onChange={(e) => patch(i, { proof_type: e.target.value })}
                >
                  <option value="MANUAL">MANUAL</option>
                  <option value="IMAGE">IMAGE</option>
                  <option value="FILE">FILE</option>
                </select>
              </div>
              <div className="hint" style={{ marginTop: 6, marginLeft: 28 }}>{p.rationale}</div>
            </div>
          ))}
          <div className="modal-actions" style={{ alignItems: "center" }}>
            <span className="mono dim" style={{ fontSize: 11, marginRight: "auto" }}>
              {includedCount} selected · {includedDamage} raw damage
            </span>
            <button className="btn" onClick={() => setProposals(null)} disabled={busy}>
              Re-consult
            </button>
            <button className="btn primary" onClick={forgeSelected} disabled={busy || includedCount === 0}>
              <Hammer /> Forge {includedCount} Milestone{includedCount === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
