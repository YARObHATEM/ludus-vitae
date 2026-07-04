/** DOMAINS — the four life sectors and every directive that serves them. */
import React, { useState } from "react";
import { Archive, PenLine, RotateCcw } from "lucide-react";
import { bridge } from "../api/bridge";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { NewDirectiveModal } from "../components/NewDirectiveModal";
import { SectorTag, WeightTag } from "../components/ui";
import type { HabitView, Sector } from "../types/contracts";
import { SECTOR_LABEL } from "../types/contracts";

const SECTOR_ORDER: Sector[] = ["FINANCIAL", "INTELLECTUAL", "PHYSICAL", "RESPONSIBILITY"];
const SECTOR_BLURB_KEY: Record<Sector, string> = {
  FINANCIAL: "dom.finBlurb",
  INTELLECTUAL: "dom.intBlurb",
  PHYSICAL: "dom.phyBlurb",
  RESPONSIBILITY: "dom.respBlurb",
};

export function DomainsPage() {
  const { snap, pushToast, refresh } = useSystem();
  const { t } = useI18n();
  const [editing, setEditing] = useState<HabitView | null>(null);
  if (!snap) return null;

  const sectorLabel: Record<Sector, string> = {
    FINANCIAL: t("domains.financial"),
    INTELLECTUAL: t("domains.intellectual"),
    PHYSICAL: t("domains.physical"),
    RESPONSIBILITY: t("domains.responsibility"),
  };

  const setArchived = async (h: HabitView, archived: boolean) => {
    try {
      await bridge.archiveDirective(h.id, archived);
      pushToast("success", archived ? "DIRECTIVE ARCHIVED" : "DIRECTIVE RESTORED",
        `${h.name} ${archived ? "leaves" : "re-enters"} the active ledger.`);
      await refresh();
    } catch (e) {
      pushToast("error", "REFUSED", String(e));
    }
  };

  return (
    <div>
      <div className="page-heading">
        <h1>{t("nav.domains")}</h1>
        <div className="sub">{t("domains.sub")}</div>
      </div>

      {SECTOR_ORDER.map((sector) => {
        const habits = snap.habits.filter((h) => h.sector === sector);
        const active = habits.filter((h) => !h.is_archived);
        const archived = habits.filter((h) => h.is_archived);
        const cursed = snap.gate.sector_progress.find((s) => s.sector === sector)?.cursed ?? false;
        return (
          <div className="panel" key={sector}>
            <div className="panel-title">
              {sectorLabel[sector]}
              {cursed && <span className="tag crimson">ASCENDED CURSE ×1.20 STAMINA</span>}
            </div>
            <div className="panel-sub">{t(SECTOR_BLURB_KEY[sector])}</div>

            {active.length === 0 && <div className="empty-slate">{t("domains.noActive")}</div>}
            {active.map((h) => (
              <div key={h.id} className={`directive-row${h.rusted ? " rusted" : ""}`}>
                <div className="directive-main">
                  <div className="directive-name">
                    {h.name} <WeightTag weight={h.weight} />
                    <span className="tag neutral">{t(`vt.${h.verification}`)}</span>
                    {h.sworn_boss_name && <span className="tag gold">⚔ {h.sworn_boss_name}</span>}
                    {h.rusted && <span className="rust-chip mono-latin">⚠ ×{h.consecutive_misses}</span>}
                  </div>
                  {h.description && <div className="directive-desc">{h.description}</div>}
                  <div className="directive-numbers" style={{ marginTop: 5 }}>
                    <span>{t("dom.every")} <b className="mono-latin">{Math.max(1, Math.round(h.frequency_hours / 24))}{t("dom.days")}</b></span>
                    <span>{t("dom.costNow")} <b className="mono-latin">{h.activation_cost.toFixed(1)}</b></span>
                    <span>{t("word.streak")} <b className="mono-latin">{h.streak_days}{t("dom.days")}</b></span>
                    <span>{t("dom.lifetime")} <b className="mono-latin">{h.total_executions}</b></span>
                    <span>{t("dom.last")} <b className="mono-latin">{h.last_executed_day ?? t("dom.never")}</b></span>
                  </div>
                </div>
                <button className="btn small" onClick={() => setEditing(h)}><PenLine /> {t("act.edit")}</button>
                <button className="btn small danger" onClick={() => void setArchived(h, true)}><Archive /> {t("act.archive")}</button>
              </div>
            ))}
            {archived.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary className="dim" style={{ cursor: "pointer", fontSize: 12 }}>
                  {archived.length} {t("domains.archived")}
                </summary>
                {archived.map((h) => (
                  <div key={h.id} className="directive-row done">
                    <div className="directive-main">
                      <div className="directive-name">{h.name} <WeightTag weight={h.weight} /></div>
                    </div>
                    <button className="btn small" onClick={() => void setArchived(h, false)}>
                      <RotateCcw /> {t("act.restore")}
                    </button>
                  </div>
                ))}
              </details>
            )}
          </div>
        );
      })}

      {editing && <NewDirectiveModal edit={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
