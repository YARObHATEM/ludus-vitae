/** Application shell: view routing, genesis gate, global ceremonies. */
import React, { useEffect, useState } from "react";
import { Sidebar, ToastRack, TopBar } from "./components/chrome";
import { NewDirectiveModal } from "./components/NewDirectiveModal";
import { NightLedger } from "./components/NightLedger";
import { ReckoningCeremony } from "./components/ReckoningCeremony";
import { useSystem } from "./state/SystemProvider";
import { ArsenalPage } from "./pages/Arsenal";
import { CampaignPage } from "./pages/Campaign";
import { CharacterPage } from "./pages/Character";
import { ChroniclePage } from "./pages/Chronicle";
import { DomainsPage } from "./pages/Domains";
import { GenesisRitual } from "./pages/GenesisRitual";
import { JournalPage } from "./pages/Journal";
import { OraclePage } from "./pages/OraclePage";
import { SettingsPage } from "./pages/Settings";
import { TodayPage } from "./pages/Today";
import type { ViewKey } from "./pages/views";

export default function App() {
  const { snap, loading, fatal, settings, lastReckoning, clearReckoning } = useSystem();
  const [view, setView] = useState<ViewKey>("today");
  const [newDirective, setNewDirective] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerAutoShown, setLedgerAutoShown] = useState(false);
  const [startupApplied, setStartupApplied] = useState(false);

  // Apply the configured startup view once.
  useEffect(() => {
    if (!startupApplied && settings.startup_view) {
      const v = settings.startup_view as ViewKey;
      if (["today", "domains", "campaign", "character", "arsenal", "journal", "chronicle", "oracle", "settings"].includes(v)) {
        setView(v);
      }
      setStartupApplied(true);
    }
  }, [settings.startup_view, startupApplied]);

  // The Night Ledger auto-presents accumulated events once per session, at
  // launch. Events created while you watch (executions, milestones) only
  // badge the Chronicle — you already saw them happen.
  useEffect(() => {
    if (!snap || !snap.profile.genesis_complete || ledgerAutoShown) return;
    setLedgerAutoShown(true);
    if (snap.unseen_events.length > 0) setLedgerOpen(true);
  }, [snap, ledgerAutoShown]);

  if (loading) {
    return (
      <div className="genesis-veil">
        <div style={{ textAlign: "center" }}>
          <div className="genesis-title" style={{ fontSize: 26 }}>LUDUS VITAE</div>
          <div className="genesis-sub">initializing the deterministic core…</div>
        </div>
      </div>
    );
  }

  // Iron rule: no mock data. If the engine is unreachable, fail visibly.
  if (fatal || !snap) {
    return (
      <div className="genesis-veil">
        <div className="panel" style={{ maxWidth: 560, borderColor: "var(--crimson-deep)" }}>
          <div className="panel-title" style={{ color: "var(--crimson)" }}>ENGINE UNREACHABLE</div>
          <div className="law-prose" style={{ marginTop: 8 }}>
            The deterministic core did not answer. The interface refuses to render invented state.
          </div>
          <div className="law-formula" style={{ marginTop: 12 }}>{fatal ?? "no snapshot"}</div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
            Retry Initialization
          </button>
        </div>
      </div>
    );
  }

  if (!snap.profile.genesis_complete) {
    return <GenesisRitual />;
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} onNewDirective={() => setNewDirective(true)} />
      <div className="main-col">
        <TopBar />
        <main
          className={
            "content" +
            (snap.profile.momentum < 0.7
              ? " world-decay world-collapse"
              : snap.profile.momentum < 1.0
                ? " world-decay"
                : "")
          }
        >
          {view === "today" && <TodayPage setView={setView} />}
          {view === "domains" && <DomainsPage />}
          {view === "campaign" && <CampaignPage />}
          {view === "character" && <CharacterPage />}
          {view === "arsenal" && <ArsenalPage />}
          {view === "journal" && <JournalPage />}
          {view === "chronicle" && <ChroniclePage />}
          {view === "oracle" && <OraclePage />}
          {view === "settings" && <SettingsPage />}
        </main>
      </div>

      {newDirective && <NewDirectiveModal onClose={() => setNewDirective(false)} />}
      {ledgerOpen && <NightLedger onClose={() => setLedgerOpen(false)} />}
      {lastReckoning && <ReckoningCeremony report={lastReckoning} onClose={clearReckoning} />}
      <ToastRack />
    </div>
  );
}
