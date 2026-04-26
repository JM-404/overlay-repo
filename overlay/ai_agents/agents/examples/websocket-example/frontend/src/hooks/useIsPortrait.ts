"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the viewport is in portrait orientation OR narrower than
 * the landscape-layout breakpoint (1024px). Both conditions trigger the
 * mobile/portrait UI variant.
 *
 * Stays SSR-safe by defaulting to landscape on first render — there's a
 * one-frame flash on phones, but no hydration mismatch.
 */
export function useIsPortrait(): boolean {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(
      "(orientation: portrait), (max-width: 1023px)",
    );
    const update = () => setIsPortrait(mq.matches);
    update();
    // Both `change` (modern) and addListener (Safari < 14) for safety.
    if ("addEventListener" in mq) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // @ts-ignore — legacy fallback
    mq.addListener(update);
    return () => {
      // @ts-ignore — legacy fallback
      mq.removeListener(update);
    };
  }, []);

  return isPortrait;
}
