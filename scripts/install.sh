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
#     bash
#
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Defaults ──
INSTALL_DIR="${INSTALL_DIR:-$(pwd)/laporan}"
REPO_URL="${REPO_URL:-https://github.com/rizkhal/laporan.git}"
BRANCH="${BRANCH:-master}"
PORT="${PORT:-3000}"

ADMIN_NAME="${ADMIN_NAME:-Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}⟹${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }

# ── Loading spinner ──
spinner() {
  local pid=$1
  local msg=$2
  local delay=0.1
  local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r${CYAN} %s ${NC}%s" "${spinstr:$i:1}" "$msg"
    i=$(( (i+1) % 10 ))
    sleep $delay
  done
  printf "\r${GREEN} ✓ ${NC}%s\n" "$msg"
}

run_with_spinner() {
  local msg=$1
  shift
  ("$@" &>/dev/null) &
  local pid=$!
  spinner "$pid" "$msg"
  wait "$pid"
  return $?
}

# ── Sanity checks ──
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
info "Checking system dependencies..."

DEPS=""
for dep in git curl; do
  if ! command -v "$dep" &>/dev/null; then
    DEPS="$DEPS $dep"
  fi
done

if [[ -n "$DEPS" ]]; then
  apt-get update -qq
  apt-get install -y -qq $DEPS
fi
ok "System dependencies ready"

# ═══════════════════════════════════════════════════════════════
# 2 ── Check / Install Node.js
# ═══════════════════════════════════════════════════════════════
install_nodejs() {
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
}

if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_MAJOR" -lt 18 ]]; then
    install_nodejs
  fi
else
  install_nodejs
fi

if ! command -v npm &>/dev/null; then
  err "npm not found."
  exit 1
fi
ok "Node.js $(node -v) ready"

# ═══════════════════════════════════════════════════════════════
# 3 ── Clone repository
# ═══════════════════════════════════════════════════════════════
run_with_spinner "Cloning repository..." git clone --depth=1 -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"

cd "$INSTALL_DIR"

# ═══════════════════════════════════════════════════════════════
# 4 ── Install dependencies
# ═══════════════════════════════════════════════════════════════
run_with_spinner "Installing dependencies..." npm install

# ═══════════════════════════════════════════════════════════════
# 5 ── Build frontend
# ═══════════════════════════════════════════════════════════════
run_with_spinner "Building frontend..." npm run build

# ═══════════════════════════════════════════════════════════════
# 6 ── Configure environment
# ═══════════════════════════════════════════════════════════════
if [[ -f "$INSTALL_DIR/apps/api/.env" ]]; then
  ok "Environment file exists (skipping)"
else
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

  printf "  Frontend URL [http://%s:%s]: " "$SERVER_IP" "$PORT"
  read -r FRONTEND_URL_INPUT
  FRONTEND_URL="${FRONTEND_URL_INPUT:-http://$SERVER_IP:$PORT}"

  cat > "$INSTALL_DIR/apps/api/.env" << EOF
PORT=$PORT
FRONTEND_URL=$FRONTEND_URL
NODE_ENV=production
EOF
  ok "Environment configured"
fi

# ═══════════════════════════════════════════════════════════════
# 7 ── Create admin account
# ═══════════════════════════════════════════════════════════════
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

info "Creating admin account..."

node_modules/.bin/tsx apps/api/src/index.ts &
SERVER_PID=$!

# Wait for server to be ready (up to 15s)
for i in $(seq 1 15); do
  if curl -s "http://localhost:$PORT/api/health" &>/dev/null; then
    break
  fi
  sleep 1
done

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  err "Server failed to start."
  exit 1
fi

RESPONSE=$(curl -s -X POST "http://localhost:$PORT/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"name":"%s","email":"%s","password":"%s"}' "$ADMIN_NAME" "$ADMIN_EMAIL" "$ADMIN_PASSWORD")")

if echo "$RESPONSE" | grep -q '"token"'; then
  TOKEN=$(echo "$RESPONSE" | sed 's/.*"token":"\([^"]*\)".*/\1/')
  echo "$TOKEN" > "$INSTALL_DIR/.admin-token"
  ok "Admin account created"
else
  ERROR=$(echo "$RESPONSE" | sed 's/.*"error":"\([^"]*\)".*/\1/')
  [[ -z "$ERROR" ]] && ERROR="Unknown error"
  err "Failed to create admin account: $ERROR"
fi

kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
sleep 1

# ═══════════════════════════════════════════════════════════════
# Done
# ═══════════════════════════════════════════════════════════════
FRONTEND_URL=$(grep '^FRONTEND_URL=' "$INSTALL_DIR/apps/api/.env" 2>/dev/null | cut -d= -f2-)
FRONTEND_URL="${FRONTEND_URL:-http://localhost:$PORT}"

echo ""
echo -e "${GREEN}  ╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ║       Installation complete! 🎉             ║${NC}"
echo -e "${GREEN}  ╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Install dir:${NC} $INSTALL_DIR"
echo -e "  ${CYAN}Email:${NC}      $ADMIN_EMAIL"
echo ""
echo -e "  ${YELLOW}To start:${NC}"
echo ""
echo -e "    ${BLUE}cd $INSTALL_DIR && npm run dev${NC}"
echo ""
echo -e "  This starts the API server (port $PORT) and frontend dev server."
echo ""
echo -e "  After logging in, add your LLM API key in Settings."
echo ""
echo -e "  ${YELLOW}For production:${NC}"
echo -e "  Set up Nginx to serve ${INSTALL_DIR}/apps/web/dist and proxy /api/ to port $PORT."
echo ""
