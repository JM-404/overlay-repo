"use client";

import { Download, Settings, Upload, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AVAILABLE_MODELS } from "@/lib/availableModels";
import {
  BACKGROUND_PRESETS,
  resolveBackgroundCss,
  useSettings,
} from "@/lib/settingsStore";

interface SettingsDrawerProps {
  /** Optional callback when voice volume changes — useful for hooking into
   *  the live AudioPlayer via setVolume(). */
  onVoiceVolumeChange?: (volume: number) => void;
  /** Currently selected model id and setter, mirrored from toolbar. */
  modelId: string;
  onModelChange: (id: string) => void;
  /** Whether running — disables model switching mid-session. */
  modelLocked: boolean;
}

export function SettingsDrawer({
  onVoiceVolumeChange,
  modelId,
  onModelChange,
  modelLocked,
}: SettingsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Push voice volume into AudioPlayer whenever it changes.
  useEffect(() => {
    onVoiceVolumeChange?.(settings.voiceVolume);
  }, [settings.voiceVolume, onVoiceVolumeChange]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      alert("图片不能超过 4MB(localStorage 容量限制)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setSettings({ background: `custom:${dataUrl}` });
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="设置"
        className="h-9 w-9"
      >
        <Settings className="h-4 w-4" />
      </Button>

      {/* Backdrop */}
      {open && (
        <button
          type="button"
          aria-label="关闭设置"
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-border/40 border-l bg-background shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex shrink-0 items-center justify-between border-border/40 border-b px-4 py-3">
          <h2 className="font-semibold text-base">设置</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* Model */}
          <section className="space-y-2">
            <h3 className="font-medium text-foreground text-sm">模型</h3>
            <select
              value={modelId}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={modelLocked}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.hint ? ` — ${m.hint}` : ""}
                </option>
              ))}
            </select>
            {modelLocked && (
              <p className="text-muted-foreground text-xs">
                运行中,Stop 后才能切换
              </p>
            )}
          </section>

          {/* Voice volume */}
          <section className="space-y-2">
            <h3 className="font-medium text-foreground text-sm">音量</h3>
            <div className="flex items-center gap-3">
              {settings.voiceVolume <= 0.01 ? (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Volume2 className="h-4 w-4 text-muted-foreground" />
              )}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.voiceVolume}
                onChange={(e) =>
                  setSettings({ voiceVolume: Number(e.target.value) })
                }
                className="flex-1 accent-primary"
              />
              <span className="w-10 text-right text-muted-foreground text-xs tabular-nums">
                {Math.round(settings.voiceVolume * 100)}%
              </span>
            </div>
          </section>

          {/* Background */}
          <section className="space-y-2">
            <h3 className="font-medium text-foreground text-sm">背景</h3>
            <div className="grid grid-cols-3 gap-2">
              {BACKGROUND_PRESETS.map((p) => {
                const selected = settings.background === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setSettings({ background: p.id })}
                    className={`relative h-16 overflow-hidden rounded-md border transition-all ${
                      selected
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-border/40 hover:border-border"
                    }`}
                    style={{ background: resolveBackgroundCss(p.id) }}
                    title={p.label}
                  >
                    <span className="absolute inset-x-0 bottom-0 bg-black/40 px-1 py-0.5 text-center text-white text-xs">
                      {p.label}
                    </span>
                  </button>
                );
              })}
              {/* Custom upload — shows current uploaded image as preview */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`relative h-16 overflow-hidden rounded-md border-2 border-dashed transition-all ${
                  settings.background.startsWith("custom:")
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border/40 hover:border-border"
                }`}
                style={
                  settings.background.startsWith("custom:")
                    ? { background: resolveBackgroundCss(settings.background) }
                    : undefined
                }
                title="上传图片"
              >
                <Upload className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
                <span className="absolute inset-x-0 bottom-0 bg-black/40 px-1 py-0.5 text-center text-white text-xs">
                  自定义
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleUpload}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              自定义图片不会上传服务器,只存在你浏览器里(上限 4MB)。
            </p>
          </section>

          {/* Avatar — placeholder for M3.2 */}
          <section className="space-y-2">
            <h3 className="font-medium text-foreground text-sm">角色</h3>
            <select
              value={settings.selectedAvatar}
              onChange={(e) =>
                setSettings({ selectedAvatar: e.target.value })
              }
              disabled
              className="h-9 w-full cursor-not-allowed rounded-md border border-input bg-transparent px-2 text-sm shadow-sm opacity-60"
            >
              <option value="kei">Kei(默认)</option>
            </select>
            <p className="text-muted-foreground text-xs">
              更多角色等公司美术交付后开放。
            </p>
          </section>

          {/* Desktop app download (V0.1 preview) */}
          <DesktopDownloadSection />
        </div>

        <div className="shrink-0 border-border/40 border-t px-4 py-3 text-muted-foreground text-xs">
          所有设置只存在你浏览器本地。
        </div>
      </aside>
    </>
  );
}

/**
 * Desktop app download card (V0.1 preview, macOS Apple Silicon only for now).
 * Detects platform via userAgent and shows the right CTA. Hidden inside the
 * Tauri shell itself (no point downloading the desktop app from the desktop
 * app).
 */
function DesktopDownloadSection() {
  const [platform, setPlatform] = useState<"mac" | "win" | "other">("other");
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/Mac/i.test(ua)) setPlatform("mac");
    else if (/Windows/i.test(ua)) setPlatform("win");
    // Detect we're already inside the Tauri shell
    const w = window as unknown as {
      __TAURI__?: unknown;
      __TAURI_INTERNALS__?: unknown;
    };
    setIsTauri(Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__));
  }, []);

  if (isTauri) return null; // already in the desktop app

  const macUrl = "/downloads/Xiaoling-mac.dmg";

  return (
    <section className="space-y-2">
      <h3 className="font-medium text-foreground text-sm">桌面版</h3>
      <div className="rounded-md border border-border/40 bg-muted/30 p-3 text-sm">
        <p className="text-foreground">
          下载小灵桌面版,体验额外能力:
        </p>
        <ul className="mt-1.5 ml-4 list-disc text-muted-foreground text-xs">
          <li>语音读取本机文件、运行终端命令</li>
          <li>独立窗口,不用开浏览器</li>
        </ul>
        {platform === "mac" ? (
          <>
            <a
              href={macUrl}
              download
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-opacity hover:opacity-90"
            >
              <Download className="h-4 w-4" />
              下载 macOS 版 (Apple Silicon)
            </a>
            <p className="mt-2 text-muted-foreground text-xs">
              首次启动如提示"无法核实开发者",右键 .app → 打开 →
              确认即可。Intel Mac / Windows 版本制作中。
            </p>
          </>
        ) : platform === "win" ? (
          <p className="mt-3 text-muted-foreground text-xs">
            Windows 版本制作中,先用 Edge / Chrome 在网页上体验完整功能。
          </p>
        ) : (
          <p className="mt-3 text-muted-foreground text-xs">
            桌面版目前支持 macOS Apple Silicon。其他平台用浏览器即可。
          </p>
        )}
      </div>
    </section>
  );
}
