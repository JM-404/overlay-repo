"use client";

/**
 * Persistent user settings — backgrounds, voice volume, etc.
 *
 * Stored in `localStorage['xiaoling_settings']` as a single JSON blob so we
 * don't keep adding storage keys per setting. Reading is sync (zero-flash
 * on mount); writing also updates a tiny in-process listener set so the
 * UI reacts without prop-drilling.
 */

import { useEffect, useState } from "react";

export type BackgroundPresetId =
  | "default"
  | "dawn"
  | "forest"
  | "ocean"
  | "dusk"
  | "night"
  | "warm";

export interface BackgroundPreset {
  id: BackgroundPresetId;
  label: string;
  /** Tailwind / CSS background value applied to the page root. */
  css: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "default",
    label: "默认",
    css: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
  },
  {
    id: "dawn",
    label: "黎明",
    css: "linear-gradient(180deg, #1e1b4b 0%, #fb923c 100%)",
  },
  {
    id: "forest",
    label: "森林",
    css: "linear-gradient(180deg, #052e16 0%, #166534 100%)",
  },
  {
    id: "ocean",
    label: "海洋",
    css: "linear-gradient(180deg, #082f49 0%, #0c4a6e 100%)",
  },
  {
    id: "dusk",
    label: "黄昏",
    css: "linear-gradient(180deg, #4a044e 0%, #f97316 100%)",
  },
  {
    id: "night",
    label: "夜空",
    css: "linear-gradient(180deg, #020617 0%, #1e1b4b 100%)",
  },
  {
    id: "warm",
    label: "暖光",
    css: "linear-gradient(180deg, #422006 0%, #facc15 100%)",
  },
];

export interface XiaolingSettings {
  /** Either a preset id, or `custom:<dataURL>` for user-uploaded image. */
  background: string;
  /** Master TTS volume, 0..1. */
  voiceVolume: number;
  /** Reserved for M3.2 — only "kei" exists today. */
  selectedAvatar: string;
}

const DEFAULT_SETTINGS: XiaolingSettings = {
  background: "default",
  voiceVolume: 0.85,
  selectedAvatar: "kei",
};

const STORAGE_KEY = "xiaoling_settings";

function loadFromStorage(): XiaolingSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveToStorage(settings: XiaolingSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or disabled — settings won't persist this session
  }
}

// ---- Tiny pub-sub so components react to updates ---------------------------
type Listener = (s: XiaolingSettings) => void;
const listeners = new Set<Listener>();
let cached: XiaolingSettings | null = null;

function getSettings(): XiaolingSettings {
  if (!cached) cached = loadFromStorage();
  return cached;
}

function setSettings(patch: Partial<XiaolingSettings>) {
  cached = { ...getSettings(), ...patch };
  saveToStorage(cached);
  listeners.forEach((fn) => fn(cached!));
}

/** React hook — returns current settings + a setter that persists & broadcasts. */
export function useSettings(): [
  XiaolingSettings,
  (patch: Partial<XiaolingSettings>) => void,
] {
  const [state, setState] = useState<XiaolingSettings>(getSettings);
  useEffect(() => {
    const fn: Listener = (s) => setState(s);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [state, setSettings];
}

/** Resolve a background id (or custom:* string) into a CSS `background` value. */
export function resolveBackgroundCss(value: string): string {
  if (value.startsWith("custom:")) {
    const url = value.slice("custom:".length);
    return `center/cover no-repeat url("${url}"), #0f172a`;
  }
  const preset = BACKGROUND_PRESETS.find((p) => p.id === value);
  return preset?.css ?? BACKGROUND_PRESETS[0].css;
}
