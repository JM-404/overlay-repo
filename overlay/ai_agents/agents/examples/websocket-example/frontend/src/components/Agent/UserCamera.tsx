"use client";

import { VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Local webcam preview. Shown to the user but NOT uploaded or processed
 * — this is purely for the "you look like this right now" visual affordance,
 * mirroring how video-call UIs show your own tile alongside the other person's.
 *
 * If the browser denies camera access or no camera exists, we fail quiet:
 * small "不可用" card. The rest of the app keeps working (voice-only).
 */
export function UserCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 480 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-900 to-slate-950">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white/70">
          <VideoOff className="h-6 w-6" />
          <div>摄像头不可用</div>
          <div className="text-white/40 text-xs">{error}</div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
