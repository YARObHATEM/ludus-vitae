/** CHRONICLE — the append-only history: executions, events, the honest ledger. */
import React, { useEffect, useState } from "react";
import { bridge } from "../api/bridge";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { SectorTag, TrendChart, WeightTag, fmtDate } from "../components/ui";
import type { ExecutionLogView, SystemEvent } from "../types/contracts";

const KIND_COLOR: Record<string, string> = {
  MISS: "var(--crimson)", EXECUTION: "var(--green)", MILESTONE: "var(--gold-bright)",
  BOSS_DEFEATED: "var(--gold-bright)", WEAPON: "var(--steel)", TERRAIN: "var(--rust)",
  RECKONING: "var(--crimson)", LEVEL: "var(--gold-bright)", CYCLE: "var(--crimson)",
  GENESIS: "var(--gold-bright)",
};

export function ChroniclePage() {
  const { snap } = useSystem();
  const { t } = useI18n();
  const [tab, setTab] = useState<"executions" | "events">("executions");
  const [logs, setLogs] = useState<ExecutionLogView[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [page, setPage] = useState(0);
  const PAGE = 30;

  useEffect(() => {
    void bridge.getChronicle(PAGE, page * PAGE).then(setLogs).catch(() => setLogs([]));
    void bridge.getAllEvents(200).then(setEvents).catch(() => setEvents([]));
  }, [page, snap?.today_key, snap?.recent_logs.length]);

  if (!snap) return null;
  const days = snap.recent_days;

  return (
    <div>
      <div className="page-heading">
        <h1>{t("chron.title")}</h1>
        <div className="sub">{t("chron.sub")}</div>
      </div>

      <div className="panel">
        <div className="panel-title">{t("heat.title")}</div>
        <div className="heatmap" style={{ marginTop: 12, overflowX: "auto", paddingBottom: 4 }}>
          {days.map((d) => {
            const cls = d.misses > 0 && d.executions === 0
              ? "miss"
              : d.executions >= 5 ? "h4"
              : d.executions >= 3 ? "h3"
              : d.executions >= 2 ? "h2"
              : d.executions >= 1 ? "h1"
              : "";
            return <div key={d.day_key} className={`heat-cell ${cls}`} title={`${d.day_key}: ${d.executions}⚔ ${d.misses}✗`} />;
          })}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">{t("chron.recordedDays")}</div>
        <div className="panel-sub">
          <span className="mono-latin">{days.length}</span> {t("chron.closedDays")} · <span className="mono-latin">{days.filter((d) => d.perfect).length}</span> {t("chron.perfect")} ·{" "}
          <span className="mono-latin">{days.reduce((a, d) => a + d.executions, 0)}</span> {t("chron.execs")} · <span className="mono-latin">{days.reduce((a, d) => a + d.misses, 0)}</span> {t("chron.misses")}
        </div>
        <TrendChart
          series={[
            { name: t("chron.execs"), color: "#7da163", values: days.map((d) => d.executions) },
            { name: t("chron.misses"), color: "#b0413e", values: days.map((d) => d.misses) },
          ]}
          height={110}
        />
      </div>

      <div className="panel">
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <button className={`btn small${tab === "executions" ? " primary" : ""}`} onClick={() => setTab("executions")}>
            {t("chron.executions")}
          </button>
          <button className={`btn small${tab === "events" ? " primary" : ""}`} onClick={() => setTab("events")}>
            {t("chron.events")}
          </button>
        </div>

        {tab === "executions" && (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("chron.colWhen")}</th><th>{t("chron.colDirective")}</th><th>{t("chron.colSector")}</th><th>{t("chron.colWeight")}</th>
                  <th>{t("chron.colCost")}</th><th>{t("chron.colMAfter")}</th><th>{t("chron.colFlags")}</th><th>{t("chron.colNote")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="mono-latin dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(l.timestamp)}</td>
                    <td>{l.habit_name}</td>
                    <td><SectorTag sector={l.sector} /></td>
                    <td><WeightTag weight={l.weight} /></td>
                    <td className="mono-latin">{l.stamina_cost.toFixed(1)}</td>
                    <td className="mono-latin gold-text">{l.momentum_after.toFixed(2)}</td>
                    <td style={{ fontSize: 10 }}>
                      {l.proof_path && <span className="tag green">{t("word.proof")}</span>}{" "}
                      {l.overdraft && <span className="tag crimson">OD</span>}{" "}
                      {l.off_window && <span className="tag neutral">{t("word.offWindow")}</span>}
                    </td>
                    <td className="dim" style={{ fontSize: 12, maxWidth: 220 }}>{l.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && <div className="empty-slate">{t("chron.noExec")}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("chron.newer")}</button>
              <span className="dim mono-latin" style={{ alignSelf: "center", fontSize: 11 }}>{t("chron.page")} {page + 1}</span>
              <button className="btn small" disabled={logs.length < PAGE} onClick={() => setPage((p) => p + 1)}>{t("chron.older")}</button>
            </div>
          </>
        )}

        {tab === "events" && (
          <div style={{ maxHeight: "56vh", overflowY: "auto" }}>
            {events.map((e) => (
              <div key={e.id} className="kv" style={{ gap: 14, alignItems: "baseline" }}>
                <span className="k" style={{ color: KIND_COLOR[e.kind] ?? "var(--text-dim)", minWidth: 118 }}>
                  {e.kind.replace("_", " ")}
                </span>
                <span style={{ flex: 1, fontSize: 13.5 }}>{e.detail}</span>
                <span className="faint mono-latin" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{e.day_key}</span>
              </div>
            ))}
            {events.length === 0 && <div className="empty-slate">{t("chron.blankScroll")}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
