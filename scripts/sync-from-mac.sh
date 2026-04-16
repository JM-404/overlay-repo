#!/usr/bin/env bash
# =============================================================================
# Quick rsync from your Mac to the server.
# Usage:   ./scripts/sync-from-mac.sh user@server-ip
# =============================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 user@server-ip"
  exit 1
fi

REMOTE="$1"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

rsync -avz --progress \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '__pycache__' \
  --exclude '.DS_Store' \
  "$LOCAL_DIR/" "${REMOTE}:/opt/xiaoling/xiaoling-deploy/"

echo ""
echo "Synced. Now SSH in and run:"
echo "  ssh $REMOTE"
echo "  cd /opt/xiaoling/xiaoling-deploy"
echo "  bash scripts/install.sh   # first time, or after overlay changes"
echo "  bash scripts/start-services.sh"
