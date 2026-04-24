/**
 * Anonymous user identity via localStorage.
 *
 * Generates a UUID on first visit and persists it, so the backend can
 * route per-user memory without requiring login. Same browser+profile
 * keeps the same UID; clearing storage or switching device/browser
 * creates a new identity (documented limitation of anonymous mode).
 */

const STORAGE_KEY = "xiaoling_uid";

function generateUuid(): string {
  // crypto.randomUUID is available in all modern browsers we target.
  // Fallback keeps SSR / old-browser code paths non-throwing.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "fallback-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getUserId(): string {
  if (typeof window === "undefined") {
    // SSR — caller should only use this client-side, but return stable sentinel.
    return "_ssr";
  }
  try {
    let uid = window.localStorage.getItem(STORAGE_KEY);
    if (!uid) {
      uid = generateUuid();
      window.localStorage.setItem(STORAGE_KEY, uid);
    }
    return uid;
  } catch {
    // localStorage disabled (private mode on some browsers) — transient UID
    // for this session only. User gets no persistent memory, but chat works.
    return "_nostorage-" + Math.random().toString(36).slice(2);
  }
}
