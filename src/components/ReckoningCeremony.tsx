/** The Reckoning resolution ceremony — the weapon meets the bosses. */
import React from "react";
import type { ReckoningReport } from "../types/contracts";
import { SectorTag } from "./ui";

export function ReckoningCeremony(props: { report: ReckoningReport; onClose: () => void }) {
  const r = props.report;
  return (
    <div className="reckoning-veil">
      <div className="modal wide" style={{ borderColor: r.level_advanced ? "var(--gold)" : "var(--crimson-deep)" }}>
        <h2 className="modal-title" style={{ color: r.level_advanced ? "var(--gold-bright)" : "var(--crimson)" }}>
          The Reckoning
        </h2>
        <div className="modal-sub">Deterministic combat: the forged weapon against the chapter's bosses</div>

        {r.strikes.length === 0 && (
          <div className="empty-slate">No boss stood to receive a strike — the field was already cleared.</div>
        )}
        {r.strikes.map((s, i) => (
          <div className="strike-row" key={s.boss_id} style={{ animationDelay: `${i * 260}ms` }}>
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="boss-name">{s.boss_name}</span>
                <SectorTag sector={s.sector} />
              </div>
              <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>
                {s.hp_before.toFixed(0)} HP → {s.hp_after.toFixed(0)} HP
                {s.defeated && <b className="gold-text"> — DESTROYED</b>}
              </div>
            </div>
            <div className="strike-dmg">−{s.strike_damage.toFixed(1)}</div>
          </div>
        ))}

        <div className="divider" />

        {r.level_advanced ? (
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: 3, color: "var(--gold-bright)", textAlign: "center", padding: "10px 0" }}>
            CLEAN CLEAR — CHAPTER {r.new_level}: {r.new_level_title.toUpperCase()} BEGINS, DEBT-FREE
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "8px 0", fontSize: 14 }}>
            {r.blunted
              ? "Survivors stand. The blade records a BLUNTED state (sharpness ×0.70) — forge it back, strike again in seven days, or finish them with milestones and sieges."
              : `The weapon returns to the whetstone. State: ${r.weapon_state_after}.`}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn primary big" onClick={props.onClose}>Continue</button>
        </div>
      </div>
    </div>
  );
}
