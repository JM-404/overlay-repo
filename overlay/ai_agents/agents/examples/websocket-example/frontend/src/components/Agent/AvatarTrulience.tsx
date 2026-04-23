"use client";

import { TrulienceAvatar } from "@trulience/react-sdk";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

// Demo credentials. Token is a long-lived JWT safe to expose client-side
// (it's the same value embedded in Trulience's public iframe URLs).
const AVATAR_ID = "4999232223300240556";
const AVATAR_TOKEN =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJUb2tlbiBmcm9tIGN1c3RvbSBzdHJpbmciLCJleHAiOjQ4NzU0MDAzNTV9.cGdPj32kvizUIs3ths_SJluxZhPL86HSkP_9esRtVmwmYUsx_Z9JTisxXH8DIMvz_bqfc4MQ8Ot87LYNUwnmWw";
const SDK_URL = "https://trulience.com/sdk/trulience.sdk.js";

interface AvatarTrulienceProps {
  /** TTS audio stream. When provided, the avatar lip-syncs to it. */
  mediaStream: MediaStream | null;
}

export function AvatarTrulience({ mediaStream }: AvatarTrulienceProps) {
  const avatarRef = useRef<TrulienceAvatar>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authOk, setAuthOk] = useState(false);

  const eventCallbacks = useMemo(
    () => ({
      "auth-success": () => setAuthOk(true),
      "auth-fail": (resp: { message?: string }) =>
        setAuthError(resp?.message ?? "Trulience auth failed"),
      "load-progress": (details: { progress?: number }) => {
        if (typeof details?.progress === "number") {
          setLoadProgress(details.progress);
        }
      },
    }),
    [],
  );

  // Feed the TTS MediaStream into the avatar for lip-sync as soon as both
  // the avatar is authenticated AND we have an audio stream.
  useEffect(() => {
    if (!mediaStream || !authOk) return;
    const ref = avatarRef.current;
    if (!ref?.setMediaStream) return;
    try {
      ref.setMediaStream(mediaStream);
    } catch (err) {
      console.error("[AvatarTrulience] setMediaStream failed:", err);
    }
  }, [mediaStream, authOk]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-black">
      <TrulienceAvatar
        url={SDK_URL}
        ref={avatarRef}
        avatarId={AVATAR_ID}
        token={AVATAR_TOKEN}
        eventCallbacks={eventCallbacks}
        width="100%"
        height="100%"
      />

      {/* Loading / error overlay */}
      {loadProgress < 1 && !authError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
          <Loader2 className="h-6 w-6 animate-spin" />
          <div className="text-sm">
            Loading avatar… {Math.round(loadProgress * 100)}%
          </div>
        </div>
      )}
      {authError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 p-4 text-center text-sm text-white">
          Avatar error: {authError}
        </div>
      )}
    </div>
  );
}
