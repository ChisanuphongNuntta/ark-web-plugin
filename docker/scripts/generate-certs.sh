#!/bin/bash
# ===========================================
# HeartShop Certificate Generation Script
# Generates all TLS certificates for secure communication
# ===========================================

set -e

CERT_DIR="${CERT_DIR:-/certs}"
DOMAIN="${DOMAIN:-localhost}"
VALIDITY_DAYS="${VALIDITY_DAYS:-7}"
KEY_SIZE=4096
ORGANIZATION="HeartShop"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Create directory structure
create_dirs() {
    log_info "Creating certificate directories..."
    mkdir -p "$CERT_DIR"/{ca,nginx,postgres,redis,backend}
    chmod 700 "$CERT_DIR"
}

# Generate CA (Certificate Authority)
generate_ca() {
    log_info "Generating Certificate Authority..."

    # Keep a stable CA across routine leaf-certificate rotations. Replacing
    # both at different moments creates an invalid live trust bundle.
    if [ -s "$CERT_DIR/ca/ca.key" ] && [ -s "$CERT_DIR/ca/ca.crt" ] && \
       openssl x509 -checkend 2592000 -noout -in "$CERT_DIR/ca/ca.crt" >/dev/null 2>&1; then
        log_info "Reusing the existing Certificate Authority"
        for dir in nginx postgres redis backend; do
            cp "$CERT_DIR/ca/ca.crt" "$CERT_DIR/$dir/ca.crt"
        done
        return
    fi

    # Generate CA private key
    openssl genrsa -out "$CERT_DIR/ca/ca.key" $KEY_SIZE
    chmod 600 "$CERT_DIR/ca/ca.key"

    # Generate CA certificate
    openssl req -x509 -new -nodes \
        -key "$CERT_DIR/ca/ca.key" \
        -sha256 -days 365 \
        -out "$CERT_DIR/ca/ca.crt" \
        -subj "/C=TH/ST=Bangkok/L=Bangkok/O=$ORGANIZATION/CN=$ORGANIZATION CA"

    # Copy CA cert to all service directories
    for dir in nginx postgres redis backend; do
        cp "$CERT_DIR/ca/ca.crt" "$CERT_DIR/$dir/"
    done

    log_info "CA certificate generated successfully"
}

# Generate certificate for a service
generate_cert() {
    local service=$1
    local cn=$2
    local san=${3:-""}

    log_info "Generating certificate for $service..."

    local cert_path="$CERT_DIR/$service"

    # Generate private key
    openssl genrsa -out "$cert_path/server.key" $KEY_SIZE
    chmod 600 "$cert_path/server.key"

    # Create CSR config with SAN
    cat > "$cert_path/csr.conf" << EOF
[req]
default_bits = $KEY_SIZE
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C = TH
ST = Bangkok
L = Bangkok
O = $ORGANIZATION
CN = $cn

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = $cn
DNS.2 = localhost
DNS.3 = $service
$san
EOF

    # Generate CSR
    openssl req -new \
        -key "$cert_path/server.key" \
        -out "$cert_path/server.csr" \
        -config "$cert_path/csr.conf"

    # Sign certificate with CA
    openssl x509 -req \
        -in "$cert_path/server.csr" \
        -CA "$CERT_DIR/ca/ca.crt" \
        -CAkey "$CERT_DIR/ca/ca.key" \
        -CAcreateserial \
        -out "$cert_path/server.crt" \
        -days $VALIDITY_DAYS \
        -sha256 \
        -extensions v3_req \
        -extfile "$cert_path/csr.conf"

    # Create combined cert for some services
    cat "$cert_path/server.crt" "$CERT_DIR/ca/ca.crt" > "$cert_path/fullchain.crt"

    # Cleanup
    rm -f "$cert_path/server.csr" "$cert_path/csr.conf"

    log_info "Certificate for $service generated (valid for $VALIDITY_DAYS days)"
}

# Generate Nginx certificates
generate_nginx_certs() {
    generate_cert "nginx" "$DOMAIN" "DNS.4 = *.$DOMAIN
IP.1 = 127.0.0.1"
}

# Generate PostgreSQL certificates
generate_postgres_certs() {
    generate_cert "postgres" "postgres-primary" "DNS.4 = postgres-replica
DNS.5 = postgres"

    generate_cert "backend" "backend" "DNS.4 = heartshop-backend"

    # Also generate client certificate for backend
    local cert_path="$CERT_DIR/backend"

    openssl genrsa -out "$cert_path/client.key" $KEY_SIZE
    chmod 600 "$cert_path/client.key"

    openssl req -new \
        -key "$cert_path/client.key" \
        -out "$cert_path/client.csr" \
        -subj "/C=TH/ST=Bangkok/L=Bangkok/O=$ORGANIZATION/CN=backend"

    openssl x509 -req \
        -in "$cert_path/client.csr" \
        -CA "$CERT_DIR/ca/ca.crt" \
        -CAkey "$CERT_DIR/ca/ca.key" \
        -CAcreateserial \
        -out "$cert_path/client.crt" \
        -days $VALIDITY_DAYS \
        -sha256

    rm -f "$cert_path/client.csr"
}

# Generate Redis certificates
generate_redis_certs() {
    generate_cert "redis" "redis-primary" "DNS.4 = redis-sentinel
DNS.5 = redis"

    # Copy to redis-specific names
    cp "$CERT_DIR/redis/server.crt" "$CERT_DIR/redis/redis.crt"
    cp "$CERT_DIR/redis/server.key" "$CERT_DIR/redis/redis.key"
}

# Generate DH parameters for perfect forward secrecy
generate_dhparam() {
    if [ -s "$CERT_DIR/nginx/dhparam.pem" ]; then
        log_info "Reusing existing DH parameters"
        return
    fi
    log_info "Generating DH parameters (this may take a while)..."
    openssl dhparam -out "$CERT_DIR/nginx/dhparam.pem" 2048
    log_info "DH parameters generated"
}

# Create certificate metadata
create_metadata() {
    local metadata_file="$CERT_DIR/metadata.json"
    local created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local expires_epoch=$(( $(date +%s) + VALIDITY_DAYS * 86400 ))
    local expires_at=$(date -u -d "@$expires_epoch" +"%Y-%m-%dT%H:%M:%SZ")

    cat > "$metadata_file" << EOF
{
    "created_at": "$created_at",
    "expires_at": "$expires_at",
    "validity_days": $VALIDITY_DAYS,
    "domain": "$DOMAIN",
    "services": ["nginx", "postgres", "redis", "backend"],
    "key_size": $KEY_SIZE,
    "signature_algorithm": "sha256WithRSAEncryption"
}
EOF

    log_info "Certificate metadata saved"
}

# Verify certificates
verify_certs() {
    log_info "Verifying certificates..."

    local all_valid=true

    for service in nginx postgres redis backend; do
        if openssl verify -CAfile "$CERT_DIR/ca/ca.crt" "$CERT_DIR/$service/server.crt" 2>/dev/null; then
            log_info "✓ $service certificate is valid"
        else
            log_error "✗ $service certificate verification failed"
            all_valid=false
        fi
    done

    if $all_valid; then
        log_info "All certificates verified successfully!"
    else
        log_error "Some certificates failed verification"
        exit 1
    fi
}

# Main execution
main() {
    log_info "=========================================="
    log_info "HeartShop Certificate Generation"
    log_info "Domain: $DOMAIN"
    log_info "Validity: $VALIDITY_DAYS days"
    log_info "=========================================="

    create_dirs
    generate_ca
    generate_nginx_certs
    generate_postgres_certs
    generate_redis_certs
    generate_dhparam
    create_metadata
    verify_certs

    log_info "=========================================="
    log_info "Certificate generation complete!"
    log_info "Certificates location: $CERT_DIR"
    log_info "=========================================="
}

main "$@"
