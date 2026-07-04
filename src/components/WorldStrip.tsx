/** Hosts the PixiJS locomotion world and keeps it fed with snapshot state. */
import React, { useEffect, useRef } from "react";
import { LocomotionScene } from "../engine/locomotionScene";
import { useSystem } from "../state/SystemProvider";
import { useI18n } from "../i18n/I18nProvider";

export function WorldStrip({ paused }: { paused: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LocomotionScene | null>(null);
  const { snap } = useSystem();
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    void LocomotionScene.create(host).then((scene) => {
      if (cancelled) {
        scene.destroy();
        return;
      }
      sceneRef.current = scene;
      if (snap) scene.update(snap);
      scene.setPaused(paused || document.hidden);
    });
    const onVis = () => sceneRef.current?.setPaused(paused || document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (snap) sceneRef.current?.update(snap);
  }, [snap]);

  useEffect(() => {
    sceneRef.current?.setPaused(paused || document.hidden);
  }, [paused]);

  if (!snap) return null;
  return (
    <div className="world-strip">
      <div ref={hostRef} className="world-canvas-host" />
      <div className="world-hud">
        <span>{t("world.state")}</span>
        <b>{t(`biome.${snap.biome}`)}</b>
        <span>·</span>
        <span>{t("world.paved")} <span className="mono-latin">{(snap.paving_ratio * 100).toFixed(0)}%</span></span>
        <span>·</span>
        <span>{t("world.speed")} <span className="mono-latin">×{snap.locomotion_speed.toFixed(2)}</span></span>
        {paused && <><span>·</span><b style={{ color: "var(--crimson)" }}>{t("world.suspended")}</b></>}
      </div>
    </div>
  );
}
