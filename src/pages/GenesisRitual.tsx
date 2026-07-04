/**
 * The Genesis Ritual — a compulsory, full-dark founding ceremony that solves
 * the cold-start problem: qualitative words become deterministic SQLite state.
 * Fully offline-capable; the Oracle's voice here is the canonical static text.
 */
import React, { useMemo, useState } from "react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import type {
  GenesisMilestonePayload, NewHabitPayload, Sector, VerificationType, WeightClass,
} from "../types/contracts";
import { SECTOR_LABEL } from "../types/contracts";

const STEPS = ["The Awakening", "The Confession", "The First Directives", "The Milestone Vows", "The Sealing"] as const;

const DEFAULT_HABITS: NewHabitPayload[] = [
  {
    name: "Finance Strategy & Ledger Build",
    description: "Build updated ledger and cashflow model.",
    sector: "FINANCIAL", weight: "HEROIC", verification: "MANUAL",
    frequency_hours: 24, window_start_hour: 8, window_end_hour: 11, sworn_boss_id: null,
  },
  {
    name: "High-Intensity Tactical Conditioning",
    description: "Performance interval block + mobility.",
    sector: "PHYSICAL", weight: "STANDARD", verification: "MANUAL",
    frequency_hours: 24, window_start_hour: 12, window_end_hour: 14, sworn_boss_id: null,
  },
  {
    name: "Deep Core Book Domain Reading",
    description: "Read and extract core domain models.",
    sector: "INTELLECTUAL", weight: "STANDARD", verification: "MANUAL",
    frequency_hours: 24, window_start_hour: 19, window_end_hour: 21, sworn_boss_id: null,
  },
];

const DEFAULT_MILESTONES: GenesisMilestonePayload[] = [
  { sector: "FINANCIAL", description: "Optimize technical resume for modern automation paradigms", damage_value: 20, proof_type: "FILE" },
  { sector: "FINANCIAL", description: "Execute 20 verified external transactional applications", damage_value: 30, proof_type: "IMAGE" },
  { sector: "FINANCIAL", description: "Confirm first verified external retainer or ledger entry", damage_value: 50, proof_type: "FILE" },
  { sector: "INTELLECTUAL", description: "Complete deep analytical core book extraction mapping", damage_value: 25, proof_type: "FILE" },
  { sector: "PHYSICAL", description: "Complete 30 validated high-intensity workout units", damage_value: 50, proof_type: "IMAGE" },
];

const WEIGHTS: WeightClass[] = ["TRIVIAL", "STANDARD", "HEROIC", "MYTHIC"];
const SECTORS: Sector[] = ["FINANCIAL", "INTELLECTUAL", "PHYSICAL", "RESPONSIBILITY"];
const PROOFS: VerificationType[] = ["MANUAL", "IMAGE", "FILE"];

export function GenesisRitual() {
  const { refresh, pushToast } = useSystem();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [oath, setOath] = useState("");
  const [environment, setEnvironment] = useState("");
  const [threats, setThreats] = useState("");
  const [habits, setHabits] = useState<NewHabitPayload[]>(DEFAULT_HABITS);
  const [milestones, setMilestones] = useState<GenesisMilestonePayload[]>(DEFAULT_MILESTONES);
  const [busy, setBusy] = useState(false);

  const canNext = useMemo(() => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 2) return habits.length >= 1 && habits.every((h) => h.name.trim().length > 0);
    if (step === 3) return milestones.every((m) => m.description.trim().length > 0);
    return true;
  }, [step, name, habits, milestones]);

  const seal = async () => {
    setBusy(true);
    try {
      await bridge.completeGenesis({
        name: name.trim(),
        oath: oath.trim(),
        environment_text: environment.trim(),
        threats_text: threats.trim(),
        habits,
        milestones,
      });
      audio.levelAscend();
      await refresh();
    } catch (e) {
      audio.declineThud();
      pushToast("error", "THE RITUAL FALTERED", String(e));
      setBusy(false);
    }
  };

  const patchHabit = (i: number, patch: Partial<NewHabitPayload>) =>
    setHabits((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const patchMilestone = (i: number, patch: Partial<GenesisMilestonePayload>) =>
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="genesis-veil">
      <div className="genesis-frame">
        <h1 className="genesis-title">The Genesis Ritual</h1>
        <div className="genesis-sub">The world does not exist until you speak it into the ledger</div>
        <div className="genesis-step-rail">
          {STEPS.map((_, i) => (
            <div key={i} className={`genesis-step-dot${i === step ? " active" : i < step ? " done" : ""}`} />
          ))}
        </div>

        <div className="panel" style={{ padding: "26px 30px" }}>
          <div className="panel-title">{STEPS[step]}</div>

          {step === 0 && (
            <div>
              <div className="oracle-quote">
                "Listen to me closely. You are 19, sitting in a stagnant environment, listening to the logical
                loops your brain constructs to justify staying hidden inside your comfort zone. This chapter is
                called Leaving the Cave because you are currently blind to your own execution capacity."
                <div className="mono faint" style={{ marginTop: 8, fontSize: 10, fontStyle: "normal", letterSpacing: 2 }}>
                  — THE ORACLE, YOUR 30-YEAR-OLD SELF
                </div>
              </div>
              <label className="field">
                <span className="field-label">The name the world will know you by</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Your operator name" autoFocus />
              </label>
              <label className="field">
                <span className="field-label">Your oath (one sentence you will be held to)</span>
                <input type="text" value={oath} onChange={(e) => setOath(e.target.value)}
                  placeholder="e.g. I will leave this cave before it becomes a grave." />
              </label>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="oracle-quote">
                "Name the terrain and name the enemy. The engine cannot fight what you refuse to write down."
              </div>
              <label className="field">
                <span className="field-label">Describe your current environment, honestly</span>
                <textarea value={environment} onChange={(e) => setEnvironment(e.target.value)}
                  placeholder="The city, the university, the room, the money, the noise..." />
              </label>
              <label className="field">
                <span className="field-label">Name your primary threats — the patterns that eat your days</span>
                <textarea value={threats} onChange={(e) => setThreats(e.target.value)}
                  placeholder="Inertia, rationalization loops, cheap dopamine, isolation..." />
              </label>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="hint" style={{ marginBottom: 14 }}>
                These are your daily war engines. Weights map plain words to hard multipliers:
                Trivial ×0.5 · Standard ×1.0 · Heroic ×1.5 · Mythic ×2.0. Edit freely — between 1 and 12.
              </div>
              {habits.map((h, i) => (
                <div key={i} className="boss-card">
                  <div style={{ display: "flex", gap: 10 }}>
                    <input type="text" value={h.name} style={{ flex: 2 }}
                      onChange={(e) => patchHabit(i, { name: e.target.value })} placeholder="Directive name" />
                    <select value={h.sector} style={{ flex: 1 }}
                      onChange={(e) => patchHabit(i, { sector: e.target.value as Sector })}>
                      {SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABEL[s]}</option>)}
                    </select>
                    <select value={h.weight} style={{ flex: 1 }}
                      onChange={(e) => patchHabit(i, { weight: e.target.value as WeightClass })}>
                      {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                    <select value={h.verification} style={{ flex: 1 }}
                      onChange={(e) => patchHabit(i, { verification: e.target.value as VerificationType })}>
                      {PROOFS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button className="btn small danger" onClick={() => setHabits((hs) => hs.filter((_, j) => j !== i))}>✕</button>
                  </div>
                </div>
              ))}
              {habits.length < 12 && (
                <button className="btn" onClick={() =>
                  setHabits((hs) => [...hs, {
                    name: "", description: "", sector: "RESPONSIBILITY", weight: "STANDARD",
                    verification: "MANUAL", frequency_hours: 24, window_start_hour: null, window_end_hour: null,
                    sworn_boss_id: null,
                  }])
                }>
                  + Add Directive
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="hint" style={{ marginBottom: 14 }}>
                Milestones are the only direct damage against the three bosses of Chapter 1 — Malachai's Ledger
                (Financial), The Cognitive Fog (Intellectual), The Inertia Overlord (Physical). Daily directives
                never strike; they forge the blade for the Reckoning.
              </div>
              {milestones.map((m, i) => (
                <div key={i} className="boss-card">
                  <div style={{ display: "flex", gap: 10 }}>
                    <input type="text" value={m.description} style={{ flex: 3 }}
                      onChange={(e) => patchMilestone(i, { description: e.target.value })} />
                    <select value={m.sector} style={{ flex: 1 }}
                      onChange={(e) => patchMilestone(i, { sector: e.target.value as Sector })}>
                      {(["FINANCIAL", "INTELLECTUAL", "PHYSICAL"] as Sector[]).map((s) => (
                        <option key={s} value={s}>{SECTOR_LABEL[s]}</option>
                      ))}
                    </select>
                    <input type="number" min={5} max={100} value={m.damage_value} style={{ width: 76 }}
                      onChange={(e) => patchMilestone(i, { damage_value: parseInt(e.target.value || "5", 10) })} />
                    <select value={m.proof_type} style={{ flex: 1 }}
                      onChange={(e) => patchMilestone(i, { proof_type: e.target.value as VerificationType })}>
                      {PROOFS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button className="btn small danger" onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}>✕</button>
                  </div>
                </div>
              ))}
              <button className="btn" onClick={() =>
                setMilestones((ms) => [...ms, { sector: "FINANCIAL", description: "", damage_value: 20, proof_type: "MANUAL" }])
              }>
                + Add Milestone Vow
              </button>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="oracle-quote">
                "You chose the hybrid path because you recognized that life demands tactical adaptability.
                But adaptability is not an invite to compromise. The engine will track your shortcuts. Leaving a
                task behind to optimize another isn't a victory — it's a high-interest debt you will pay with
                added friction in the next level. Pave the financial frontline first; it carries the heavy
                weight. Build the base or watch the world decay."
              </div>
              <div className="kv"><span className="k">Operator</span><span className="v">{name || "—"}</span></div>
              <div className="kv"><span className="k">Oath</span><span className="v" style={{ maxWidth: 380, textAlign: "right" }}>{oath || "—"}</span></div>
              <div className="kv"><span className="k">Directives</span><span className="v">{habits.length}</span></div>
              <div className="kv"><span className="k">Milestone Vows</span><span className="v">{milestones.length}</span></div>
              <div className="kv"><span className="k">Chapter</span><span className="v">1 — LEAVING THE CAVE</span></div>
              <div className="kv"><span className="k">Gate Law</span><span className="v">≥80% GLOBAL · ≥50% PER SECTOR · DAY 90–120</span></div>
              <div className="hint" style={{ marginTop: 12 }}>
                When you seal the ritual, the campaign clock starts and the night algorithm begins keeping books.
                There is no reset button — only the forge.
              </div>
            </div>
          )}

          <div className="modal-actions">
            {step > 0 && <button className="btn" onClick={() => setStep((s) => s - 1)}>Back</button>}
            {step < STEPS.length - 1 ? (
              <button className="btn primary" disabled={!canNext} onClick={() => { audio.uiTick(); setStep((s) => s + 1); }}>
                Continue
              </button>
            ) : (
              <button className="btn primary big" disabled={busy} onClick={seal}>
                Seal the Genesis — Begin
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
