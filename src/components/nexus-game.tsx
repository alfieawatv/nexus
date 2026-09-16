import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { NexusEngine, type HudState } from "@/game/engine";
import { renderFrame } from "@/game/renderer";

declare global {
  interface Window {
    __nexus?: {
      mode: () => string;
      time: () => number;
      start: () => void;
      reverse: () => void;
    };
  }
}

function formatTime(t: number): string {
  return t.toFixed(2);
}

export function NexusGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<NexusEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const engine = new NexusEngine();
    engineRef.current = engine;
    const unsubHud = engine.onHud(() => setHud({ ...engine.hud }));
    setHud({ ...engine.hud });

    const keys = new Set<string>();
    const GAME_KEYS = new Set(["Space", "Enter", "ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyP"]);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.tick(dt);
      engine.flushHud();
      const ctx = canvas.getContext("2d");
      if (ctx) renderFrame(ctx, engine, canvas.width, canvas.height, reducedMotion);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      engine.unlockAudio();
      engine.reverse();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (keys.has(e.code)) return;
      keys.add(e.code);
      engine.unlockAudio();
      if (e.code === "Space" || e.code === "Enter") engine.reverse();
      if (e.code === "ArrowLeft" || e.code === "KeyA") engine.setDir(-1);
      if (e.code === "ArrowRight" || e.code === "KeyD") engine.setDir(1);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };
    const onBlur = () => keys.clear();
    const onVis = () => {
      if (document.visibilityState === "visible") engine.resumeAudio();
    };

    wrap.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);

    window.__nexus = {
      mode: () => engine.mode,
      time: () => engine.time,
      start: () => engine.startRun(),
      reverse: () => engine.reverse(),
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
      engineRef.current = null;
      unsubHud();
      delete window.__nexus;
    };
  }, [ready, reducedMotion]);

  const playing = hud.mode === "playing";
  const dead = hud.mode === "dead";
  const attract = hud.mode === "attract";

  return (
    <div
      ref={wrapRef}
      className="relative h-dvh w-full overflow-hidden bg-bg text-fg select-none"
      style={{ touchAction: "none" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <div className="min-w-0">
            {playing ? (
              <p className="font-sans text-3xl font-semibold tabular-nums tracking-tight text-fg sm:text-4xl">
                {formatTime(hud.time)}
              </p>
            ) : (
              <p className="text-xs font-medium tracking-[0.28em] text-muted uppercase">Nexus</p>
            )}
            {playing && hud.combo > 1 ? (
              <p className="mt-1 text-xs font-medium tracking-[0.18em] text-accent uppercase">
                {hud.combo}x graze
              </p>
            ) : null}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              aria-label={hud.muted ? "Unmute" : "Mute"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                engineRef.current?.unlockAudio();
                engineRef.current?.setMuted(!hud.muted);
              }}
              className="flex size-11 items-center justify-center rounded-md border border-border bg-surface text-fg"
            >
              {hud.muted ? <VolumeX className="size-4" strokeWidth={1.75} /> : <Volume2 className="size-4" strokeWidth={1.75} />}
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          {attract ? (
            <div className="max-w-sm">
              <h1 className="text-[clamp(3.5rem,16vw,7rem)] leading-none font-semibold tracking-[-0.06em] text-fg">
                NEXUS
              </h1>
              <p className="mt-4 text-sm tracking-[0.22em] text-muted uppercase">One tap. Reverse. Survive.</p>
              <p className="mt-8 text-sm font-medium tracking-[0.28em] text-fg uppercase">Tap to play</p>
              {hud.bestTime > 0 ? (
                <p className="mt-6 text-xs tracking-[0.18em] text-muted uppercase">
                  Best {formatTime(hud.bestTime)}s
                </p>
              ) : (
                <p className="mt-6 text-xs tracking-[0.18em] text-muted uppercase">A / D or tap to reverse</p>
              )}
            </div>
          ) : null}

          {dead ? (
            <div className="max-w-sm">
              <p className="text-xs font-medium tracking-[0.28em] text-muted uppercase">
                {hud.newBest ? "New best" : "Ended"}
              </p>
              <p className="mt-3 text-[clamp(3rem,14vw,5.5rem)] leading-none font-semibold tracking-[-0.05em] tabular-nums text-fg">
                {formatTime(hud.time)}
              </p>
              <p className="mt-3 text-sm text-muted">
                Score {hud.score}
                {hud.bestTime > 0 ? ` · Best ${formatTime(hud.bestTime)}` : ""}
              </p>
              <p className="mt-8 text-sm font-medium tracking-[0.28em] text-fg uppercase">Tap to go again</p>
            </div>
          ) : null}

          {playing && hud.stageFlash > 0.15 ? (
            <p className="text-sm font-medium tracking-[0.32em] text-fg uppercase">Stage {hud.stage + 1}</p>
          ) : null}
        </div>

        <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center sm:px-6">
          {playing ? (
            <p className="text-[11px] tracking-[0.2em] text-muted uppercase">Tap · Space · A / D</p>
          ) : (
            <p className="text-[11px] tracking-[0.18em] text-muted uppercase">
              {hud.games > 0 ? `${hud.games} runs` : "Don't blink"}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

const EMPTY_HUD: HudState = {
  mode: "attract",
  time: 0,
  score: 0,
  bestTime: 0,
  bestScore: 0,
  games: 0,
  stage: 0,
  combo: 0,
  newBest: false,
  muted: false,
  reduceShake: false,
  stageFlash: 0,
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
