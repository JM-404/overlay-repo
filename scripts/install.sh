#!/usr/bin/env bash
# =============================================================================
# Xiaoling voice assistant — server install script
# Run on a fresh Ubuntu 22.04 ECS with Docker pre-installed.
# =============================================================================
set -euo pipefail

REPO_DIR="/opt/xiaoling"
TEN_VERSION="main"  # upstream branch / tag
TEN_REPO="https://github.com/TEN-framework/TEN-Agent.git"
OVERLAY_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== 1/5  Creating project directory ==="
sudo mkdir -p "$REPO_DIR"
sudo chown "$(whoami)" "$REPO_DIR"

echo "=== 2/5  Cloning TEN framework (upstream) ==="
if [ -d "$REPO_DIR/ten-framework-main" ]; then
  echo "  Already cloned, pulling latest..."
  cd "$REPO_DIR/ten-framework-main" && git pull --ff-only || true
else
  git clone --depth 1 -b "$TEN_VERSION" "$TEN_REPO" "$REPO_DIR/ten-framework-main"
fi

echo "=== 3/5  Applying overlay (your customizations) ==="
cp -rv "$OVERLAY_DIR/overlay/"* "$REPO_DIR/ten-framework-main/"

echo "=== 4/5  Copying .env ==="
if [ -f "$OVERLAY_DIR/.env" ]; then
  cp "$OVERLAY_DIR/.env" "$REPO_DIR/ten-framework-main/ai_agents/.env"
  echo "  .env copied."
elif [ -f "$REPO_DIR/ten-framework-main/ai_agents/.env" ]; then
  echo "  .env already exists on server, keeping it."
else
  cp "$OVERLAY_DIR/.env.example" "$REPO_DIR/ten-framework-main/ai_agents/.env"
  echo "  ⚠️  Copied .env.example → .env. You MUST edit it with real API keys!"
fi

echo "=== 5/5  Installing Caddy (if not present) ==="
if ! command -v caddy &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -qq && sudo apt-get install -y -qq caddy
fi
echo "  Caddy $(caddy version) installed."
echo ""
echo "=== Done! Next steps: ==="
echo "  1. Edit $REPO_DIR/ten-framework-main/ai_agents/.env with your API keys"
echo "  2. Edit $OVERLAY_DIR/caddy/Caddyfile — replace xiaoling.example.com with your domain"
echo "  3. sudo cp $OVERLAY_DIR/caddy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy"
echo "  4. cd $REPO_DIR/ten-framework-main/ai_agents && docker compose up -d"
echo "  5. bash $OVERLAY_DIR/scripts/start-services.sh"
