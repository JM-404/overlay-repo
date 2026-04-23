"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Paths served from our own public/ directory — no US CDN dependency.
const MODEL_URL = "/live2d/kei_vowels_pro/kei_vowels_pro.model3.json";
const MOUTH_PARAM_ID = "ParamMouthOpenY";

interface AvatarLive2DProps {
  /**
   * AnalyserNode tapping the TTS audio graph. When provided, the avatar's
   * mouth parameter is driven by the RMS level of this analyser.
   */
  analyser: AnalyserNode | null;
}

/**
 * Lightweight Live2D avatar.
 *
 *  - PIXI v6.5.10 is forced into WEBGL_LEGACY mode BEFORE any Renderer is
 *    created, to sidestep the checkMaxIfStatementsInShader bug on some
 *    Chrome/ANGLE drivers (see earlier debugging session).
 *  - The model is loaded from /public/ on this same origin, not an external
 *    CDN — this keeps the avatar working on Chinese networks.
 *  - Mouth parameter is driven by RMS of the TTS AnalyserNode supplied by
 *    useAudioPlayer. Reusing the same AudioContext as playback avoids the
 *    cross-context MediaStream sample-rate mismatch that kept the mouth
 *    frozen in an earlier attempt.
 */
export function AvatarLive2D({ analyser }: AvatarLive2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const mouthValueRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------
  // Initialize PIXI + load Live2D model (runs once per canvas mount).
  // ---------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canvasRef.current) return;

    let cancelled = false;

    const init = async () => {
      try {
        // Wait for the Cubism Core script (loaded via <script> in layout.tsx).
        await new Promise<void>((resolve, reject) => {
          if ((window as any).Live2DCubismCore) return resolve();
          let elapsed = 0;
          const h = setInterval(() => {
            if ((window as any).Live2DCubismCore) {
              clearInterval(h);
              resolve();
              return;
            }
            elapsed += 100;
            if (elapsed >= 10000) {
              clearInterval(h);
              reject(new Error("Cubism Core failed to load"));
            }
          }, 100);
        });

        if (cancelled) return;

        // Import PIXI dynamically (it touches `window`).
        const PIXI = await import("pixi.js");
        // Critical fix: avoid the checkMaxIfStatementsInShader(0) bug in
        // PIXI v6 batchRenderer by forcing the legacy WebGL path.
        (PIXI as any).settings.PREFER_ENV = (PIXI as any).ENV.WEBGL_LEGACY;
        // Expose PIXI globally for pixi-live2d-display.
        (window as any).PIXI = PIXI;

        const { Live2DModel } = await import(
          "pixi-live2d-display/cubism4"
        );

        if (cancelled) return;

        const app = new (PIXI as any).Application({
          view: canvasRef.current,
          autoStart: true,
          backgroundAlpha: 0,
          antialias: false,
          powerPreference: "low-power",
          resizeTo: canvasRef.current?.parentElement ?? undefined,
        });
        appRef.current = app;

        const model = await Live2DModel.from(MODEL_URL);
        if (cancelled) {
          model.destroy?.();
          return;
        }
        // Disable auto mouse/touch tracking — otherwise Live2D attaches
        // pointer listeners to document, makes the avatar stare at the cursor
        // (creepy), AND hijacks clicks that should hit Start / Mic buttons.
        try {
          (model as any).autoInteract = false;
          model.interactive = false;
          model.interactiveChildren = false;
        } catch {}
        modelRef.current = model;
        app.stage.addChild(model);

        // Fit the model to the canvas.
        const fit = () => {
          const parent = canvasRef.current?.parentElement;
          if (!parent || !model) return;
          const scale = (parent.clientHeight / model.height) * 1.15;
          model.scale.set(scale);
          model.x = (parent.clientWidth - model.width) / 2;
          model.y = (parent.clientHeight - model.height) / 2 + 20;
        };
        fit();
        window.addEventListener("resize", fit);

        // Drive the mouth every frame from mouthValueRef (set by analyser below).
        const tick = () => {
          const m = modelRef.current;
          if (m?.internalModel?.coreModel?.setParameterValueById) {
            m.internalModel.coreModel.setParameterValueById(
              MOUTH_PARAM_ID,
              mouthValueRef.current,
            );
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();

        setLoading(false);
      } catch (e) {
        console.error("[AvatarLive2D] init failed:", e);
        if (!cancelled) setError(String((e as Error).message ?? e));
      }
    };

    init();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        modelRef.current?.destroy?.();
      } catch {}
      try {
        appRef.current?.destroy?.(false, { children: true });
      } catch {}
      appRef.current = null;
      modelRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------
  // Drive the mouth from the TTS AnalyserNode supplied by useAudioPlayer.
  // Same AudioContext as playback → no cross-context sample-rate issues.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!analyser) return;

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let active = true;
    let smoothed = 0;
    let frames = 0;

    const loop = () => {
      if (!active) return;
      analyser.getByteTimeDomainData(buffer);
      // Compute RMS in [0, 1].
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      // Scale + clamp.
      const target = Math.min(1, rms * 4);
      // Low-pass smoothing for natural motion.
      smoothed = smoothed * 0.5 + target * 0.5;
      mouthValueRef.current = smoothed;
      // One-time debug log so we can verify audio is reaching the analyser.
      if (frames === 30 || (frames % 120 === 0 && smoothed > 0.05)) {
        console.log(
          `[AvatarLive2D] RMS=${rms.toFixed(3)} mouth=${smoothed.toFixed(3)}`,
        );
      }
      frames++;
      requestAnimationFrame(loop);
    };
    loop();

    return () => {
      active = false;
      mouthValueRef.current = 0;
    };
  }, [analyser]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-900 to-slate-800">
      {/* pointer-events: none so clicks fall through to UI below. */}
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ pointerEvents: "none" }}
      />
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
          <Loader2 className="h-6 w-6 animate-spin" />
          <div className="text-sm">Loading avatar…</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 p-4 text-center text-sm text-white">
          {error}
        </div>
      )}
    </div>
  );
}
