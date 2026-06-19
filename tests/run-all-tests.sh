#!/usr/bin/env bash
# HeartShop Automated Test Runner
# Usage: bash tests/run-all-tests.sh [--skip-e2e] [--skip-unit] [--skip-api]
#
# Environment:
#   TEST_API_URL          - API base URL (default: https://localhost)
#   TEST_PLUGIN_API_KEY   - Plugin API key for integration tests
#   E2E_BASE_URL          - Frontend base URL for Playwright (default: https://localhost)

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
BOLD='\033[1m'

# ─── Flags ────────────────────────────────────────────────────────────────────
SKIP_UNIT=false
SKIP_API=false
SKIP_E2E=false
for arg in "$@"; do
  case $arg in
    --skip-unit) SKIP_UNIT=true ;;
    --skip-api)  SKIP_API=true  ;;
    --skip-e2e)  SKIP_E2E=true  ;;
  esac
done

# ─── Config ───────────────────────────────────────────────────────────────────
export TEST_API_URL="${TEST_API_URL:-https://localhost}"
export E2E_BASE_URL="${E2E_BASE_URL:-https://localhost}"
export NODE_TLS_REJECT_UNAUTHORIZED=0   # self-signed cert for localhost

PASS=0; FAIL=0; SKIP=0
START_TIME=$(date +%s)

# ─── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "${BLUE}[TEST]${NC} $*"; }
ok()   { echo -e "${GREEN}[PASS]${NC} $*"; ((PASS++)) || true; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; ((FAIL++)) || true; }
skip() { echo -e "${YELLOW}[SKIP]${NC} $*"; ((SKIP++)) || true; }
sep()  { echo -e "${CYAN}${BOLD}══════════════════════════════════════════${NC}"; }

run_section() {
  local name="$1"; shift
  sep
  echo -e "${BOLD}${CYAN}▶ $name${NC}"
  sep
  if "$@"; then
    ok "$name completed successfully"
    return 0
  else
    fail "$name had failures (exit: $?)"
    return 1
  fi
}

# ─── Pre-flight: Check stack is running ───────────────────────────────────────
sep
echo -e "${BOLD}${CYAN}HeartShop Test Runner — $(date)${NC}"
sep

log "Checking API reachability at $TEST_API_URL ..."
if curl -sk "$TEST_API_URL/health" -o /dev/null -w "%{http_code}" | grep -q "200"; then
  ok "API is reachable"
else
  fail "API not reachable at $TEST_API_URL — is the stack running?"
  echo -e "${YELLOW}Run: docker compose --env-file .env.prod --profile prod up -d${NC}"
  exit 1
fi

log "Checking frontend reachability at $E2E_BASE_URL ..."
if curl -sk "$E2E_BASE_URL" -o /dev/null -w "%{http_code}" | grep -q "200"; then
  ok "Frontend is reachable"
else
  skip "Frontend not reachable — E2E tests will be skipped"
  SKIP_E2E=true
fi

# ─── Security Shell Tests ─────────────────────────────────────────────────────
sep
echo -e "${BOLD}${CYAN}▶ Security Tests (existing shell suite)${NC}"
sep
if [[ -f tests/security/run-tests.sh ]]; then
  if bash tests/security/run-tests.sh; then
    ok "Security tests passed"
  else
    fail "Security tests failed"
  fi
else
  skip "tests/security/run-tests.sh not found"
fi

# ─── Backend Unit Tests ───────────────────────────────────────────────────────
if [[ "$SKIP_UNIT" == "false" ]]; then
  sep
  echo -e "${BOLD}${CYAN}▶ Backend Unit Tests (Vitest)${NC}"
  sep
  if [[ ! -d backend/node_modules ]]; then
    log "Installing backend dependencies..."
    (cd backend && npm install --silent 2>/dev/null || bun install --silent 2>/dev/null)
  fi
  if (cd backend && npm test -- --reporter=verbose 2>&1); then
    ok "Backend unit tests passed"
  else
    fail "Backend unit tests failed"
  fi
else
  skip "Backend unit tests (--skip-unit)"
fi

# ─── API Integration Tests ────────────────────────────────────────────────────
if [[ "$SKIP_API" == "false" ]]; then
  sep
  echo -e "${BOLD}${CYAN}▶ API Integration Tests (live API: $TEST_API_URL)${NC}"
  sep
  if (cd backend && npm test -- tests/integration/ --reporter=verbose 2>&1); then
    ok "API integration tests passed"
  else
    fail "API integration tests failed"
  fi
else
  skip "API integration tests (--skip-api)"
fi

# ─── Frontend E2E Tests ───────────────────────────────────────────────────────
if [[ "$SKIP_E2E" == "false" ]]; then
  sep
  echo -e "${BOLD}${CYAN}▶ Frontend E2E Tests (Playwright: $E2E_BASE_URL)${NC}"
  sep
  if [[ ! -d frontend/node_modules ]]; then
    log "Installing frontend dependencies..."
    (cd frontend && npm install --silent 2>/dev/null || bun install --silent 2>/dev/null)
  fi
  # Install Playwright browsers if needed
  if ! command -v playwright &>/dev/null && [[ ! -f frontend/node_modules/.bin/playwright ]]; then
    log "Installing Playwright browsers..."
    (cd frontend && npx playwright install --with-deps chromium firefox 2>/dev/null)
  fi
  if (cd frontend && npx playwright test --reporter=list 2>&1); then
    ok "E2E tests passed"
  else
    fail "E2E tests failed (see frontend/playwright-report/)"
  fi
else
  skip "E2E tests (--skip-e2e)"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
sep
echo -e "${BOLD}Test Summary — ${DURATION}s${NC}"
sep
echo -e "  ${GREEN}PASSED: $PASS${NC}"
echo -e "  ${RED}FAILED: $FAIL${NC}"
echo -e "  ${YELLOW}SKIPPED: $SKIP${NC}"
sep

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}${BOLD}✗ Some tests failed${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}✓ All tests passed${NC}"
  exit 0
fi
