#!/bin/bash
# ===========================================
# HeartShop Security Test Suite
# Comprehensive security testing for production
# ===========================================

set -e

BASE_URL="${BASE_URL:-https://localhost}"
API_URL="${API_URL:-$BASE_URL/api}"
REPORT_DIR="${REPORT_DIR:-./security-reports}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Create report directory
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/security_report_$TIMESTAMP.txt"

# Logging functions
log() { echo -e "$1" | tee -a "$REPORT_FILE"; }
log_pass() { log "${GREEN}[PASS]${NC} $1"; PASSED=$((PASSED + 1)); }
log_fail() { log "${RED}[FAIL]${NC} $1"; FAILED=$((FAILED + 1)); }
log_warn() { log "${YELLOW}[WARN]${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
log_info() { log "${BLUE}[INFO]${NC} $1"; }

# Header
log "=========================================="
log "HeartShop Security Test Suite"
log "Timestamp: $(date)"
log "Target: $BASE_URL"
log "=========================================="
log ""

# ===========================================
# 1. TLS/SSL Tests
# ===========================================
log_info "=== TLS/SSL Security Tests ==="

# Test TLS 1.3 support
test_tls_version() {
    log_info "Testing TLS version..."

    result=$(echo | openssl s_client -connect "${BASE_URL#https://}:443" -tls1_3 2>&1)
    if echo "$result" | grep -q "TLSv1.3"; then
        log_pass "TLS 1.3 is enabled"
    else
        log_fail "TLS 1.3 is not enabled"
    fi

    # Test that older versions are disabled
    for version in tls1 tls1_1 tls1_2; do
        result=$(echo | openssl s_client -connect "${BASE_URL#https://}:443" -$version 2>&1 || true)
        if echo "$result" | grep -q "handshake failure\|no protocols available"; then
            log_pass "TLS $version is disabled"
        else
            log_warn "TLS $version might be enabled (should be TLS 1.3 only)"
        fi
    done
}

# Test certificate validity
test_certificate() {
    log_info "Testing SSL certificate..."

    cert_info=$(echo | openssl s_client -connect "${BASE_URL#https://}:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)

    if [ -n "$cert_info" ]; then
        log_pass "SSL certificate is valid"
        log_info "$cert_info"
    else
        log_fail "Could not retrieve SSL certificate"
    fi
}

# ===========================================
# 2. Security Headers Tests
# ===========================================
log_info "=== Security Headers Tests ==="

test_security_headers() {
    log_info "Testing security headers..."

    headers=$(curl -sI -k "$BASE_URL" 2>/dev/null)

    # Required headers
    declare -A required_headers=(
        ["Strict-Transport-Security"]="HSTS"
        ["X-Content-Type-Options"]="X-Content-Type-Options"
        ["X-Frame-Options"]="X-Frame-Options"
        ["X-XSS-Protection"]="X-XSS-Protection"
        ["Content-Security-Policy"]="CSP"
        ["Referrer-Policy"]="Referrer-Policy"
    )

    for header in "${!required_headers[@]}"; do
        if echo "$headers" | grep -qi "$header"; then
            log_pass "${required_headers[$header]} header present"
        else
            log_fail "${required_headers[$header]} header missing"
        fi
    done

    # Check server header is hidden
    if echo "$headers" | grep -qi "^Server:"; then
        server=$(echo "$headers" | grep -i "^Server:" | head -1)
        if echo "$server" | grep -qi "nginx\|apache\|express"; then
            log_warn "Server version exposed: $server"
        fi
    else
        log_pass "Server header is hidden"
    fi
}

# ===========================================
# 3. Authentication Tests
# ===========================================
log_info "=== Authentication Security Tests ==="

test_auth_security() {
    log_info "Testing authentication endpoints..."

    # Test rate limiting on auth endpoints
    log_info "Testing rate limiting..."
    rate_limited=false
    for i in {1..20}; do
        status=$(curl -s -o /dev/null -w "%{http_code}" -k "$API_URL/auth/me" 2>/dev/null)
        if [ "$status" = "429" ]; then
            rate_limited=true
            log_pass "Rate limiting is working (triggered at request $i)"
            break
        fi
    done

    if [ "$rate_limited" = false ]; then
        log_warn "Rate limiting might not be configured properly"
    fi

    # Test unauthorized access
    status=$(curl -s -o /dev/null -w "%{http_code}" -k "$API_URL/auth/me" 2>/dev/null)
    if [ "$status" = "401" ] || [ "$status" = "403" ]; then
        log_pass "Unauthenticated requests are rejected"
    else
        log_fail "Unauthenticated requests might be allowed (status: $status)"
    fi
}

# ===========================================
# 4. SQL Injection Tests
# ===========================================
log_info "=== SQL Injection Tests ==="

test_sql_injection() {
    log_info "Testing SQL injection protection..."

    payloads=(
        "' OR '1'='1"
        "1; DROP TABLE users--"
        "1 UNION SELECT * FROM users"
        "'; DELETE FROM products;--"
        "1' AND '1'='1"
    )

    for payload in "${payloads[@]}"; do
        encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$payload'))" 2>/dev/null || echo "$payload")
        response=$(curl -s -k "$API_URL/products?id=$encoded" 2>/dev/null)
        status=$(curl -s -o /dev/null -w "%{http_code}" -k "$API_URL/products?id=$encoded" 2>/dev/null)

        if [ "$status" = "400" ] || [ "$status" = "403" ]; then
            log_pass "SQL injection blocked: $payload"
        elif echo "$response" | grep -qi "error\|exception\|sql"; then
            log_warn "SQL injection might expose errors: $payload"
        else
            log_pass "SQL injection handled safely: $payload"
        fi
    done
}

# ===========================================
# 5. XSS Tests
# ===========================================
log_info "=== XSS Protection Tests ==="

test_xss() {
    log_info "Testing XSS protection..."

    payloads=(
        "<script>alert('XSS')</script>"
        "<img src=x onerror=alert('XSS')>"
        "javascript:alert('XSS')"
        "<svg onload=alert('XSS')>"
    )

    for payload in "${payloads[@]}"; do
        encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$payload'))" 2>/dev/null || echo "$payload")
        response=$(curl -s -k "$API_URL/products?search=$encoded" 2>/dev/null)

        if echo "$response" | grep -q "<script>\|onerror=\|javascript:"; then
            log_fail "XSS payload reflected: $payload"
        else
            log_pass "XSS payload sanitized: $payload"
        fi
    done
}

# ===========================================
# 6. Path Traversal Tests
# ===========================================
log_info "=== Path Traversal Tests ==="

test_path_traversal() {
    log_info "Testing path traversal protection..."

    payloads=(
        "../../../etc/passwd"
        "..\\..\\..\\windows\\system32\\config\\sam"
        "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"
        "....//....//....//etc/passwd"
    )

    for payload in "${payloads[@]}"; do
        status=$(curl -s -o /dev/null -w "%{http_code}" -k "$BASE_URL/$payload" 2>/dev/null)

        if [ "$status" = "400" ] || [ "$status" = "403" ] || [ "$status" = "404" ]; then
            log_pass "Path traversal blocked: $payload (status: $status)"
        else
            log_warn "Path traversal might be allowed: $payload (status: $status)"
        fi
    done
}

# ===========================================
# 7. CORS Tests
# ===========================================
log_info "=== CORS Security Tests ==="

test_cors() {
    log_info "Testing CORS configuration..."

    # Test with malicious origin
    response=$(curl -s -k -H "Origin: https://evil.com" -I "$API_URL/products" 2>/dev/null)

    if echo "$response" | grep -qi "Access-Control-Allow-Origin: https://evil.com"; then
        log_fail "CORS allows arbitrary origins"
    else
        log_pass "CORS restricts origins properly"
    fi

    # Test preflight
    response=$(curl -s -k -X OPTIONS -H "Origin: https://evil.com" -H "Access-Control-Request-Method: DELETE" -I "$API_URL/products" 2>/dev/null)

    if echo "$response" | grep -qi "Access-Control-Allow-Methods.*DELETE"; then
        log_warn "CORS might allow dangerous methods from any origin"
    else
        log_pass "CORS preflight is restrictive"
    fi
}

# ===========================================
# 8. API Key Security Tests
# ===========================================
log_info "=== API Key Security Tests ==="

test_api_key() {
    log_info "Testing API key security..."

    # Test invalid API key
    status=$(curl -s -o /dev/null -w "%{http_code}" -k -H "X-API-Key: invalid-key" "$API_URL/plugin/orders/pending" 2>/dev/null)

    if [ "$status" = "401" ] || [ "$status" = "403" ]; then
        log_pass "Invalid API key is rejected"
    else
        log_fail "Invalid API key might be accepted (status: $status)"
    fi

    # Test missing API key
    status=$(curl -s -o /dev/null -w "%{http_code}" -k "$API_URL/plugin/orders/pending" 2>/dev/null)

    if [ "$status" = "401" ] || [ "$status" = "403" ]; then
        log_pass "Missing API key is rejected"
    else
        log_fail "Missing API key might be allowed (status: $status)"
    fi
}

# ===========================================
# 9. Sensitive Data Exposure Tests
# ===========================================
log_info "=== Sensitive Data Exposure Tests ==="

test_sensitive_data() {
    log_info "Testing for sensitive data exposure..."

    # Test common sensitive paths
    paths=(
        "/.env"
        "/.git/config"
        "/config.json"
        "/package.json"
        "/api/debug"
        "/api/admin"
        "/phpinfo.php"
        "/server-status"
    )

    for path in "${paths[@]}"; do
        status=$(curl -s -o /dev/null -w "%{http_code}" -k "$BASE_URL$path" 2>/dev/null)

        if [ "$status" = "200" ]; then
            log_fail "Sensitive path accessible: $path"
        else
            log_pass "Sensitive path protected: $path (status: $status)"
        fi
    done
}

# ===========================================
# 10. WebSocket Security Tests
# ===========================================
log_info "=== WebSocket Security Tests ==="

test_websocket() {
    log_info "Testing WebSocket security..."

    # Test WebSocket upgrade with invalid origin
    response=$(curl -s -k -H "Upgrade: websocket" -H "Connection: Upgrade" -H "Origin: https://evil.com" "$BASE_URL/socket.io/" 2>/dev/null)

    if echo "$response" | grep -qi "forbidden\|unauthorized\|error"; then
        log_pass "WebSocket rejects invalid origins"
    else
        log_warn "WebSocket origin validation might be weak"
    fi
}

# ===========================================
# Run All Tests
# ===========================================

log_info "Starting security tests..."
log ""

test_tls_version
test_certificate
test_security_headers
test_auth_security
test_sql_injection
test_xss
test_path_traversal
test_cors
test_api_key
test_sensitive_data
test_websocket

# ===========================================
# Summary
# ===========================================
log ""
log "=========================================="
log "SECURITY TEST SUMMARY"
log "=========================================="
log "${GREEN}Passed: $PASSED${NC}"
log "${RED}Failed: $FAILED${NC}"
log "${YELLOW}Warnings: $WARNINGS${NC}"
log ""
log "Report saved to: $REPORT_FILE"
log "=========================================="

# Exit with failure if any tests failed
if [ $FAILED -gt 0 ]; then
    exit 1
fi

exit 0
