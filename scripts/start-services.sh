#!/usr/bin/env bash
# =============================================================================
# Start the 3 services inside the ten_agent_dev Docker container.
# Idempotent — kills any running instances first.
# =============================================================================
set -euo pipefail

CONTAINER="ten_agent_dev"
EXAMPLE="agents/examples/websocket-example"

echo "=== Checking container ==="
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: Container '$CONTAINER' not running. Did you run 'docker compose up -d'?"
  exit 1
fi

# Helper: run inside the container
dexec() { docker exec "$CONTAINER" bash -lc "$1"; }

echo "=== Stopping existing services (if any) ==="
dexec "pkill -f 'bin/api' 2>/dev/null || true"
dexec "pkill -f 'bun run dev' 2>/dev/null || true"
dexec "pkill -f 'next dev' 2>/dev/null || true"
dexec "pkill -f 'fetch_mcp_server' 2>/dev/null || true"
sleep 2

echo "=== Creating python symlink (if missing) ==="
dexec "which python >/dev/null 2>&1 || ln -sf \$(which python3) /usr/local/bin/python"

echo "=== Installing deps (first run only — skips if already done) ==="
dexec "cd /app/${EXAMPLE} && task install" 2>&1 | tail -5

echo "=== Starting MCP Fetch server (:7777) ==="
docker exec -d "$CONTAINER" bash -lc \
  "cd /app/${EXAMPLE} && python3 fetch_mcp_server.py > /tmp/mcp-fetch.log 2>&1"
sleep 2

echo "=== Starting API server (:8080) ==="
docker exec -d "$CONTAINER" bash -lc \
  "cd /app/${EXAMPLE} && task run-api-server > /tmp/ws-api.log 2>&1"
sleep 3

echo "=== Starting Frontend (:3000) ==="
docker exec -d "$CONTAINER" bash -lc \
  "cd /app/${EXAMPLE} && task run-frontend > /tmp/ws-frontend.log 2>&1"
sleep 5

echo "=== Health check ==="
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:8080/health 2>/dev/null || echo "000")
FE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000 2>/dev/null || echo "000")
MCP_STATUS=$(docker exec "$CONTAINER" bash -lc "curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:7777/sse 2>/dev/null || echo 000")

echo ""
echo "  API  server (8080):  $API_STATUS"
echo "  Frontend     (3000):  $FE_STATUS"
echo "  MCP fetch    (7777):  $MCP_STATUS"
echo ""

if [ "$API_STATUS" = "200" ] && [ "$FE_STATUS" = "200" ]; then
  echo "✅ All services up! Visit https://your-domain.com in your browser."
else
  echo "⚠️  Some services failed. Check logs:"
  echo "    docker exec $CONTAINER tail -30 /tmp/ws-api.log"
  echo "    docker exec $CONTAINER tail -30 /tmp/ws-frontend.log"
  echo "    docker exec $CONTAINER tail -30 /tmp/mcp-fetch.log"
fi
