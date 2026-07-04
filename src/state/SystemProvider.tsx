/**
 * Snapshot store: one read-model from the Rust engine, refreshed after every
 * command, on window focus, and once a minute (to catch midnight closes).
 * The frontend never mutates game state directly — it invokes and re-reads.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import type {
  ExecutionReport, MilestoneReport, ReckoningReport, SystemSnapshot,
} from "../types/contracts";

export interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  head: string;
  body: string;
}

interface SystemCtx {
  snap: SystemSnapshot | null;
  loading: boolean;
  fatal: string | null;
  settings: Record<string, string>;
  refresh: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  toasts: Toast[];
  pushToast: (kind: Toast["kind"], head: string, body: string) => void;
  dismissToast: (id: number) => void;
  executeHabit: (habitId: number, proofPath?: string | null, note?: string | null) => Promise<ExecutionReport | null>;
  completeMilestone: (milestoneId: number, proofPath?: string | null) => Promise<MilestoneReport | null>;
  callReckoning: () => Promise<ReckoningReport | null>;
  lastReckoning: ReckoningReport | null;
  clearReckoning: () => void;
}

const Ctx = createContext<SystemCtx | null>(null);

export function useSystem(): SystemCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSystem outside provider");
  return v;
}

let toastSeq = 1;

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<SystemSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastReckoning, setLastReckoning] = useState<ReckoningReport | null>(null);
  const snapRef = useRef<SystemSnapshot | null>(null);

  const pushToast = useCallback((kind: Toast["kind"], head: string, body: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-4), { id, kind, head, body }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await bridge.getSystemSnapshot();
      snapRef.current = s;
      setSnap(s);
      setFatal(null);
      audio.applyLaw(s.audio.pitch_multiplier, s.audio.lowpass_cutoff, s.audio.degradation);
    } catch (e) {
      // Iron rule: no mock data. If the engine is unreachable, fail visibly.
      setFatal(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadSettings = useCallback(async () => {
    try {
      const s = await bridge.getSettings();
      setSettings(s);
      audio.setVolumes(
        parseFloat(s.master_volume ?? "0.85"),
        parseFloat(s.sfx_volume ?? "0.9"),
        parseFloat(s.music_volume ?? "0.6"),
      );
      document.body.classList.toggle("reduced-motion", s.reduced_motion === "true");
    } catch {
      /* settings are cosmetic; the snapshot error path covers real failures */
    }
  }, []);

  useEffect(() => {
    void refresh();
    void reloadSettings();
    const iv = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const onGesture = () => audio.resume();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [refresh, reloadSettings]);

  const executeHabit = useCallback(
    async (habitId: number, proofPath?: string | null, note?: string | null) => {
      try {
        const report = await bridge.executeHabit(habitId, proofPath, note);
        if (report.siege_boss_defeated) audio.bossDown();
        else audio.anvilStrike();
        pushToast(
          "success",
          report.siege_boss_defeated ? "THE SIEGE BREAKS THE BOSS" : "EXECUTION VERIFIED",
          `${report.habit_name}: momentum ${report.momentum_before.toFixed(2)} → ${report.momentum_after.toFixed(2)}, sharpness ${report.sharpness_before.toFixed(1)} → ${report.sharpness_after.toFixed(1)}${report.siege_damage > 0 ? ` — siege −${report.siege_damage.toFixed(2)} HP vs ${report.siege_boss_name}` : ""}${report.overdraft ? " — OVERDRAFT" : ""}${report.off_window ? " — OFF-WINDOW" : ""}`,
        );
        await refresh();
        return report;
      } catch (e) {
        audio.declineThud();
        pushToast("error", "EXECUTION REFUSED", String(e));
        return null;
      }
    },
    [pushToast, refresh],
  );

  const completeMilestone = useCallback(
    async (milestoneId: number, proofPath?: string | null) => {
      try {
        const report = await bridge.completeMilestone(milestoneId, proofPath);
        if (report.boss_defeated) audio.bossDown();
        else audio.milestoneSeal();
        pushToast(
          "success",
          report.boss_defeated ? "BOSS DESTROYED" : "MILESTONE SEALED",
          report.boss_defeated
            ? `${report.boss_name} has fallen.${report.equipment_unlocked ? ` Equipment manifested: ${report.equipment_unlocked}.` : ""}`
            : `${report.damage_dealt.toFixed(0)} damage to ${report.boss_name} — ${report.boss_hp_after.toFixed(0)} HP remains.`,
        );
        await refresh();
        return report;
      } catch (e) {
        audio.declineThud();
        pushToast("error", "MILESTONE REFUSED", String(e));
        return null;
      }
    },
    [pushToast, refresh],
  );

  const callReckoning = useCallback(async () => {
    try {
      audio.reckoningDrums();
      const report = await bridge.callReckoning();
      setLastReckoning(report);
      if (report.level_advanced) audio.levelAscend();
      await refresh();
      return report;
    } catch (e) {
      audio.declineThud();
      pushToast("error", "THE RECKONING REFUSED", String(e));
      return null;
    }
  }, [pushToast, refresh]);

  const clearReckoning = useCallback(() => setLastReckoning(null), []);

  const value = useMemo(
    () => ({
      snap, loading, fatal, settings, refresh, reloadSettings,
      toasts, pushToast, dismissToast,
      executeHabit, completeMilestone, callReckoning,
      lastReckoning, clearReckoning,
    }),
    [snap, loading, fatal, settings, refresh, reloadSettings, toasts, pushToast,
     dismissToast, executeHabit, completeMilestone, callReckoning, lastReckoning, clearReckoning],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
