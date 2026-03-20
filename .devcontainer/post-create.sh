#!/bin/bash
# Runs once after the dev container is created.
# Sets up pnpm, installs dependencies, wires up the database, and seeds it.

set -e

WORKSPACE="/workspace"

# Fix ownership on named volumes (Docker creates them as root; container user is node)
sudo chown -R node:node /home/node/.claude 2>/dev/null || true

echo "=== Ship Dev Container Setup ==="

# Disable SSL strict mode (government VPN environments)
npm config set strict-ssl false
npm install -g pnpm@10
pnpm config set strict-ssl false

echo "Installing dependencies..."
cd "$WORKSPACE"
# HUSKY=0 skips the prepare script so husky doesn't fail with EPERM on the
# volume-mounted .husky/_/ directory (may be owned by a different uid on host).
HUSKY=0 pnpm install
# Set up husky hooks explicitly after clearing any stale root-owned directory.
rm -rf .husky/_
pnpm exec husky

echo "Building shared types..."
pnpm build:shared

# Pre-create api/.env.local so dev.sh skips its local-postgres setup block.
# DATABASE_URL points to the postgres service inside the Docker network.
if [ ! -f "$WORKSPACE/api/.env.local" ]; then
  echo "Creating api/.env.local..."
  cat > "$WORKSPACE/api/.env.local" << 'EOF'
DATABASE_URL=postgres://ship:ship_dev_password@postgres:5432/ship_dev
SESSION_SECRET=dev-secret-change-in-production
EOF
fi

echo "Running database migrations..."
cd "$WORKSPACE"
DATABASE_URL=postgres://ship:ship_dev_password@postgres:5432/ship_dev \
  pnpm --filter @ship/api db:migrate

echo "Seeding database..."
DATABASE_URL=postgres://ship:ship_dev_password@postgres:5432/ship_dev \
  pnpm --filter @ship/api db:seed

echo "Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

echo "Installing Railway CLI..."
npm install -g @railway/cli

echo "Installing GitHub CLI..."
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt-get update -qq && sudo apt-get install -y gh

echo "Setting up Playwright for E2E tests..."
# Install Docker CLI (needed by testcontainers for isolated E2E test environments)
sudo apt-get install -y docker-cli 2>/dev/null || true
# Allow the node user to access the Docker socket (mounted from host).
# Two-layer fix:
#   1. Create a 'docker' group matching the socket's GID and add 'node' to it
#      (persists across restarts as long as the container isn't recreated)
#   2. chmod 666 as immediate fallback
DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo "")
if [ -n "$DOCKER_GID" ] && [ "$DOCKER_GID" != "0" ]; then
  sudo groupadd -g "$DOCKER_GID" docker 2>/dev/null || true
  sudo usermod -aG docker node 2>/dev/null || true
fi
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
# Install Playwright browser and its system dependencies
npx playwright install chromium
sudo npx playwright install-deps chromium

echo ""
echo "=== Setup complete! ==="
echo "Run 'pnpm dev' to start the API and web servers."
echo "  API:  http://localhost:3000"
echo "  Web:  http://localhost:5173"
