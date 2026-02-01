#!/bin/bash
# start runeforge canvas servers (API + React frontend)
# access via http://154.53.35.193:3080 with nginx basic auth

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}starting runeforge canvas...${NC}"

# kill any existing processes
pkill -f "runeforge-api" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 1

# start API server
echo -e "${YELLOW}starting API server on :8000...${NC}"
.venv/bin/runeforge-api --mock > /tmp/runeforge-api.log 2>&1 &
API_PID=$!

# start React dev server
echo -e "${YELLOW}starting React dev server on :3000...${NC}"
cd web && npm run dev > /tmp/runeforge-web.log 2>&1 &
WEB_PID=$!

# wait for servers to start
sleep 3

# verify
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}API server: running (pid $API_PID)${NC}"
else
    echo "API server: FAILED - check /tmp/runeforge-api.log"
fi

if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}React server: running (pid $WEB_PID)${NC}"
else
    echo "React server: FAILED - check /tmp/runeforge-web.log"
fi

echo ""
echo -e "${GREEN}=== runeforge canvas ready ===${NC}"
echo ""
echo "  direct access (no auth):"
echo "    React:  http://localhost:3000"
echo "    API:    http://localhost:8000"
echo ""
echo "  via nginx (with auth):"
echo "    http://154.53.35.193:3080"
echo "    user: jr"
echo ""
echo "  logs:"
echo "    API:   /tmp/runeforge-api.log"
echo "    React: /tmp/runeforge-web.log"
echo ""
echo "  to stop: pkill -f 'runeforge-api|vite'"
