/**
 * Tauri detection + local MCP tool dispatcher.
 *
 * Active only when the frontend runs inside the xiaoling-desktop Tauri shell.
 * In a normal browser the helpers no-op so the same bundle works for both
 * vmodel.cc (browser) and the desktop app.
 */

interface TauriCore {
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

interface TauriGlobal {
  core: TauriCore;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

export interface LocalToolResult {
  ok: boolean;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
  error?: string;
}

export async function callLocalTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<LocalToolResult> {
  if (!isTauri()) {
    return { ok: false, error: "not running in tauri shell" };
  }
  const core = window.__TAURI__?.core;
  if (!core) {
    return { ok: false, error: "tauri core api unavailable" };
  }
  try {
    const raw = await core.invoke<{
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    }>("mcp_call", { tool, args });
    return {
      ok: !raw?.isError,
      content: raw?.content,
      isError: raw?.isError,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function listLocalTools(): Promise<unknown> {
  if (!isTauri()) return null;
  const core = window.__TAURI__?.core;
  if (!core) return null;
  return core.invoke("mcp_list_tools");
}
