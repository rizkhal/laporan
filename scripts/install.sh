#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# laporan — One-command install
# https://github.com/rizkhal/laporan
# ═══════════════════════════════════════════════════════════════
#
# Usage:
#   curl -fsSL https://get-laporan.rizkal.space | bash
#
# Or with environment variables for non-interactive setup:
#   curl -fsSL https://get-laporan.rizkal.space | \
#     ADMIN_EMAIL="admin@example.com" \
#     ADMIN_PASSWORD="change-me-123" \
#     LLM_API_KEY="sk-..." \
#     bash
#
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Defaults ──
INSTALL_DIR="${INSTALL_DIR:-/opt/laporan}"
REPO_URL="${REPO_URL:-https://github.com/rizkhal/laporan.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"
LAPORAN_USER="${LAPORAN_USER:-laporan}"

ADMIN_NAME="${ADMIN_NAME:-Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

LLM_BASE_URL="${LLM_BASE_URL:-https://api.openai.com/v1}"
LLM_API_KEY="${LLM_API_KEY:-}"
LLM_MODEL="${LLM_MODEL:-gpt-4o-mini}"

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}⟹${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }

# ── Sanity checks ──
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root."
  info "Try: curl -fsSL https://get-laporan.rizkal.space | sudo bash"
  exit 1
fi

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" != "Linux" ]]; then
  err "Unsupported OS: $OS. Only Linux is supported."
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# Banner
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}  ╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}  ║       laporan — Installer           ║${NC}"
echo -e "${BLUE}  ║   Monthly Engineering Reports        ║${NC}"
echo -e "${BLUE}  ╚══════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# 1 ── Install system dependencies
# ═══════════════════════════════════════════════════════════════
info "Installing system dependencies..."

apt-get update -qq

# Install git, curl if missing
DEPS=""
for dep in git curl; do
  if ! command -v "$dep" &>/dev/null; then
    DEPS="$DEPS $dep"
  fi
done

if [[ -n "$DEPS" ]]; then
  apt-get install -y -qq $DEPS
fi
ok "System dependencies ready"

# ═══════════════════════════════════════════════════════════════
# 2 ── Check / Install Node.js
# ═══════════════════════════════════════════════════════════════
info "Checking Node.js..."

install_nodejs() {
  warn "Node.js 18+ not found. Installing Node.js 20 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
}

if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    ok "Node.js $(node -v) found"
  else
    warn "Node.js $(node -v) is too old"
    install_nodejs
  fi
else
  install_nodejs
fi

if ! command -v npm &>/dev/null; then
  err "npm not found. Try rebooting or install manually: apt-get install -y npm"
  exit 1
fi
ok "npm $(npm -v) found"

# ═══════════════════════════════════════════════════════════════
# 3 ── Create system user
# ═══════════════════════════════════════════════════════════════
info "Creating system user..."
if id "$LAPORAN_USER" &>/dev/null; then
  ok "User $LAPORAN_USER already exists"
else
  useradd --system --create-home --shell /usr/sbin/nologin "$LAPORAN_USER" 2>/dev/null || true
  ok "User $LAPORAN_USER created"
fi

# ═══════════════════════════════════════════════════════════════
# 4 ── Clone / pull repository
# ═══════════════════════════════════════════════════════════════
info "Cloning repository..."

if [[ -d "$INSTALL_DIR/.git" ]]; then
  warn "$INSTALL_DIR already exists. Pulling latest changes..."
  cd "$INSTALL_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth=1 -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
ok "Repository ready at $INSTALL_DIR"

# ═══════════════════════════════════════════════════════════════
# 5 ── Install npm dependencies
# ═══════════════════════════════════════════════════════════════
info "Installing npm dependencies..."
cd "$INSTALL_DIR"
npm install 2>&1 | tail -1
ok "Dependencies installed"

# ═══════════════════════════════════════════════════════════════
# 6 ── Build frontend
# ═══════════════════════════════════════════════════════════════
info "Building frontend..."
cd "$INSTALL_DIR"
npm run build 2>&1 | tail -1
ok "Frontend built"

# ═══════════════════════════════════════════════════════════════
# 7 ── Configure environment
# ═══════════════════════════════════════════════════════════════
if [[ -f "$INSTALL_DIR/apps/api/.env" ]]; then
  ok "Environment file exists (skipping)"
else
  info "Configuring environment..."

  # Redirect stdin to terminal for interactive prompts when piped
  if [[ ! -t 0 ]]; then
    exec </dev/tty
  fi

  SERVER_IP=$(curl -4 -s ifconfig.me 2>/dev/null || curl -4 -s icanhazip.com 2>/dev/null || echo "localhost")

  if [[ -z "$ADMIN_EMAIL" ]]; then
    printf "  Admin email: " && read -r ADMIN_EMAIL
  fi
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    printf "  Admin password (min 6 chars): " && read -rs ADMIN_PASSWORD
    echo ""
  fi
  if [[ -z "$LLM_API_KEY" ]]; then
    printf "  LLM API Key (https://platform.openai.com/api-keys): " && read -rs LLM_API_KEY
    echo ""
  fi

  printf "  Frontend URL [http://%s:%s]: " "$SERVER_IP" "$PORT"
  read -r FRONTEND_URL_INPUT
  FRONTEND_URL="${FRONTEND_URL_INPUT:-http://$SERVER_IP:$PORT}"

  printf "  LLM Base URL [%s]: " "$LLM_BASE_URL"
  read -r LLM_BASE_URL_INPUT
  LLM_BASE_URL="${LLM_BASE_URL_INPUT:-$LLM_BASE_URL}"

  printf "  LLM Model [%s]: " "$LLM_MODEL"
  read -r LLM_MODEL_INPUT
  LLM_MODEL="${LLM_MODEL_INPUT:-$LLM_MODEL}"

  cat > "$INSTALL_DIR/apps/api/.env" << EOF
PORT=$PORT
FRONTEND_URL=$FRONTEND_URL
LLM_BASE_URL=$LLM_BASE_URL
LLM_API_KEY=$LLM_API_KEY
LLM_MODEL=$LLM_MODEL
NODE_ENV=production
EOF
  ok "Environment configured"
fi

# ═══════════════════════════════════════════════════════════════
# 8 ── Create admin account (start server temporarily)
# ═══════════════════════════════════════════════════════════════
info "Creating admin account..."

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  if [[ ! -t 0 ]]; then
    exec </dev/tty
  fi
  if [[ -z "$ADMIN_EMAIL" ]]; then
    printf "  Admin email: " && read -r ADMIN_EMAIL
  fi
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    printf "  Admin password (min 6 chars): " && read -rs ADMIN_PASSWORD
    echo ""
  fi
fi

# Start API server temporarily
cd "$INSTALL_DIR"
npx tsx apps/api/src/index.ts &
SERVER_PID=$!
sleep 3

# Check if server is up
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  err "Server failed to start. Check output above for details."
  exit 1
fi

RESPONSE=$(curl -s -X POST "http://localhost:$PORT/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"name":"%s","email":"%s","password":"%s"}' "$ADMIN_NAME" "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")

if echo "$RESPONSE" | grep -q '"token"'; then
  TOKEN=$(echo "$RESPONSE" | sed 's/.*"token":"\([^"]*\)".*/\1/')
  echo "$TOKEN" > "$INSTALL_DIR/.admin-token"
  ok "Admin account created (token saved to .admin-token)"
else
  ERROR=$(echo "$RESPONSE" | sed 's/.*"error":"\([^"]*\)".*/\1/')
  if [[ -z "$ERROR" ]]; then
    ERROR="Unknown error: $RESPONSE"
  fi
  err "Failed to create admin account: $ERROR"
  warn "You can create an account later via the API or by running the server interactively."
fi

# Stop the temporary server
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
sleep 1

# ═══════════════════════════════════════════════════════════════
# 9 ── Create systemd service
# ═══════════════════════════════════════════════════════════════
info "Creating systemd service..."

cat > /etc/systemd/system/laporan.service << SYSTEMDEOF
[Unit]
Description=laporan — Monthly Engineering Reports
Documentation=https://github.com/rizkhal/laporan
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${LAPORAN_USER}
Group=${LAPORAN_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/node_modules/.bin/tsx ${INSTALL_DIR}/apps/api/src/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=DATABASE_URL=file:${INSTALL_DIR}/apps/api/db/dev.db

[Install]
WantedBy=multi-user.target
SYSTEMDEOF

systemctl daemon-reload
systemctl enable laporan.service
ok "systemd service created and enabled"

# ═══════════════════════════════════════════════════════════════
# 10 ── Set ownership
# ═══════════════════════════════════════════════════════════════
info "Setting file ownership..."
chown -R "$LAPORAN_USER":"$LAPORAN_USER" "$INSTALL_DIR"
ok "Ownership set to $LAPORAN_USER"

# ═══════════════════════════════════════════════════════════════
# 11 ── Start service
# ═══════════════════════════════════════════════════════════════
info "Starting laporan service..."
systemctl start laporan.service
sleep 3

if systemctl is-active --quiet laporan.service; then
  ok "laporan is running (systemd: active)"
else
  warn "Service did not start. Check: journalctl -u laporan.service -n 50 --no-pager"
  warn "Starting manually for debugging..."
  cd "$INSTALL_DIR"
  sudo -u "$LAPORAN_USER" npx tsx apps/api/src/index.ts &
  MANUAL_PID=$!
  sleep 3
  if kill -0 "$MANUAL_PID" 2>/dev/null; then
    warn "Manual start succeeded but systemd failed. Check the service file at /etc/systemd/system/laporan.service"
    kill "$MANUAL_PID" 2>/dev/null || true
    wait "$MANUAL_PID" 2>/dev/null || true
    warn "Fix the systemd service then run: systemctl start laporan"
  else
    err "Service failed to start even manually. Check the logs above."
    exit 1
  fi
fi

# ═══════════════════════════════════════════════════════════════
# Done
# ═══════════════════════════════════════════════════════════════
FRONTEND_URL=$(grep '^FRONTEND_URL=' "$INSTALL_DIR/apps/api/.env" | cut -d= -f2-)
FRONTEND_URL="${FRONTEND_URL:-http://localhost:$PORT}"

echo ""
echo -e "${GREEN}  ╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ║       Installation complete! 🎉             ║${NC}"
echo -e "${GREEN}  ╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Dashboard:${NC}  $FRONTEND_URL"
echo -e "  ${CYAN}Email:${NC}      $ADMIN_EMAIL"
echo -e "  ${CYAN}Docs:${NC}       $FRONTEND_URL/docs"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "  1. Set up a reverse proxy (Nginx / Caddy) pointing to port $PORT"
echo ""
echo -e "     Example Nginx config:"
echo -e "     ${BLUE}server {${NC}"
echo -e "     ${BLUE}    listen 80;${NC}"
echo -e "     ${BLUE}    server_name your-domain.com;${NC}"
echo -e "     ${BLUE}    return 301 https://\\\$host\\\$request_uri;${NC}"
echo -e "     ${BLUE}}${NC}"
echo -e "     ${BLUE}server {${NC}"
echo -e "     ${BLUE}    listen 443 ssl;${NC}"
echo -e "     ${BLUE}    server_name your-domain.com;${NC}"
echo -e "     ${BLUE}    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;${NC}"
echo -e "     ${BLUE}    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;${NC}"
echo -e "     ${BLUE}    root ${INSTALL_DIR}/apps/web/dist;${NC}"
echo -e "     ${BLUE}    index index.html;${NC}"
echo -e "     ${BLUE}    location / {${NC}"
echo -e "     ${BLUE}        try_files \\\$uri \\\$uri/ /index.html;${NC}"
echo -e "     ${BLUE}    }${NC}"
echo -e "     ${BLUE}    location /api/ {${NC}"
echo -e "     ${BLUE}        proxy_pass http://127.0.0.1:${PORT};${NC}"
echo -e "     ${BLUE}        proxy_set_header Host \\\$host;${NC}"
echo -e "     ${BLUE}        proxy_set_header X-Real-IP \\\$remote_addr;${NC}"
echo -e "     ${BLUE}    }${NC}"
echo -e "     ${BLUE}}${NC}"
echo ""
echo -e "  2. Access the dashboard and log in with your admin credentials"
echo -e "  3. Add SSH keys and repositories in Settings"
echo -e "  4. Create a collection and analyze your first repo"
echo ""
echo -e "  ${YELLOW}Management commands:${NC}"
echo -e "    systemctl status laporan       — Check status"
echo -e "    journalctl -u laporan -f       — View live logs"
echo -e "    systemctl restart laporan      — Restart"
echo -e "    systemctl stop laporan         — Stop"
echo -e "    systemctl start laporan        — Start"
echo ""
