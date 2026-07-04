/** SETTINGS — the AI Oracle bridge, audio, preferences, and data custody. */
import React, { useEffect, useState } from "react";
import { DatabaseBackup, KeyRound, PlugZap } from "lucide-react";
import { bridge } from "../api/bridge";
import { audio } from "../audio/engine";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";

export function SettingsPage() {
  const { snap, settings, reloadSettings, refresh, pushToast } = useSystem();
  const { t, lang, setLang } = useI18n();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(settings.oracle_model ?? "gemini-2.5-flash");
  const [busy, setBusy] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");

  const burnWorld = async () => {
    setBusy(true);
    try {
      await bridge.resetWorld(resetPhrase.trim());
      pushToast("success", "THE WORLD IS ASH", "The Genesis Ritual awaits. Speak a new world into the ledger.");
      setResetPhrase("");
      await refresh();
    } catch (e) {
      pushToast("error", "THE VOID REFUSED", String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (settings.oracle_model) setModel(settings.oracle_model);
  }, [settings.oracle_model]);

  if (!snap) return null;

  const setSetting = async (key: string, value: string) => {
    try {
      await bridge.setAppSetting(key, value);
      await reloadSettings();
    } catch (e) {
      pushToast("error", "SETTINGS", String(e));
    }
  };

  const saveOracle = async () => {
    setBusy(true);
    try {
      if (apiKey.trim().length > 0) {
        await bridge.setOracleKey(apiKey.trim());
      }
      await bridge.setAppSetting("oracle_model", model.trim() || "gemini-2.0-flash");
      await reloadSettings();
      await refresh();
      setApiKey("");
      pushToast("success", "ORACLE CONFIGURED",
        apiKey.trim() ? "Key sealed into the OS credential store — never written to disk in plaintext." : "Model updated.");
    } catch (e) {
      pushToast("error", "ORACLE", String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    try {
      await bridge.setOracleKey("");
      await refresh();
      pushToast("success", "KEY WITHDRAWN", "The credential store entry was destroyed.");
    } catch (e) {
      pushToast("error", "ORACLE", String(e));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    try {
      const msg = await bridge.testOracleConnection();
      pushToast("success", "BRIDGE TEST", msg);
    } catch (e) {
      pushToast("error", "BRIDGE TEST", String(e));
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    setBusy(true);
    try {
      const path = await bridge.exportBackup();
      pushToast("success", "BACKUP SEALED", path);
    } catch (e) {
      pushToast("error", "BACKUP", String(e));
    } finally {
      setBusy(false);
    }
  };

  const vol = (key: "master_volume" | "music_volume" | "sfx_volume", label: string) => (
    <label className="field">
      <span className="field-label">
        {label} — {Math.round(parseFloat(settings[key] ?? "0.8") * 100)}%
      </span>
      <input
        type="range" min={0} max={1} step={0.05}
        value={parseFloat(settings[key] ?? "0.8")}
        onChange={(e) => {
          void setSetting(key, e.target.value);
          audio.uiTick();
        }}
      />
    </label>
  );

  return (
    <div>
      <div className="page-heading">
        <h1>{t("set.title")}</h1>
        <div className="sub">{t("set.sub")}</div>
      </div>

      <div className="panel" style={{ marginBottom: 16, borderColor: "var(--gold-dim)" }}>
        <div className="panel-title">{t("set.language")}</div>
        <div className="panel-sub">{t("set.langSub")}</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            className={`btn big${lang === "en" ? " primary" : ""}`}
            style={{ flex: 1, fontFamily: "var(--font-serif)" }}
            onClick={() => { audio.uiTick(); setLang("en"); }}
          >
            English
          </button>
          <button
            className={`btn big${lang === "ar" ? " primary" : ""}`}
            style={{ flex: 1, fontFamily: "'Lalezar', cursive", fontSize: 24 }}
            onClick={() => { audio.uiTick(); setLang("ar"); }}
          >
            العربية
          </button>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>{t("set.langHint")}</div>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <div className="panel-title"><KeyRound size={15} /> {t("set.aiOracle")}</div>
          <div className="panel-sub">{t("set.aiSub")}</div>
          <label className="field">
            <span className="field-label">
              {t("set.apiKey")} {snap.oracle_configured ? `· ${t("set.keySealed")} ✓` : `· ${t("set.noKey")}`}
            </span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={snap.oracle_configured ? t("set.keyPlaceholderSet") : t("set.keyPlaceholderEmpty")} />
          </label>
          <div className="hint" style={{ marginBottom: 12 }}>{t("set.keyHint")}</div>
          <label className="field">
            <span className="field-label">{t("set.model")}</span>
            <input type="text" list="oracle-models" value={model} onChange={(e) => setModel(e.target.value)}
              placeholder="gemini-2.5-flash" className="mono-latin" />
            <datalist id="oracle-models">
              <option value="gemini-2.5-flash" />
              <option value="gemini-2.5-flash-lite" />
              <option value="gemini-2.5-pro" />
              <option value="gemini-3.5-flash" />
              <option value="gemini-flash-latest" />
            </datalist>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={saveOracle} disabled={busy}>{t("set.saveConfig")}</button>
            <button className="btn" onClick={testConnection} disabled={busy || !snap.oracle_configured}>
              <PlugZap /> {t("set.testConn")}
            </button>
            {snap.oracle_configured && (
              <button className="btn danger" onClick={removeKey} disabled={busy}>{t("set.withdrawKey")}</button>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">{t("set.resonance")}</div>
          <div className="panel-sub">{t("set.audioSub")}</div>
          {vol("master_volume", t("set.masterVol"))}
          {vol("music_volume", t("set.ambienceVol"))}
          {vol("sfx_volume", t("set.effectsVol"))}
          <div className="kv">
            <span className="k">{t("set.currentAudioLaw")}</span>
            <span className="v mono-latin">×{snap.audio.pitch_multiplier.toFixed(2)} · {(snap.audio.lowpass_cutoff / 1000).toFixed(1)} kHz</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">{t("set.gameplay")}</div>
          <label className="field">
            <span className="field-label">{t("diff.label")}</span>
            <select value={settings.difficulty ?? "standard"}
              onChange={(e) => void setSetting("difficulty", e.target.value)}>
              <option value="casual">{t("diff.casual")}</option>
              <option value="standard">{t("diff.standard")}</option>
              <option value="brutal">{t("diff.brutal")}</option>
            </select>
          </label>
          <div className="hint" style={{ marginBottom: 12 }}>{t("diff.hint")}</div>
          <label className="field">
            <span className="field-label">{t("set.reducedMotion")}</span>
            <select value={settings.reduced_motion ?? "false"}
              onChange={(e) => void setSetting("reduced_motion", e.target.value)}>
              <option value="false">{t("set.reducedOff")}</option>
              <option value="true">{t("set.reducedOn")}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t("set.confirmDestructive")}</span>
            <select value={settings.confirm_destructive ?? "true"}
              onChange={(e) => void setSetting("confirm_destructive", e.target.value)}>
              <option value="true">{t("set.confirmOn")}</option>
              <option value="false">{t("set.confirmOff")}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t("set.startupView")}</span>
            <select value={settings.startup_view ?? "today"}
              onChange={(e) => void setSetting("startup_view", e.target.value)}>
              <option value="today">{t("nav.today")}</option>
              <option value="campaign">{t("nav.campaign")}</option>
              <option value="character">{t("nav.character")}</option>
              <option value="chronicle">{t("nav.chronicle")}</option>
            </select>
          </label>
        </div>

        <div className="panel">
          <div className="panel-title"><DatabaseBackup size={15} /> {t("set.dataControls")}</div>
          <div className="panel-sub">{t("set.dataSub")}</div>
          <div className="kv"><span className="k">{t("set.mode")}</span><span className="v green-text">{t("set.offline")}</span></div>
          <div className="kv"><span className="k">{t("set.database")}</span>
            <span className="v mono-latin" style={{ maxWidth: 260, textAlign: "right", wordBreak: "break-all", fontSize: 10.5 }}>
              {settings.db_path ?? snap.db_path}
            </span></div>
          <div className="kv"><span className="k">{t("set.vault")}</span>
            <span className="v mono-latin" style={{ maxWidth: 260, textAlign: "right", wordBreak: "break-all", fontSize: 10.5 }}>
              {settings.vault_root ?? "—"}
            </span></div>
          <div className="kv"><span className="k">{t("set.oracleConn")}</span>
            <span className="v" style={{ color: snap.oracle_configured ? "var(--green)" : "var(--text-dim)" }}>
              {snap.oracle_configured ? t("set.connected") : t("set.offline")}
            </span></div>
          <button className="btn" style={{ width: "100%", marginTop: 14 }} onClick={backup} disabled={busy}>
            {t("set.exportBackup")}
          </button>

          <div className="divider" />
          <div className="field-label" style={{ color: "var(--crimson)" }}>{t("set.burnTitle")}</div>
          <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{t("set.burnHint")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input type="text" value={resetPhrase} placeholder="RESET" className="mono-latin"
              onChange={(e) => setResetPhrase(e.target.value)} style={{ flex: 1 }} />
            <button className="btn danger" disabled={busy || resetPhrase.trim() !== "RESET"}
              onClick={burnWorld}>
              {t("set.burnBtn")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
