/** CHARACTER — the operator, plainly: who you are, what you can do, why. */
import React from "react";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { Gauge, TrendChart } from "../components/ui";
import { SHEETS, SpriteAnim } from "../components/SpriteAnim";

export function CharacterPage() {
  const { snap } = useSystem();
  const { t } = useI18n();
  if (!snap) return null;
  const p = snap.profile;
  const days = snap.recent_days;

  const stats = [
    { key: "STR", label: t("char.str"), value: p.stat_str, xp: p.xp_str,
      plain: t("char.strP"),
      now: `${t("char.maxStamina")} ${p.max_stamina.toFixed(0)}` },
    { key: "INT", label: t("char.int"), value: p.stat_int, xp: p.xp_int,
      plain: t("char.intP"),
      now: `${t("char.frictionRate")} ${(Math.max(1.15, 1.3 - 0.005 * (p.stat_int - 10))).toFixed(2)}` },
    { key: "CHA", label: t("char.cha"), value: p.stat_cha, xp: p.xp_cha,
      plain: t("char.chaP"),
      now: `${t("char.marketPresence")} ${p.stat_cha}` },
    { key: "WIL", label: t("char.wil"), value: p.stat_wil, xp: p.xp_wil,
      plain: t("char.wilP"),
      now: `${t("char.rustTol")} ${2 + Math.max(0, Math.floor((p.stat_wil - 10) / 5))} ${t("char.misses")}` },
  ];

  return (
    <div>
      <div className="page-heading">
        <h1>{p.name || "The Operator"}</h1>
        <div className="sub">
          Chapter {p.current_level}: {p.level_title} · day {p.campaign_day} · {snap.evidence_count} proofs laid
        </div>
      </div>

      <div className="cols-main-side">
        <div>
          <div className="panel" style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div className="portrait-frame big gold">
              <SpriteAnim sheet={SHEETS.hero} height={116} />
            </div>
            <div style={{ flex: 1 }}>
              {p.oath && (
                <div style={{ fontStyle: "italic", fontSize: 16, marginBottom: 12 }}>"{p.oath}"</div>
              )}
              <Gauge label={t("char.staminaBudget")} value={p.current_stamina} max={p.max_stamina}
                color={p.current_stamina / p.max_stamina > 0.35 ? "gold" : "crimson"} />
              <Gauge label={t("char.momentumSpeed")} value={p.momentum} max={3.5}
                color={p.momentum >= 1 ? "gold" : "crimson"} markerAt={1.0}
                display={p.momentum.toFixed(2)} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">{t("char.fourStats")}</div>
            <div className="panel-sub">{t("char.statsSub")}</div>
            <div className="grid grid-2">
              {stats.map((s) => (
                <div className="stat-hex" key={s.key} style={{ textAlign: "start", padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <div className="val mono-latin" style={{ margin: 0 }}>{s.value}</div>
                    <div>
                      <div className="name"><span className="mono-latin">{s.key}</span> — {s.label}</div>
                      <div className="xp mono-latin">{s.xp.toFixed(0)} xp</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.55 }}>
                    {s.plain}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--green)", marginTop: 6 }}>
                    ▸ {s.now}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <details className="panel">
            <summary className="panel-title" style={{ cursor: "pointer" }}>{t("char.curves")}</summary>
            <div style={{ marginTop: 14 }}>
              <TrendChart
                series={[{ name: "Momentum", color: "#c9a227", values: days.map((d) => d.momentum_close) }]}
                refLine={1.0} yMin={0} yMax={3.5} height={120}
              />
              <div style={{ marginTop: 14 }}>
                <TrendChart
                  series={[
                    { name: "Stamina", color: "#7da163", values: days.map((d) => d.stamina_close) },
                    { name: "Sharpness", color: "#8ea7bd", values: days.map((d) => d.sharpness_close) },
                    { name: "Durability", color: "#b0584f", values: days.map((d) => d.durability_close) },
                  ]}
                  yMin={0} yMax={Math.max(100, p.max_stamina)} height={120}
                />
              </div>
            </div>
          </details>
        </div>

        <div className="panel">
          <div className="panel-title">{t("char.marks")}</div>
          <div className="kv"><span className="k">{t("char.perfectDays")}</span>
            <span className="v green-text mono-latin">{days.filter((d) => d.perfect).length} / {days.length}</span></div>
          <div className="kv"><span className="k">{t("char.missDays")}</span>
            <span className="v crimson-text mono-latin">{days.filter((d) => d.misses > 0).length}</span></div>
          <div className="kv"><span className="k">{t("char.activeCurses")}</span>
            <span className="v">
              {snap.gate.sector_progress.filter((s) => s.cursed).map((s) => t(`sec.${s.sector}`)).join("، ") || t("word.none")}
            </span></div>
          <div className="kv"><span className="k">{t("char.rusted")}</span>
            <span className="v mono-latin" style={{ color: "var(--rust)" }}>
              {snap.habits.filter((h) => h.rusted && !h.is_archived).length}
            </span></div>
          <div className="kv"><span className="k">{t("char.paved")}</span>
            <span className="v mono-latin">{(snap.paving_ratio * 100).toFixed(0)}%</span></div>
        </div>
      </div>
    </div>
  );
}
