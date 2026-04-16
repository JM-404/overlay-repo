# Deployment Guide

Deploy the Xiaoling voice assistant to an Alibaba Cloud (or similar) ECS instance with HTTPS and domestic AI vendors.

---

## 1. Server setup

### 1.1 Purchase ECS

| Item | Recommended |
|---|---|
| Instance type | `ecs.c7.xlarge` (4 vCPU, 8 GB RAM) |
| OS | Ubuntu 22.04 LTS |
| Disk | 60 GB SSD |
| Bandwidth | 5 Mbps fixed |
| Region | Same region as most users |
| Security group | Open ports: 22, 80, 443 |

> No GPU required. All AI inference is done via vendor APIs.

### 1.2 Install Docker

```bash
ssh root@<your-server-ip>

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
docker compose version
```

### 1.3 Install Git

```bash
sudo apt-get update && sudo apt-get install -y git
```

---

## 2. Deploy

### 2.1 Clone this overlay repo

```bash
cd /opt
git clone https://github.com/JM-404/overlay-repo.git xiaoling-deploy
cd xiaoling-deploy
```

### 2.2 Configure `.env`

```bash
cp .env.example .env
nano .env   # Fill in your API keys (see "Vendor selection" below)
```

### 2.3 Run installer

```bash
bash scripts/install.sh
```

This will:
1. Clone the upstream TEN framework to `/opt/xiaoling/ten-framework-main/`
2. Copy your overlay files on top
3. Copy `.env` into the right place
4. Install Caddy

### 2.4 Configure domain + HTTPS

Edit `caddy/Caddyfile` — replace `xiaoling.example.com` with your subdomain:

```bash
nano caddy/Caddyfile
sudo cp caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Make sure your DNS A record points to the server's public IP.

### 2.5 Start Docker + services

```bash
cd /opt/xiaoling/ten-framework-main/ai_agents
docker compose up -d

# Wait for container to be healthy (~30s)
docker ps   # Should show ten_agent_dev Up

# Start API + frontend + MCP server
cd /opt/xiaoling-deploy
bash scripts/start-services.sh
```

### 2.6 Verify

Open `https://xiaoling.yourdomain.com` in Chrome. You should see the voice assistant UI. Click the microphone to start talking.

---

## 3. Vendor selection (domestic)

For Chinese cloud servers, OpenAI / Deepgram / ElevenLabs are unreachable. Replace them with domestic alternatives.

### 3.1 LLM — use Moonshot, DeepSeek, or Qwen

The `openai_llm2_python` extension is **OpenAI-API-compatible**, so you only need to change `base_url` and `api_key` in `property.json`:

```json
{
  "name": "llm",
  "addon": "openai_llm2_python",
  "property": {
    "base_url": "https://api.moonshot.cn/v1",
    "api_key": "${env:MOONSHOT_API_KEY}",
    "model": "moonshot-v1-8k",
    ...
  }
}
```

| Vendor | base_url | Model | Sign up |
|---|---|---|---|
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | https://platform.moonshot.cn |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | https://platform.deepseek.com |
| Zhipu (GLM) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | https://open.bigmodel.cn |
| Aliyun (Qwen) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | https://dashscope.console.aliyun.com |

### 3.2 STT — switch extension

Change the `stt` node's `addon` in `property.json`. Available domestic ASR extensions:

| Extension | Vendor | Required env vars |
|---|---|---|
| `aliyun_asr` | Aliyun Intelligent Speech | `ALIYUN_ASR_APPKEY`, `ALIYUN_ASR_TOKEN` |
| `bytedance_asr` | Volcengine (Bytedance) | `BYTEDANCE_ASR_APPID`, `BYTEDANCE_ASR_TOKEN` |
| `tencent_asr_python` | Tencent Cloud ASR | `TENCENT_ASR_APP_ID`, `TENCENT_ASR_SECRET_ID`, `TENCENT_ASR_SECRET_KEY` |
| `xfyun_asr_python` | iFlytek | `XFYUN_APP_ID`, `XFYUN_API_KEY`, `XFYUN_API_SECRET` |

Example (switching to Aliyun):
```json
{
  "name": "stt",
  "addon": "aliyun_asr",
  "property": {
    "appkey": "${env:ALIYUN_ASR_APPKEY}",
    "token": "${env:ALIYUN_ASR_TOKEN}"
  }
}
```

### 3.3 TTS — switch extension

Change the `tts` node. Domestic TTS options:

| Extension | Vendor | Required env vars |
|---|---|---|
| `minimax_tts_websocket_python` | Minimax (streaming) | `MINIMAX_TTS_API_KEY`, `MINIMAX_TTS_GROUP_ID` |
| `bytedance_tts_duplex` | Volcengine | `BYTEDANCE_TTS_APPID`, `BYTEDANCE_TTS_TOKEN` |
| `cosy_tts_python` | Aliyun CosyVoice | `COSY_TTS_KEY` |
| `tencent_tts_python` | Tencent Cloud | (same as ASR creds) |

Example (Minimax streaming):
```json
{
  "name": "tts",
  "addon": "minimax_tts_websocket_python",
  "property": {
    "params": {
      "key": "${env:MINIMAX_TTS_API_KEY}",
      "group_id": "${env:MINIMAX_TTS_GROUP_ID}",
      "model": "speech-02-turbo",
      "audio_setting": { "sample_rate": 16000 },
      "voice_setting": { "voice_id": "Chinese_KindLady" }
    }
  }
}
```

> After changing property.json, restart with `bash scripts/start-services.sh`.

---

## 4. Iteration workflow (from your Mac)

```bash
# Edit files locally (overlay/ or .env)
# Then sync to server:
./scripts/sync-from-mac.sh root@<server-ip>

# SSH in:
ssh root@<server-ip>
cd /opt/xiaoling-deploy

# Re-apply overlay:
bash scripts/install.sh

# Restart services:
bash scripts/start-services.sh
```

For **property.json changes only** (prompt tweaks, voice swaps), you can skip `install.sh` and just run `start-services.sh` — it kills and restarts everything.

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Frontend loads but mic doesn't work | Must use HTTPS. Check Caddy config and certificate. |
| "Connecting to WebSocket..." stuck | Clear browser localStorage, hard refresh (Cmd+Shift+R). |
| TTS sounds like a sloth (slow) | Sample rate mismatch. Use the patched `audioUtils.ts` from overlay. |
| MCP fetch_url returns ConnectTimeout | The target URL is unreachable from your server. Try different sites (HN, TechCrunch). |
| Worker crashes on startup | Check `docker exec ten_agent_dev tail -50 /tmp/ws-api.log`. Common cause: missing extension in manifest.json or missing Python dep. |
| `python: not found` inside container | `docker exec ten_agent_dev ln -sf $(which python3) /usr/local/bin/python` |

---

## 6. Architecture

```
Browser (HTTPS)
    │
    ▼
Caddy :443 ──► reverse_proxy ──► localhost:3000 (Next.js frontend)
                                       │
                                       ├── /api/agents/* ──► localhost:8080 (Go API server)
                                       └── /ws/{port}   ──► localhost:{port} (WebSocket worker)

Docker container (ten_agent_dev):
  ├── Go API server (:8080)
  │     └── spawns TEN workers on /start
  ├── TEN worker (dynamic :8000-9000)
  │     ├── websocket_server (audio in/out)
  │     ├── deepgram_asr / aliyun_asr (STT)
  │     ├── openai_llm2 (LLM, OpenAI-compatible)
  │     ├── openai_tts2 / minimax_tts (TTS)
  │     ├── mcp_client_python → MCP SSE :7777
  │     └── main_python (orchestrator)
  ├── FastMCP fetch server (:7777)
  └── Next.js frontend (:3000)
```
