#!/bin/bash
# Simplified droplet setup (swap + firewall only)
# Nginx runs in Docker container

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================="
echo "KEXP Search API - Droplet Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use: sudo -i)"
    exit 1
fi

# Step 1: Swap space (already created by previous script)
echo -e "${BLUE}Step 1: Checking swap space...${NC}"
if [ -f /swapfile ]; then
    echo -e "${GREEN}✓ Swap space already configured (4 GB)${NC}"
    free -h | grep -i swap
else
    echo "Swap not found - run the full setup script first"
    exit 1
fi
echo ""

# Step 2: Configure firewall
echo -e "${BLUE}Step 2: Configuring firewall...${NC}"
ufw allow 80/tcp comment 'HTTP - Nginx (Docker)'
ufw allow 443/tcp comment 'HTTPS - Nginx (Docker)'
ufw --force enable
echo -e "${GREEN}✓ Firewall configured (80, 443 open)${NC}"
ufw status verbose
echo ""

# Step 3: System optimizations
echo -e "${BLUE}Step 3: System optimizations...${NC}"

# Increase file descriptors
if ! grep -q "DefaultLimitNOFILE=65535" /etc/systemd/system.conf 2>/dev/null; then
    echo "DefaultLimitNOFILE=65535" >> /etc/systemd/system.conf
    systemctl daemon-reload
    echo -e "${GREEN}✓ File descriptors increased${NC}"
else
    echo -e "${GREEN}✓ File descriptors already configured${NC}"
fi
echo ""

# Step 4: Create directory structure
echo -e "${BLUE}Step 4: Creating directory structure...${NC}"
mkdir -p /root/faiss-search-api/{data,logs}
echo -e "${GREEN}✓ Directories created: /root/faiss-search-api${NC}"
echo ""

# Done
echo "========================================="
echo -e "${GREEN}✓ Droplet Setup Complete${NC}"
echo "========================================="
echo ""
echo "Configuration Summary:"
echo "  • Swap: 4 GB configured"
echo "  • Firewall: Ports 80, 443 open"
echo "  • Nginx: Will run in Docker container"
echo "  • Deployment directory: /root/faiss-search-api"
echo ""
echo "Next Steps:"
echo "  1. Wait for data transfers to complete"
echo "  2. Verify files: ssh root@64.227.104.135 'ls -lh /root/faiss-search-api/data/'"
echo "  3. Deploy application: ./scripts/deploy_to_droplet.sh --app-only"
echo "  4. Test API: curl http://\$(doctl compute droplet get ubuntu-s-2vcpu-4gb-sfo3-01 --format PublicIPv4 --no-header)/api/health"
echo ""
