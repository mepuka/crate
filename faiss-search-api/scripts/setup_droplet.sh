#!/bin/bash
# Setup script for KEXP Search API droplet
# Configures nginx, swap space, firewall, and system settings

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

echo "========================================="
echo "KEXP Search API - Droplet Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run as root (use: sudo -i)"
fi

# Configuration
DEPLOY_DIR="/root/faiss-search-api"
API_PORT=8000
DOMAIN="${1:-}"  # Optional domain for SSL

# Step 1: Create swap space (prevent OOM with large FAISS embeddings)
log "Step 1: Configuring swap space..."

if [ -f /swapfile ]; then
    warn "Swap file already exists, skipping..."
else
    log "Creating 4 GB swap file..."
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    # Make swap permanent
    if ! grep -q "/swapfile" /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
    fi

    # Optimize swap settings for server
    sysctl vm.swappiness=10
    sysctl vm.vfs_cache_pressure=50

    if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
        echo 'vm.swappiness=10' >> /etc/sysctl.conf
        echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
    fi

    log "✓ 4 GB swap space created and configured"
fi

free -h
echo ""

# Step 2: Install and configure nginx
log "Step 2: Installing nginx..."

apt-get update -qq
apt-get install -y nginx

log "✓ Nginx installed"
echo ""

# Step 3: Configure nginx reverse proxy
log "Step 3: Configuring nginx reverse proxy..."

cat > /etc/nginx/sites-available/kexp-search <<'NGINX_EOF'
# Rate limiting zone (prevent abuse)
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

# Upstream API server
upstream kexp_api {
    server localhost:8000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name _;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/kexp-search-access.log;
    error_log /var/log/nginx/kexp-search-error.log warn;

    # API endpoints
    location / {
        # Rate limiting
        limit_req zone=api_limit burst=20 nodelay;

        # Proxy settings
        proxy_pass http://kexp_api;
        proxy_http_version 1.1;

        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # Timeouts (search can take a few seconds)
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # CORS headers (nginx handles this instead of FastAPI)
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;

        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain charset=UTF-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }

    # Health check endpoint (no rate limit)
    location /api/health {
        proxy_pass http://kexp_api/api/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        access_log off;
    }

    # OpenAPI docs
    location ~ ^/(docs|redoc|openapi.json) {
        proxy_pass http://kexp_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
    }
}
NGINX_EOF

# Enable site and remove default
ln -sf /etc/nginx/sites-available/kexp-search /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t

# Restart nginx
systemctl restart nginx
systemctl enable nginx

log "✓ Nginx configured as reverse proxy"
echo ""

# Step 4: Configure firewall
log "Step 4: Configuring firewall..."

# Port 8000 should only be accessible locally (nginx proxies it)
# Ensure 80 and 443 are open
ufw allow 80/tcp comment 'HTTP - Nginx'
ufw allow 443/tcp comment 'HTTPS - Nginx (future SSL)'
ufw --force enable

log "✓ Firewall configured (80, 443 open; 8000 internal only)"
ufw status verbose
echo ""

# Step 5: Create deployment directory structure
log "Step 5: Setting up directory structure..."

mkdir -p $DEPLOY_DIR/{data,logs,app}
log "✓ Directories created: $DEPLOY_DIR"
echo ""

# Step 6: System optimizations
log "Step 6: Applying system optimizations..."

# Increase file descriptors
if ! grep -q "DefaultLimitNOFILE=65535" /etc/systemd/system.conf; then
    echo "DefaultLimitNOFILE=65535" >> /etc/systemd/system.conf
    systemctl daemon-reload
fi

log "✓ System optimizations applied"
echo ""

# Step 7: Display summary
echo "========================================="
echo -e "${GREEN}✓ Droplet Setup Complete${NC}"
echo "========================================="
echo ""
echo "Configuration Summary:"
echo "  • Swap: 4 GB (vm.swappiness=10)"
echo "  • Nginx: Reverse proxy on port 80"
echo "  • Firewall: Ports 80, 443 open; 8000 internal"
echo "  • Deployment directory: $DEPLOY_DIR"
echo "  • Rate limiting: 10 req/s with burst 20"
echo ""

if [ -n "$DOMAIN" ]; then
    echo "SSL Setup (Optional):"
    echo "To enable HTTPS with Let's Encrypt:"
    echo "  1. Point your domain to this droplet's IP"
    echo "  2. Run: certbot --nginx -d $DOMAIN"
    echo "  3. Certbot will automatically configure SSL"
    echo ""
else
    echo "SSL Setup (Optional):"
    echo "To enable HTTPS with Let's Encrypt:"
    echo "  1. Install certbot: apt-get install -y certbot python3-certbot-nginx"
    echo "  2. Point your domain to this droplet's IP"
    echo "  3. Update nginx config with your domain name"
    echo "  4. Run: certbot --nginx -d yourdomain.com"
    echo ""
fi

echo "Next Steps:"
echo "  1. Deploy data files: ./deploy_data.sh"
echo "  2. Deploy application: cd $DEPLOY_DIR && docker-compose up -d"
echo "  3. Test API: curl http://localhost/api/health"
echo ""
echo "View nginx logs:"
echo "  tail -f /var/log/nginx/kexp-search-access.log"
echo "  tail -f /var/log/nginx/kexp-search-error.log"
echo ""
