# Xiaoling Deploy

Thin overlay repo for deploying a customized [TEN Framework](https://github.com/TEN-framework/TEN-Agent) voice assistant ("小灵") to a Chinese cloud ECS.

## What's in here

```
overlay/          # Files that patch on top of upstream TEN
  ai_agents/agents/examples/websocket-example/
    tenapp/property.json       # Graph: Deepgram STT → OpenAI LLM → OpenAI TTS + MCP fetch
    tenapp/manifest.json       # Added mcp_client_python dependency
    fetch_mcp_server.py        # FastMCP SSE server exposing a fetch_url tool
    frontend/src/lib/audioUtils.ts      # Fix: respect TTS sample rate (24kHz)
    frontend/src/hooks/useAudioPlayer.ts # Fix: pass metadata.sample_rate

caddy/Caddyfile   # Reverse proxy with auto-HTTPS
scripts/
  install.sh          # One-command server bootstrap
  start-services.sh   # Start API + frontend + MCP inside Docker
  sync-from-mac.sh    # rsync overlay to server from dev machine
.env.example          # Template for API keys (never commit real .env!)
DEPLOYMENT.md         # Full step-by-step deployment guide
```

## Quick start

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full guide.
