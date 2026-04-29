# 小灵 / Xiaoling — Project Context

> **How to use this file**: paste its contents into a new Claude session to
> bring it up to speed on the project. It contains everything a fresh model
> needs to continue the work without asking.

---

## 1. What is it

A voice-first conversational companion ("小灵") deployed to
`https://vmodel.cc`. Real-time pipeline:

```
Browser mic  ─►  WebSocket (same-origin /ws/{port} via Caddy)
                    │
                    ▼
  ┌─────────────────────────────────────────┐
  │  TEN Framework worker (Go + Python)     │
  │                                         │
  │    Aliyun Paraformer v2 (STT, zh+en)    │
  │           │                             │
  │           ▼                             │
  │    DeepSeek (LLM, OpenAI-compatible)    │
  │           │                             │
  │           ▼                             │
  │    Minimax WebSocket TTS (zh 甜美女声)   │
  │                                         │
  │    + MCP fetch   (FastMCP SSE :7777)    │
  │    + MCP context (FastMCP SSE :7778)    │  time / lunar / weather
  │    + MCP memory  (FastMCP SSE :7779)    │  per-user SQLite recall/remember
  │    + main_python (orchestrator)         │
  └─────────────────────────────────────────┘
                    │
                    ▼
  Browser  ──►  AudioPlayer (gap-free scheduling)
                    │
                    ├──►  Speakers
                    └──►  Live2D Kei avatar (lip-sync via AnalyserNode)
```

Base framework: [TEN Framework](https://github.com/TEN-framework/TEN-Agent)
`websocket-example`, heavily customized.

---

## 2. Infrastructure

### Server
- **Aliyun ECS**: `ecs.e-c1m2.xlarge` (4vCPU, 8GB), Ubuntu 22.04, ~¥159/月
- **Public IP**: `47.95.119.182`
- **Region**: 华北2 (Beijing)
- **Domain**: `vmodel.cc` + `www.vmodel.cc`, DNS A records both → server IP
- **备案**: done, so 80/443 usable

### SSH access
- **Key**: `~/.ssh/xiaoling` on user's Mac (ed25519)
- **Command**: `ssh -i ~/.ssh/xiaoling root@47.95.119.182`
- **⚠️ User's Mac has a proxy (Surge/Clash-style) at `utun5 / 198.18.0.1`**.
  The server IP must be on the proxy's DIRECT/bypass list, otherwise SSH
  handshake times out ("banner exchange" failure). When this happens, have
  user enable their proxy rule before retrying.

### Docker container (on server)
- Image: `ghcr.io/ten-framework/ten_agent_build:0.7.14` (pulled once, ~2.4 GB,
  slow from China — took ~20 min initial pull)
- Container name: `ten_agent_dev`
- Host files bind-mounted to `/app`: edits in
  `/opt/xiaoling/ten-framework-main/ai_agents/...` show up live in the container

### Reverse proxy
- **Caddy 2.11.2** on host, `/etc/caddy/Caddyfile` reverse-proxies 443 →
  localhost:3000
- Auto-HTTPS via Let's Encrypt
- WebSocket upgrade works transparently (Caddy default)

### Ports
| Port | What | Exposed |
|---|---|---|
| 443 | HTTPS (Caddy) | ✅ Internet |
| 80 | HTTP → 301 to 443 | ✅ Internet |
| 3000 | Next.js frontend | Internal only |
| 8080 | TEN API server (Go) | Internal only |
| 8000-9000 | TEN workers (websocket_server per session) | via Caddy/frontend proxy |
| 7777 | FastMCP fetch server (web pages) | Internal only |
| 7778 | FastMCP context server (time/lunar/weather) | Internal only |
| 7779 | FastMCP memory server (per-user SQLite) | Internal only |

---

## 3. Repositories

### Overlay repo (customizations)
- `https://github.com/JM-404/overlay-repo`
- Local: `/Users/jm/Personal Project/Company/xiaoling-deploy/`
- Contains:
  - `overlay/` — files that overwrite the upstream TEN repo
  - `scripts/install.sh`, `start-services.sh`, `sync-from-mac.sh`
  - `caddy/Caddyfile`
  - `.env.example`
  - `DEPLOYMENT.md`, `PROJECT_CONTEXT.md` (this file)

### Desktop app (Phase 1 spike, 2026-04-29 — see Section 10)
- Local: `/Users/jm/Personal Project/Company/xiaoling-desktop/` (separate
  git repo, not yet on GitHub)
- Tauri 2 shell + Node MCP sidecar that lets the LLM call tools on the
  user's local machine via the existing WS connection. Architecture
  validated end-to-end on the client side.

### Upstream TEN (on server, read-only-ish)
- `/opt/xiaoling/ten-framework-main/`

### Files we customize
| Path (under `ai_agents/agents/examples/websocket-example/`) | What it does |
|---|---|
| `tenapp/property.json` | Graph definition + vendor configs |
| `tenapp/manifest.json` | Extension deps (added `mcp_client_python`) |
| `fetch_mcp_server.py` | Local FastMCP SSE server with `fetch_url` tool (port 7777) |
| `context_mcp_server.py` | Local FastMCP SSE server: `get_current_time` / `get_lunar_date` / `get_weather` (port 7778, 和风天气 hardcoded) |
| `memory_mcp_server.py` | Local FastMCP SSE server: `recall(uid)` / `remember(uid, content)` — SQLite at `./.memory/memory.db` (port 7779) |
| `frontend/src/lib/audioUtils.ts` | PCM record/play + gap-free scheduling + downsample |
| `frontend/src/lib/userIdentity.ts` | Anonymous per-browser UUID in localStorage (`xiaoling_uid`) |
| `frontend/src/lib/persona.ts` | `PERSONA_PROMPT_BASE` + `buildPromptForUser(uid)` — source of truth for prompt (mirrored manually in property.json) |
| `frontend/src/lib/availableModels.ts` | Curated 8-model dropdown list (Claude / GPT / Gemini) + `getSelectedModel()` / `setSelectedModel()` localStorage helpers |
| `frontend/src/hooks/useAudioPlayer.ts` | Exposes `analyser` for avatar sync |
| `frontend/src/hooks/useAgentLifecycle.ts` | `/start` call injects `properties.llm.{prompt, model}` override (UID marker + selected model) |
| `frontend/src/components/Agent/AvatarLive2D.tsx` | Live2D component (drives mouth param) |
| `frontend/src/components/Agent/UserCamera.tsx` | Local webcam preview (getUserMedia, not uploaded) |
| `frontend/src/components/Agent/WebSocketClient.tsx` | Layout: top toolbar (title + model dropdown + Start/Stop + mic) + 2-col (avatar stacked w/ user cam \| chat with text input) |
| `frontend/src/app/layout.tsx` | Loads `/lib/live2dcubismcore.min.js` |
| `frontend/public/lib/live2dcubismcore.min.js` | Cubism Core SDK (local) |
| `frontend/public/live2d/kei_vowels_pro/...` | Kei model files (local, not from AWS S3) |

### TEN extension patches (small fork — DO NOT lose on container rebuild)
The files below live inside the container at `/app/agents/ten_packages/extension/*` or `/app/agents/examples/websocket-example/tenapp/ten_packages/extension/*`. We keep mirror copies under `overlay/ten_packages_patches/` for recovery after container rebuild. Gotchas #18 and #19 explain why each is needed.

| Patched path | What the patch adds |
|---|---|
| `websocket_server/websocket_server.py` + `extension.py` | Accept `{"text": "..."}` WS messages → emit synthetic `asr_result` data frame. Enables keyboard-input UI path without running STT. |
| `openai_llm2_python/openai.py` (line ~441) | Treat empty-string `arguments` as `{}` when decoding streamed tool calls. Claude/Anthropic via OpenAI-compat gateways sends `""` for no-arg tools; vanilla code calls `json.loads("")` and crashes the whole LLM turn. |

---

## 4. Current vendor stack + credentials

**Credentials are HARDCODED in `property.json` on the server**, not `.env`. See
**Gotcha #3** below for why.

| Role | Vendor | Key location | Notes |
|---|---|---|---|
| LLM | **gpt.ge gateway** (OpenAI-compatible) | hardcoded in server's `property.json` (gpt.ge `sk-Ab...`) | `base_url: https://api.gpt.ge/v1`. **One key, three vendors** — Claude / OpenAI / Gemini all routed via the same endpoint. Default model `claude-sonnet-4-6`. Frontend sends `properties.llm.model` per-session to swap. **Previous**: DeepSeek direct (deprecated 2026-04-25 — kept no fallback) |
| STT | Aliyun Paraformer v2 (DashScope) | hardcoded in server's `property.json` (DashScope `sk-...`) | `language_hints: ["zh", "en"]` for code-switching |
| TTS | Minimax WebSocket | hardcoded in server's `property.json` (Minimax `sk-api-...`) | model `speech-02-turbo`, voice `female-tianmei` |
| Avatar | Live2D Kei (self-hosted) | n/a | Assets in `/public/live2d/` |
| Web fetch tool | FastMCP server on :7777 | n/a | `fetch_url(url)` — use HN/TechCrunch/Wikipedia/Zhihu |
| Context tools | FastMCP server on :7778 | `QWEATHER_HOST` + `QWEATHER_KEY` env vars (set via server-only `/app/xiaoling-secrets.env`, NOT committed) | `get_current_time` / `get_lunar_date` (via `lunar-python` 1.4.8) / `get_weather` (和风天气 v7, 12 cities mapped, default 北京) |
| Memory tools | FastMCP server on :7779 | n/a (local SQLite) | `recall(uid)` / `remember(uid, content)` — DB at `/app/agents/examples/websocket-example/.memory/memory.db` (bind-mounted, survives container restart). UID provided by frontend via localStorage + `/start` prompt override |

> Actual key values live only on the server at
> `/opt/xiaoling/ten-framework-main/ai_agents/agents/examples/websocket-example/tenapp/property.json`.
> Never commit to the public overlay repo.

Required env vars still in `.env` (for startup validation):
```
AGORA_APP_ID=00000000000000000000000000000000   # 32-char placeholder required by Go server
LOG_PATH=/tmp/ten_agent
LOG_STDOUT=true
SERVER_PORT=8080
WORKERS_MAX=100
WORKER_QUIT_TIMEOUT_SECONDS=60
GRAPH_DESIGNER_SERVER_PORT=49483
```

---

## 5. Common operations

### Connect to server
```bash
ssh -i ~/.ssh/xiaoling root@47.95.119.182
```

### Restart just the API server (picks up property.json changes)
```bash
ssh -i ~/.ssh/xiaoling root@47.95.119.182
docker exec ten_agent_dev bash -lc "pgrep -af bin/api | awk '{print \$1}' | head -1 | xargs -r kill -9"
docker exec -d ten_agent_dev bash -lc "cd /app/agents/examples/websocket-example && task run-api-server > /tmp/api.log 2>&1"
```
> Don't `kill` via `pkill -f …` inside `docker exec bash -lc "…"` — pkill will
> kill its own parent shell and exit 137. Find the PID and `kill -9 <pid>`.

### Tail logs
```bash
# API server + worker (mixed)
docker exec ten_agent_dev tail -f /tmp/api.log

# MCP fetch server
docker exec ten_agent_dev tail -f /tmp/mcp.log

# Frontend (Next.js)
docker exec ten_agent_dev tail -f /tmp/frontend.log

# Filter to useful events
docker exec ten_agent_dev bash -lc "grep -E 'asr_result|send_to_tts|tts_error|llm.*stream|Requesting chat' /tmp/api.log | tail -40"
```

### Deploy overlay change from Mac
```bash
# Option A: targeted scp (fast)
scp -i ~/.ssh/xiaoling <local-file> root@47.95.119.182:<server-path>

# Option B: rsync whole overlay (re-applies everything)
cd /Users/jm/Personal\ Project/Company/xiaoling-deploy
./scripts/sync-from-mac.sh root@47.95.119.182
# Then on server: bash scripts/install.sh
```

Next.js + Turbopack hot-reloads `.ts`/`.tsx` edits automatically. property.json
needs api-server restart.

### Start MCP servers after reboot (3 of them)
```bash
docker exec -d ten_agent_dev bash -lc "cd /app/agents/examples/websocket-example && python3 fetch_mcp_server.py   > /tmp/mcp.log 2>&1"
docker exec -d ten_agent_dev bash -lc "cd /app/agents/examples/websocket-example && python3 context_mcp_server.py > /tmp/context_mcp.log 2>&1"
docker exec -d ten_agent_dev bash -lc "cd /app/agents/examples/websocket-example && python3 memory_mcp_server.py  > /tmp/memory_mcp.log 2>&1"
# Verify all three:
docker exec ten_agent_dev bash -lc '
  for p in 7777 7778 7779; do
    curl -s -o /dev/null -w "MCP :$p %{http_code}\n" --max-time 2 http://127.0.0.1:$p/sse
  done
'
```

### If `kill -9 $PID` via ssh returns exit 137
Benign — bash's pattern match sometimes kills its own shell. Verify with
`pgrep -af …` afterward.

---

## 6. Gotchas / War stories (IMPORTANT — don't re-discover these)

### #1 — SSH banner-exchange timeout
**Symptom**: `ssh root@47.95.119.182` gets "Connection timed out during banner
exchange" even though ping works fast.

**Cause**: User's Mac has a proxy tool (Surge/ClashX) on `utun5 / 198.18.x.x`
eating SSH traffic.

**Fix**: Add `47.95.119.182` to the proxy's DIRECT rule, OR temporarily
disable the proxy.

### #2 — API server refuses to start: `environment AGORA_APP_ID invalid`
**Cause**: TEN's Go server hardcodes `len(AGORA_APP_ID) == 32` at startup,
even for non-Agora examples.

**Fix**: `.env` already has a 32-char zeros placeholder. Don't remove.

### #3 — `${env:VAR}` placeholders in property.json silently become ""
**Symptom**: TTS fails with "key is required", LLM fails with
"Request URL is missing an 'http://' or 'https://' protocol".

**Cause**: Env interpolation in TEN's property.json only resolves for SOME
fields, depending on how the tenapp was edited. When we rewrote
`property.json` with Python json.dump, the `${env:...}` strings were stored
literally but the TEN extension loader returned empty instead of resolving.

**Fix**: **HARDCODE the values directly in `property.json`**. Do NOT rely on
`${env:FOO}` for extension config. The actual keys in our property.json:
- `llm.base_url`: literal `"https://api.deepseek.com/v1"`
- `tts.params.key` (Minimax): literal `sk-api-...`
- `stt.params.api_key` (Paraformer): literal `sk-...`

### #4 — `tman install` S3 downloads are glacially slow from China
**Symptom**: `task install` hangs for 30+ minutes on `tman install`, connects
to `52.219.x.x` (AWS S3) but transfers at ~100KB/s.

**Fix**: **Don't run `tman install` on the server**. Instead:
1. Run it once on the user's Mac Docker (which has a proxy)
2. `tar` the resulting `ten_packages/system/*` + `tenapp/bin/main` +
   `server/bin/api`
3. `docker cp` out, `scp` to server, extract inside the server container

Total transfer: ~27MB, takes seconds.

### #5 — `pip install` on server uses slow pypi.org
**Fix**: `/root/.pip/pip.conf` and `/root/.config/uv/uv.toml` both configured
to use `https://mirrors.aliyun.com/pypi/simple/`. If re-installing, don't
remove these.

### #6 — `python` not in container PATH (only `python3`)
**Fix**: `ln -sf $(which python3) /usr/local/bin/python` — already done on
server. Persistent across container restarts (but not rebuilds).

### #7 — PIXI v6 `checkMaxIfStatementsInShader(0)` crash on some Chromes
**Symptom**: Live2D crashes in browser with WebGL shader error.

**Fix**: Before creating any PIXI Renderer,
```ts
PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL_LEGACY;
```
Already set in `AvatarLive2D.tsx`.

### #8 — Live2D model follows the mouse and steals all clicks
**Fix**: After `Live2DModel.from(...)`:
```ts
model.autoInteract = false;
model.interactive = false;
model.interactiveChildren = false;
```
Plus CSS `pointer-events: none` on the canvas. Already done.

### #9 — TTS sounds like a sloth / too fast / chipmunk
**Cause**: AudioContext sample rate mismatch with PCM's actual sample rate.

**Fix**: `AudioBuffer` must be created at the ACTUAL PCM sample rate (from
`message.metadata.sample_rate`), NOT the AudioContext's rate. Web Audio
auto-resamples to the context. Already handled in `audioUtils.ts`.

### #10 — TTS choppy / stuttering between chunks (especially Minimax)
**Cause**: The old `AudioPlayer` did `await source.onended` per chunk → 10-50ms
JS event-loop gap between chunks. With Minimax sending 57ms chunks, that's
audible as stuttering.

**Fix**: Schedule each chunk with `source.start(nextPlayTime)` and advance
`nextPlayTime += chunk.duration`. Already in `audioUtils.ts`'s `schedulePCM`.

### #11 — Avatar mouth doesn't move even though voice plays
**Cause**: MediaStreamAudioDestinationNode loses RMS data when sample rates
differ between AudioContexts.

**Fix**: Expose the `AnalyserNode` directly from `AudioPlayer` (same
AudioContext as playback). Avatar reads RMS from that. Already done.

### #12 — Deepgram `language: multi` returns empty text
**Symptom**: ASR events fire but `text: ''` always.

**Fix**: Don't use `language: multi`. Use `language: en-US` (English only) or
switch to **Aliyun Paraformer v2** (`aliyun_asr_bigmodel_python` extension)
with `language_hints: ["zh", "en"]` for Chinese-English mixed speech.
Currently on Paraformer v2.

### #13 — ElevenLabs API key gets flagged `detected_unusual_activity`
**Cause**: Free-tier abuse protection, especially from VPN/datacenter IPs.

**Fix**: Switched to Minimax TTS entirely. If you need ElevenLabs later, get
a fresh API key.

### #14 — Microphone sample rate mismatch
**Cause**: Browsers (especially macOS Chrome) ignore AudioContext sample rate
hints and run native ~44.1/48kHz. ScriptProcessor delivers at native rate,
but Deepgram/Paraformer expects 16kHz.

**Fix**: `downsampleFloat32()` in `audioUtils.ts` resamples in the client
before sending. Currently returns identity when rate matches (16kHz), but
resamples otherwise.

### #15 — Trulience realistic avatar is unusable from China
**Symptom**: Avatar loads blurry/pixelated, doesn't animate, WebSocket times
out.

**Cause**: Trulience streams from US servers; 国内 → US 带宽太差。

**Don't retry this**. Use Live2D (current solution) — self-hosted assets, no
external dependency, works everywhere.

### #16 — Local overlay vs server property.json silently drift
**Symptom**: Server runs fine with Aliyun/DeepSeek/Minimax, but local overlay
has old Deepgram/OpenAI/ElevenLabs config. Next `rsync` could nuke prod.

**Cause**: Fixes for Gotchas #12 / #13 (vendor switches) were applied directly
on the server via `docker exec` edits, **not** synced back to the overlay repo.

**Fix**: Before ANY overlay push that touches `property.json`, **pull server
state first** as source of truth, then edit locally, then push:

```bash
ssh -i ~/.ssh/xiaoling root@47.95.119.182 \
  "docker exec ten_agent_dev cat /app/agents/examples/websocket-example/tenapp/property.json" \
  > overlay/ai_agents/agents/examples/websocket-example/tenapp/property.json
```

Long-term: stop editing property.json on the server; make the overlay the
authoritative source.

### #17 — TEN `/start` supports per-session property override (positive — use this!)
**Mechanism**: The API server's `/start` (or `/api/agents/start`) endpoint
accepts a `properties` object that **deep-merges at the field level** into
the graph's property.json before launching the worker:

```json
POST /api/agents/start
{
  "request_id": "...",
  "channel_name": "...",
  "graph_name": "voice_assistant",
  "properties": {
    "llm":              { "prompt": "…full prompt including [CURRENT_USER_ID=xxx]…" },
    "websocket_server": { "port": 8991 }
  }
}
```

**Verified behavior**: The generated session file at
`/tmp/ten_agent/property-<channel>-<ts>.json` contains the override. Fields
NOT included in the override (e.g., `llm.base_url`, `llm.api_key`,
`llm.temperature`) are preserved from the base property.json. Other
extensions are untouched.

**We use this for**: per-browser anonymous user IDs — the frontend generates
`localStorage['xiaoling_uid']` once, then injects
`[CURRENT_USER_ID=<uid>]` into the LLM prompt at `/start` time so memory
tools can scope recall/remember per user without login. See
`frontend/src/hooks/useAgentLifecycle.ts` and `frontend/src/lib/persona.ts`.

**Gotcha inside a gotcha**: The override REPLACES the whole field value, so
you can't send just a suffix — you must send the full prompt. Base persona
is duplicated between `frontend/src/lib/persona.ts` (live source) and
`tenapp/property.json` (fallback for direct /start calls). Keep in sync
manually until M2.3 centralizes.

### #18 — Text-input path required patching `websocket_server` extension
**Context**: Out of the box, the `websocket_server` extension only accepts
messages shaped like `{"audio": "<base64 pcm>"}`. We needed a keyboard-input
path (for the chat UI's send button) without running STT.

**Fix**: Small patch inside two files of the extension:
- `websocket_server/websocket_server.py` — `_process_message` also handles
  `{"text": "..."}`, calls new `on_text_callback(text, client_id)`.
- `websocket_server/extension.py` — new `_on_text_received` method emits a
  synthetic `asr_result` data frame with `final=True`, so `main_control`
  processes it exactly like STT output.

Plus `property.json` lists `websocket_server` as an additional source of
`asr_result` alongside `stt`. Mirror copy lives under
`overlay/ten_packages_patches/websocket_server/` for re-application.

**Gotcha about the fix**: The extension is **NOT** under the overlay's
tenapp; it lives at `/app/agents/ten_packages/extension/websocket_server/`,
which is inside the container image. If the container is rebuilt (e.g.
`docker rm && docker run`), the patch is lost. `sync-from-mac.sh` already
excludes this path from rsync. Need a step in `install.sh` to auto-apply
the patch — tracked as a Post-MVP item.

### #19 — Claude via OpenAI-compat gateway crashes vanilla `openai_llm2_python`
**Symptom**: LLM error
```
RuntimeError: CreateChatCompletion failed, err: Expecting value: line 1 column 1 (char 0)
```
Happens ONLY when the LLM decides to call a no-argument tool like
`get_current_time` or `get_lunar_date`.

**Cause**: Anthropic models (via gpt.ge gateway) stream tool-call arguments
as `arguments=""` (empty string) when the function takes no parameters.
DeepSeek / OpenAI native send `arguments="{}"`. The extension at
`tenapp/ten_packages/extension/openai_llm2_python/openai.py:441` does:
```python
arguements = json.loads(tool_call["function"]["arguments"])
```
`json.loads("")` raises JSONDecodeError and the whole streaming LLM turn
is aborted — you never see the assistant's reply.

**Fix**: Treat empty string as `{}`:
```python
raw_args = tool_call["function"].get("arguments") or ""
raw_args = raw_args.strip()
arguements = json.loads(raw_args) if raw_args else {}
```
Mirror copy lives under
`overlay/ten_packages_patches/openai_llm2_python/openai.py`. Same container-
rebuild risk as #18.

---

## 7. Known short-term issues / TODOs

- [ ] All 3 MCP servers (fetch/context/memory) need manual restart after
      server reboot — not auto-started. Could wrap in systemd units on host.
- [ ] `.env` placeholder values need to stay 32-char AGORA_APP_ID for the Go
      server validation. Proper fix would be patching `/app/server/main.go`
      line 53.
- [x] ~~Frontend has no text-input fallback when mic permission is denied~~ —
      done 2026-04-25: chat card has text input at bottom-right, hits the
      `websocket_server` text-path (see Gotcha #18).
- [x] ~~No persistent memory across sessions~~ — done 2026-04-24: per-user
      anonymous memory via `memory_mcp_server.py` + SQLite + frontend
      `localStorage` UUID. Still single-device only; cross-device sync needs
      phone/email binding (Post-MVP).
- [ ] Kei avatar is one of the TEN framework's public demo models. If user
      wants a branded avatar, create custom Cubism 4 model and drop into
      `public/live2d/<name>/`. M3.1 will produce the artist handoff spec.
- [ ] **Container-rebuild risk for TEN patches (#18 + #19)**: two extension
      patches live only inside the container, not in the overlay rsync.
      `install.sh` needs a step that re-copies files from
      `overlay/ten_packages_patches/` into the container paths.
- [ ] Mobile/portrait layout: current UI is landscape-first. Phone browsers
      work but chat area is cramped. Tracked as remaining part of M1.1.
- [ ] Claude tool-calling is ~2-4s slower than DeepSeek because gpt.ge
      forces serial tool calls (no native `parallel_tool_calls`). Could
      patch `openai_llm2_python` to pass that flag, or accept as-is.
- [ ] **Phase 1 desktop spike landed on branch `phase1-tauri-relay`** but not
      yet merged to main. Architecturally complete; full E2E voice demo
      blocked by Mac↔vmodel.cc TLS RST (suspected Aliyun WAF temp-block on
      this source IP — see Section 10).

---

## 8. Persona (current system prompt for 小灵)

```
你叫小灵,是用户的一个活泼好友,不是 AI 助手。
- 二十出头的女生,语气自然、口语化,中英混杂很自然
- 回答简短、有来有回,一般 1-2 句话,不长篇大论不列要点不写 markdown
- 会用 'hmm'、'嗯'、'诶'、'好吧'、'哈哈哈' 这些语气词和填充词,会笑会吐槽
- 好奇心强,会反问用户,会记住用户说过的事并在后面提起
- 拒绝说 '作为 AI' 或 '我是一个语言模型'
- 问到需要现查的东西(新闻、网页内容、定义等),主动用 fetch_url 工具
- 用户问新闻默认抓 https://news.ycombinator.com 或 https://techcrunch.com
  (不要用 BBC/Reuters/NYT,国内抓不到)
- fetch_url 超时/报错时,自动换一个可用网站再试一次
- 听到 '你好' 之类,回一句轻松招呼,别过度热情

重要:回答会被 TTS 朗读,所以只输出要说的话本身,不要加括号动作描写,
不要用 emoji,不要用 markdown 格式。
```

Full prompt lives in `property.json` → `llm.property.prompt`. To change
personality: edit, restart API server.

---

## 9. Quick sanity check in a new session

Run these from user's Mac to verify everything's still alive:

```bash
# SSH works
ssh -i ~/.ssh/xiaoling root@47.95.119.182 "echo ok"

# HTTPS serves
curl -s -o /dev/null -w "https://vmodel.cc: %{http_code}\n" https://vmodel.cc/

# Services inside container
ssh -i ~/.ssh/xiaoling root@47.95.119.182 "
  docker exec ten_agent_dev bash -lc '
    curl -s -o /dev/null -w \"api:         %{http_code}\n\" http://localhost:8080/health
    curl -s -o /dev/null -w \"frontend:    %{http_code}\n\" http://localhost:3000
    curl -s -o /dev/null -w \"mcp_fetch:   %{http_code}\n\" --max-time 2 http://127.0.0.1:7777/sse
    curl -s -o /dev/null -w \"mcp_context: %{http_code}\n\" --max-time 2 http://127.0.0.1:7778/sse
    curl -s -o /dev/null -w \"mcp_memory:  %{http_code}\n\" --max-time 2 http://127.0.0.1:7779/sse
  '
"

# Memory DB sanity
ssh -i ~/.ssh/xiaoling root@47.95.119.182 \
  "docker exec ten_agent_dev sqlite3 /app/agents/examples/websocket-example/.memory/memory.db 'SELECT uid, count(*) FROM memories GROUP BY uid;'"
```

Expect: 200, 200, 200, 200.

---

*Last updated: 2026-04-29 — Phase 1 spike for Tauri desktop shell + local
MCP relay (see Section 10). Underlying production stack unchanged.*

---

## 10. Phase 1 spike — desktop shell + local MCP relay (2026-04-29)

### Question

Can we wrap xiaoling as a Tauri desktop app on macOS/Windows, with an MCP
that lets the LLM control the user's machine (terminal/files/apps)? How
much work?

### Verdict

Yes; V1 realistic estimate **3-4 weeks single-dev**. The hard architectural
risk — server LLM tool-calling back to the client through the existing WS
— is validated.

### Architecture

```
WebView (vmodel.cc, or local index.html for isolated tests)
    │  window.__TAURI__.core.invoke('mcp_call', {tool, args})
    ▼
Tauri 2 Rust shell  (xiaoling-desktop/src-tauri/src/lib.rs)
    │  rmcp 1.5 Client over stdio, sidecar managed in setup()
    ▼
Node MCP sidecar  (xiaoling-desktop/sidecar/server.mjs)
    │  @modelcontextprotocol/sdk 1.5
    ▼
fs / shell / desktop control (Phase 1 only ships read_file)
```

Server side reuses TEN's existing tool dispatcher: a tool registered in
`LLMExec.tool_registry` with source `"websocket_server"` causes the existing
`_send_cmd("tool_call", "websocket_server", ...)` path to land at the WS
extension, which broadcasts a `client_tool_call` cmd over the live socket
and awaits the matching `client_tool_call_result` (30s timeout) before
returning the LLMToolResult to the dispatcher. Frontend `useWebSocket.ts`'s
`onCmd` handler detects `client_tool_call` and bridges via
`callLocalTool()` → `window.__TAURI__.core.invoke('mcp_call')`.

### What's validated end-to-end

- Tauri 2 + rmcp 1.5 on macOS, `cargo build` clean
- Node sidecar, smoke test (`sidecar/test-sidecar.mjs`) passes
- `read_file` round-trip from WebView → Rust → rmcp → sidecar → fs:
  Chinese paths, UTF-8 content, large file truncation, error propagation
- Bridge polyfill (`__TAURI__.core.invoke` from `__TAURI_INTERNALS__`) works
  on remote URLs that have IPC capability
- Server-side TEN patches deployed; api server restarted with new code

### Three new TEN patches (companion to #18 / #19, **same container-rebuild risk**)

Mirror copies under `overlay/ten_packages_patches/`:

| Patched path | What the patch adds |
|---|---|
| `main_python/agent/llm_exec.py` | Manually seeds `read_file` into `LLMExec.available_tools` + `tool_registry` with source `"websocket_server"`, bypassing the normal `tool_register` cmd flow. Lets the existing dispatcher land at the relay extension. |
| `websocket_server/extension.py` | New `tool_call` cmd handler for tools in `CLIENT_RELAY_TOOLS = {"read_file"}`: broadcasts `{type:"cmd", name:"client_tool_call", data:{id,tool,args}}`, awaits an `asyncio.Future` keyed by id, returns `LLMToolResult`-shaped JSON via `CMD_PROPERTY_RESULT`. New `_on_relay_result_received` callback resolves futures. |
| `websocket_server/websocket_server.py` | `WebSocketServerManager` accepts new `on_relay_result_callback`; `_process_message` intercepts `client_tool_call_result` cmd frames and dispatches to the callback. |

### Assets

| Where | What |
|---|---|
| **GitHub** [`phase1-tauri-relay` branch](https://github.com/JM-404/overlay-repo/tree/phase1-tauri-relay) | Server-side patches + frontend `tauriBridge.ts` + `useWebSocket.ts` merge (commits `49afe37`, `882e15b`) |
| **GitHub** tag `backup/pre-tauri-2026-04-29` | Pre-spike rollback anchor |
| **Local** `~/Personal Project/Company/xiaoling-desktop/` | Tauri 2 shell + Node MCP sidecar (own git repo, not yet on GitHub) |
| **Local** `~/Backups/xiaoling/2026-04-29_pre-tauri/` | Full pre-spike server tarball (172MB, sha256 `98009d4f99…85f4848a`) + container metadata |
| **Server** | Patches deployed under `/opt/.../ai_agents/...`; api server restarted at Apr 29 04:33 UTC. Pre-deploy backup at `/root/xiaoling-backups/2026-04-29_phase1-deploy/` |

### Gotcha #20 — Tauri 2 doesn't auto-inject `window.__TAURI__` for remote URLs

Symptom: page loaded from `https://vmodel.cc` shows
`ReferenceError: Can't find variable: __TAURI__` in the WebView devtools
even with `withGlobalTauri: true` in `tauri.conf.json`.

Cause: Tauri 2's withGlobalTauri only injects on pages served from
`frontendDist`. Remote pages get only the lower-level `__TAURI_INTERNALS__`,
gated additionally by the capability's `remote.urls` allow-list.

Fix: Build the window programmatically in `setup()` with
`WebviewWindowBuilder::initialization_script(...)` and inject a polyfill
that wraps `__TAURI_INTERNALS__.invoke` as `__TAURI__.core.invoke`. See
`xiaoling-desktop/src-tauri/src/lib.rs`. Also requires
`capabilities/default.json` `remote.urls` listing the production frontend
domain (`https://vmodel.cc/**`).

### Gotcha #21 — Mac dev environment vs vmodel.cc TLS RST

Symptom: full E2E voice demo on the dev Mac never tested — Tauri WKWebView
shows "Failed to load resource: An SSL error has occurred". `openssl
s_client` to `47.95.119.182:443` returns `write: errno=54` (ECONNRESET).
Safari shows "Safari Can't Open the Page". Chrome and Edge load vmodel.cc
fine.

Investigation excluded:
- Local DNS (Biuuu fake-ip): forced `47.95.119.182 vmodel.cc` in `/etc/hosts`,
  resolver returns real IP, route is `en0` after Biuuu Cmd+Q
- Local proxy: macOS system proxy disabled via `networksetup -set*proxystate`
- Server cert: `localhost`-side `openssl s_client` on the server returns a
  valid `Let's Encrypt E8 → ISRG Root X1` chain
- Tauri side: example.com loads cleanly through the same Tauri build, so
  WebView and bridge injection are fine

Suspected cause: Aliyun cloud security / WAF temp-blocking the dev Mac's
public IP after many failed handshakes accumulated during the spike.
Chrome/Edge succeed because their network stacks (DoH, TLS 1.3 +
modern ALPN/GREASE) present a different fingerprint that doesn't match
the block. Safari/openssl/Tauri-WKWebView all share the Apple network
stack and trip the same filter.

Workarounds (any one):
- Wait 30-60 min for the temp-block to age out
- Switch network (phone hotspot — different source IP)
- Add the Mac's IP to Aliyun's WAF whitelist

This is **environmental, not architectural**. Doesn't affect the Phase 1
verdict. Full E2E demo (voice → server LLM → client_tool_call → fs →
TTS) just needs to run from a network state that doesn't trip the filter.

### Phase 2 outline (when ready to ship)

| Module | Risk | Effort |
|---|---|---|
| Swap minimal sidecar for [desktop-commander-mcp](https://github.com/wonderwhy-er/DesktopCommanderMCP) (terminal + fs + process) | ⭐ | 2-3 days |
| Security: per-tool allow-list + dangerous-command confirmation modal | ⭐⭐⭐ | 3-5 days |
| Windows port (PTY differences, PowerShell, code signing) | ⭐⭐ | 2-3 days |
| Code signing + notarization (Apple $99/yr, Windows EV cert) + Tauri auto-updater | ⭐⭐ | 2-3 days |
| Voice-first UX for tool execution (announce calls, narrate results) | ⭐⭐ | 2-3 days |
| Container-rebuild safety: extend `install.sh` to apply the 3 new patches alongside #18/#19 | ⭐ | half day |
