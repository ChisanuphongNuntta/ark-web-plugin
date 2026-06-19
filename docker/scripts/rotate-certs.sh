#!/bin/bash
# ===========================================
# HeartShop Certificate Rotation Script
# Automatically rotates certificates every 7 days
# ===========================================

set -e

CERT_DIR="${CERT_DIR:-/certs}"
ROTATION_DAYS="${CERT_ROTATION_DAYS:-7}"
WEBHOOK_URL="${NOTIFICATION_WEBHOOK:-}"
SCRIPT_DIR="$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] [WARN]${NC} $1"; }
log_error() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR]${NC} $1"; }

# Send notification
send_notification() {
    local message=$1
    local status=${2:-"info"}

    if [ -n "$WEBHOOK_URL" ]; then
        local color="3447003" # Blue
        [ "$status" = "success" ] && color="3066993" # Green
        [ "$status" = "error" ] && color="15158332" # Red
        [ "$status" = "warning" ] && color="15105570" # Yellow

        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"embeds\": [{
                    \"title\": \"🔐 HeartShop Certificate Manager\",
                    \"description\": \"$message\",
                    \"color\": $color,
                    \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
                }]
            }" || true
    fi
}

# Check if rotation is needed
check_rotation_needed() {
    local metadata_file="$CERT_DIR/metadata.json"

    if [ ! -f "$metadata_file" ]; then
        log_warn "No metadata file found, rotation needed"
        return 0
    fi

    # Get expiry date from metadata
    local expires_at=$(jq -r '.expires_at' "$metadata_file" 2>/dev/null || echo "")

    if [ -z "$expires_at" ]; then
        log_warn "Cannot read expiry date, rotation needed"
        return 0
    fi

    # Calculate days until expiry
    local expires_epoch=$(date -d "$expires_at" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%SZ" "$expires_at" +%s 2>/dev/null || echo "0")
    local now_epoch=$(date +%s)
    local days_left=$(( (expires_epoch - now_epoch) / 86400 ))

    if [ "$days_left" -le 1 ]; then
        log_info "Certificates expire in $days_left days, rotation needed"
        return 0
    else
        log_info "Certificates valid for $days_left more days"
        return 1
    fi
}

# Backup current certificates
backup_certs() {
    local backup_dir="$CERT_DIR/backup/$(date +%Y%m%d_%H%M%S)"

    log_info "Backing up current certificates to $backup_dir"
    mkdir -p "$backup_dir"

    for dir in ca nginx postgres redis backend; do
        if [ -d "$CERT_DIR/$dir" ]; then
            cp -r "$CERT_DIR/$dir" "$backup_dir/"
        fi
    done

    # Keep only last 5 backups
    ls -dt "$CERT_DIR/backup"/*/ 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true

    log_info "Backup completed"
}

# Rotate certificates
rotate_certs() {
    log_info "Starting certificate rotation..."
    send_notification "🔄 Starting certificate rotation..." "info"

    # Backup existing certs
    backup_certs

    # Generate new certificates
    export CERT_DIR VALIDITY_DAYS=$ROTATION_DAYS

    if bash "$SCRIPT_DIR/generate-certs.sh"; then
        log_info "New certificates generated successfully"
        send_notification "✅ New certificates generated successfully. Valid for $ROTATION_DAYS days." "success"
        return 0
    else
        log_error "Certificate generation failed"
        send_notification "❌ Certificate generation failed! Check logs immediately." "error"
        return 1
    fi
}

# Reload services to use new certificates
reload_services() {
    log_info "Reloading services to use new certificates..."

    # Reload Nginx
    if docker exec heartshop-nginx nginx -s reload 2>/dev/null; then
        log_info "Nginx reloaded successfully"
    else
        log_warn "Could not reload Nginx (may not be running)"
    fi

    # Note: PostgreSQL and Redis require restart for new certs
    # This is handled by the orchestrator

    send_notification "🔄 Services reloaded with new certificates" "success"
}

# Main execution
main() {
    log_info "=========================================="
    log_info "HeartShop Certificate Rotation Check"
    log_info "=========================================="

    if check_rotation_needed; then
        rotate_certs
        reload_services
    fi

    log_info "Certificate rotation check completed"
}

# Run as daemon or once
if [ "${1:-}" = "--daemon" ]; then
    log_info "Starting certificate rotation daemon (check every 6 hours)"
    while true; do
        main
        sleep 21600 # 6 hours
    done
else
    main
fi
