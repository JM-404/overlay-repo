/**
 * LLM models available via the gpt.ge gateway.
 *
 * The gateway is OpenAI-API-compatible — same endpoint, same auth, you only
 * swap the `model` string to route to Anthropic / OpenAI / Google.
 * base_url + api_key live in server-side property.json (not in this file),
 * so picking a model only requires overriding `properties.llm.model` at
 * /start time.
 */

export type ModelVendor = "Anthropic" | "OpenAI" | "Google";

export interface ModelOption {
  id: string; // exact model name the gateway expects
  label: string; // human-facing short name
  vendor: ModelVendor;
  hint?: string; // why you'd pick this one
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    vendor: "Anthropic",
    hint: "工具使用最稳,对话自然",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    vendor: "Anthropic",
    hint: "最快 Claude",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    vendor: "OpenAI",
    hint: "OpenAI 最新旗舰",
  },
  {
    id: "gpt-5.1-2025-11-13",
    label: "GPT-5.1",
    vendor: "OpenAI",
    hint: "上一代旗舰",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    vendor: "OpenAI",
    hint: "4 系列最强",
  },
  {
    id: "gpt-4o-2024-11-20",
    label: "GPT-4o",
    vendor: "OpenAI",
    hint: "经典快速",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    vendor: "Google",
    hint: "长上下文",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    vendor: "Google",
    hint: "最快 Gemini",
  },
];

export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

const STORAGE_KEY = "xiaoling_model";

export function getSelectedModel(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL_ID;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && AVAILABLE_MODELS.some((m) => m.id === stored)) return stored;
  } catch {
    // localStorage disabled — fall through to default
  }
  return DEFAULT_MODEL_ID;
}

export function setSelectedModel(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}
