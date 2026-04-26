/**
 * Proactive-tick protocol — the way the frontend tells 小灵
 * "open your mouth without waiting for the user".
 *
 * A tick is sent over the existing text-input WebSocket path as
 *   { text: "__PROACTIVE_TICK__:<reason>" }
 * The patched websocket_server forwards it as a synthetic asr_result, so
 * main_control + LLM treat it identically to a user turn — except the
 * LLM is told (via persona prompt) that anything starting with the
 * sentinel is a system instruction, not the user speaking, and it must
 * respond in a one-sided "I'm reaching out to you" tone.
 *
 * To keep the chat UI honest we also filter these synthetic user bubbles
 * out of the message store (see `isProactiveTick`).
 */

export const TICK_PREFIX = "__PROACTIVE_TICK__";

export type TickReason =
  | "user_just_arrived" // A: WebSocket just connected
  | "silence_60s" // B: backend watchdog fires (handled server-side)
  | "demo_morning" // C: ?greet=morning
  | "demo_afternoon" // C: ?greet=afternoon
  | "demo_evening" // C: ?greet=evening
  | "demo_remind"; // C: ?greet=remind

export function buildTickPayload(reason: TickReason): { text: string } {
  return { text: `${TICK_PREFIX}:${reason}` };
}

export function isProactiveTick(text: string | undefined | null): boolean {
  return !!text && text.startsWith(TICK_PREFIX);
}

/**
 * Read `?greet=...` from the URL and map to a tick reason. Returns
 * undefined if no demo override is requested.
 */
export function readGreetOverride(): TickReason | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("greet");
    if (!v) return undefined;
    const map: Record<string, TickReason> = {
      morning: "demo_morning",
      afternoon: "demo_afternoon",
      evening: "demo_evening",
      remind: "demo_remind",
    };
    return map[v.toLowerCase()];
  } catch {
    return undefined;
  }
}
