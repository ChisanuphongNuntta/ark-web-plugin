#!/bin/bash
# ===========================================
# HeartShop Security Test Runner
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================="
echo "HeartShop Security Test Runner"
echo -e "==========================================${NC}"

# Check if services are running
echo -e "${YELLOW}Checking services...${NC}"

if ! curl -s -k https://localhost/health > /dev/null 2>&1; then
    echo "Services not running. Starting with Docker Compose..."
    cd "$PROJECT_DIR"
    docker compose --profile prod up -d
    echo "Waiting for services to start..."
    sleep 30
fi

# Run security tests
echo -e "${YELLOW}Running security tests...${NC}"
bash "$SCRIPT_DIR/security-test.sh"

# Run Trivy scan
echo -e "${YELLOW}Running container vulnerability scan...${NC}"
if command -v trivy &> /dev/null; then
    trivy image heartshop-backend --severity HIGH,CRITICAL --exit-code 0 || true
    trivy image heartshop-frontend --severity HIGH,CRITICAL --exit-code 0 || true
else
    echo "Trivy not installed. Skipping container scan."
    echo "Install with: brew install trivy (Mac) or apt install trivy (Linux)"
fi

# Run SSL Labs test (if online)
echo -e "${YELLOW}Running SSL analysis...${NC}"
if command -v sslyze &> /dev/null; then
    sslyze localhost:443 --json_out=security-reports/ssl-report.json || true
else
    echo "sslyze not installed. Skipping detailed SSL analysis."
fi

echo -e "${GREEN}=========================================="
echo "Security tests completed!"
echo -e "==========================================${NC}"
