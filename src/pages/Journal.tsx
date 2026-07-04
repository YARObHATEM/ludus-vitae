/** JOURNAL — words, not numbers. This page never touches a formula. */
import React, { useEffect, useState } from "react";
import { Feather, Sparkles } from "lucide-react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";
import { SectorTag, fmtDate } from "../components/ui";
import type { JournalEntryView, Sector } from "../types/contracts";

export function JournalPage() {
  const { pushToast } = useSystem();
  const { t } = useI18n();
  const [entries, setEntries] = useState<JournalEntryView[]>([]);
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [reflecting, setReflecting] = useState<number | null>(null);

  const load = async () => {
    try {
      setEntries(await bridge.getJournal(50, 0));
    } catch {
      setEntries([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await bridge.addJournalEntry(content.trim(), (tag || null) as Sector | null);
      audio.uiOpen();
      pushToast("success", t("j.recorded"), "");
      setContent("");
      await load();
    } catch (e) {
      audio.declineThud();
      pushToast("error", "JOURNAL", String(e));
    } finally {
      setBusy(false);
    }
  };

  const reflect = async (id: number) => {
    setReflecting(id);
    try {
      await bridge.reflectOnJournal(id);
      audio.oracleWhisper();
      await load();
    } catch (e) {
      pushToast("error", "ORACLE", String(e));
    } finally {
      setReflecting(null);
    }
  };

  return (
    <div>
      <div className="page-heading">
        <h1>{t("nav.journal")}</h1>
        <div className="sub">{t("j.sub")}</div>
      </div>

      <div className="panel">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("j.placeholder")}
          style={{ minHeight: 120, fontSize: 15.5 }}
        />
        <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
          <select value={tag} onChange={(e) => setTag(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">{t("j.tag")}</option>
            <option value="FINANCIAL">{t("sec.FINANCIAL")}</option>
            <option value="INTELLECTUAL">{t("sec.INTELLECTUAL")}</option>
            <option value="PHYSICAL">{t("sec.PHYSICAL")}</option>
            <option value="RESPONSIBILITY">{t("sec.RESPONSIBILITY")}</option>
          </select>
          <button className="btn primary" style={{ marginInlineStart: "auto" }}
            disabled={busy || content.trim().length === 0} onClick={save}>
            <Feather /> {t("j.save")}
          </button>
        </div>
      </div>

      {entries.length === 0 && (
        <div className="panel empty-slate">{t("j.empty")}</div>
      )}
      {entries.map((e) => (
        <div key={e.id} className="panel" style={{ marginTop: 14 }}>
          <div className="panel-sub" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <span className="mono-latin">{fmtDate(e.timestamp)}</span>
            {e.sector && <SectorTag sector={e.sector} />}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{e.content}</div>
          {e.oracle_reflection ? (
            <div className="oracle-terminal" style={{ marginTop: 12, minHeight: 0, padding: "12px 14px" }}>
              <div className="oracle-narrative" style={{ fontSize: 13 }}>"{e.oracle_reflection}"</div>
            </div>
          ) : (
            <button className="btn small" style={{ marginTop: 10 }}
              disabled={reflecting === e.id} onClick={() => void reflect(e.id)}>
              <Sparkles /> {reflecting === e.id ? t("j.reflecting") : t("j.reflect")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
