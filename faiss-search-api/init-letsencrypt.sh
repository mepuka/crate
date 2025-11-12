#!/bin/bash

# Initialize Let's Encrypt SSL certificates for KEXP Search API
# This script sets up SSL certificates using Certbot and Docker

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}▶${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Configuration
DOMAIN="cratemusic.duckdns.org"
EMAIL="kokokessy@gmail.com"  # Update this to your email
STAGING=0  # Set to 1 for staging/testing

# Paths
DATA_PATH="./certbot"
COMPOSE_FILE="docker-compose.yml"

echo "========================================"
echo "Let's Encrypt SSL Setup"
echo "Domain: $DOMAIN"
echo "========================================"
echo ""

# Check if docker-compose.yml exists
if [ ! -f "$COMPOSE_FILE" ]; then
    error "docker-compose.yml not found in current directory"
fi

# Create certbot directories
log "Creating certbot directories..."
mkdir -p "$DATA_PATH/conf/live/$DOMAIN"
mkdir -p "$DATA_PATH/www"

# Download recommended TLS parameters
log "Downloading recommended TLS parameters..."
if [ ! -e "$DATA_PATH/conf/options-ssl-nginx.conf" ] || [ ! -e "$DATA_PATH/conf/ssl-dhparams.pem" ]; then
    log "Downloading options-ssl-nginx.conf..."
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$DATA_PATH/conf/options-ssl-nginx.conf"

    log "Downloading ssl-dhparams.pem..."
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$DATA_PATH/conf/ssl-dhparams.pem"
else
    log "TLS parameters already exist, skipping download"
fi

# Create dummy certificate for nginx to start
log "Creating dummy certificate for $DOMAIN..."
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
docker-compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:4096 -days 1\
    -keyout '$CERT_PATH/privkey.pem' \
    -out '$CERT_PATH/fullchain.pem' \
    -subj '/CN=localhost'" certbot || error "Failed to create dummy certificate"

# Create a symbolic link for chain.pem
docker-compose run --rm --entrypoint "\
  ln -sf fullchain.pem $CERT_PATH/chain.pem" certbot

log "Starting nginx..."
docker-compose up --force-recreate -d nginx || error "Failed to start nginx"

# Wait for nginx to start
sleep 5

# Delete dummy certificate
log "Deleting dummy certificate..."
docker-compose run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$DOMAIN && \
  rm -rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

# Request real certificate
log "Requesting Let's Encrypt certificate for $DOMAIN..."

# Set staging flag if requested
STAGING_ARG=""
if [ $STAGING != "0" ]; then
    STAGING_ARG="--staging"
    warn "Using staging environment (certificate will not be trusted)"
fi

docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    --email $EMAIL \
    --rsa-key-size 4096 \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d $DOMAIN" certbot || error "Failed to obtain certificate"

# Create symbolic link for chain.pem
docker-compose run --rm --entrypoint "\
  ln -sf fullchain.pem $CERT_PATH/chain.pem" certbot

# Reload nginx to use the new certificate
log "Reloading nginx..."
docker-compose exec nginx nginx -s reload || warn "Failed to reload nginx (will reload on next startup)"

echo ""
log "${GREEN}✓${NC} SSL setup complete!"
log "Your site is now available at: https://$DOMAIN"
log ""
log "Certificate auto-renewal is enabled via the certbot container"
log "Certificates will be checked and renewed every 12 hours if needed"
echo ""
