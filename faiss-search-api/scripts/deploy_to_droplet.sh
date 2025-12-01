#!/bin/bash
# Streamlined deployment script for Digital Ocean droplet using doctl and rsync
# Usage: ./scripts/deploy_to_droplet.sh [--data-only|--app-only]

set -e

# Configuration
DROPLET_NAME="ubuntu-s-2vcpu-4gb-sfo3-01"
DEPLOY_DIR="/root/faiss-search-api"
DATA_DIR="/Users/pooks/Dev/crate/data"
APP_DIR="/Users/pooks/Dev/crate/faiss-search-api"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "KEXP FAISS Search API Deployment"
echo "========================================="

# Get droplet IP using doctl
echo -e "\n${BLUE}Getting droplet IP...${NC}"
DROPLET_IP=$(doctl compute droplet get $DROPLET_NAME --format PublicIPv4 --no-header)
if [ -z "$DROPLET_IP" ]; then
    echo "Error: Could not get droplet IP"
    exit 1
fi
echo -e "${GREEN}✓ Droplet IP: $DROPLET_IP${NC}"

# Parse arguments
DATA_ONLY=false
APP_ONLY=false
if [ "$1" == "--data-only" ]; then
    DATA_ONLY=true
    echo -e "${YELLOW}Mode: Data files only${NC}"
elif [ "$1" == "--app-only" ]; then
    APP_ONLY=true
    echo -e "${YELLOW}Mode: Application files only${NC}"
else
    echo -e "${YELLOW}Mode: Full deployment (data + app)${NC}"
fi

# Create remote directories
echo -e "\n${BLUE}Creating remote directories...${NC}"
ssh root@$DROPLET_IP "mkdir -p $DEPLOY_DIR/{data,logs}"
echo -e "${GREEN}✓ Directories created${NC}"

# Deploy data files (if not app-only)
if [ "$APP_ONLY" = false ]; then
    echo -e "\n${BLUE}Syncing data files (this may take a while)...${NC}"

    # Use rsync for efficient transfer (only changed files)
    # BGE-small 384d embeddings (no PCA needed)
    rsync -avz --progress \
        --include='embeddings_384d.npy' \
        --include='embeddings_384d.index' \
        --include='metadata.json' \
        --include='play_ids.npy' \
        --exclude='*' \
        $DATA_DIR/ root@$DROPLET_IP:$DEPLOY_DIR/data/

    # Copy stripped SQLite database
    echo -e "\n${BLUE}Syncing SQLite database...${NC}"
    rsync -avz --progress \
        $APP_DIR/data/music_kb.sqlite \
        root@$DROPLET_IP:$DEPLOY_DIR/data/

    echo -e "${GREEN}✓ Data files synced${NC}"
fi

# Deploy application files (if not data-only)
if [ "$DATA_ONLY" = false ]; then
    echo -e "\n${BLUE}Syncing application files...${NC}"

    # Sync application code directly to DEPLOY_DIR (not DEPLOY_DIR/app)
    rsync -avz --progress \
        --exclude='.venv' \
        --exclude='venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.pytest_cache' \
        --exclude='data/*' \
        --exclude='.git' \
        --exclude='.coverage' \
        --exclude='nginx*.conf' \
        --exclude='certbot/' \
        $APP_DIR/ root@$DROPLET_IP:$DEPLOY_DIR/

    echo -e "${GREEN}✓ Application files synced${NC}"

    # Deploy with Docker Compose
    echo -e "\n${BLUE}Deploying with Docker Compose...${NC}"
    ssh root@$DROPLET_IP "cd $DEPLOY_DIR && docker-compose down || true"
    ssh root@$DROPLET_IP "cd $DEPLOY_DIR && docker-compose build --no-cache"
    ssh root@$DROPLET_IP "cd $DEPLOY_DIR && docker-compose up -d"

    echo -e "${GREEN}✓ Docker containers started${NC}"

    # Wait for service to start
    echo -e "\n${BLUE}Waiting for service to initialize (30 seconds)...${NC}"
    sleep 30
fi

# Verify deployment
echo -e "\n${BLUE}Verifying deployment...${NC}"
ssh root@$DROPLET_IP "cd $DEPLOY_DIR && docker exec kexp-search-api curl -f http://localhost:8000/api/health || echo 'Health check failed'"

echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Service URL: https://cratemusic.duckdns.org"
echo "API Docs: https://cratemusic.duckdns.org/docs"
echo "Health: https://cratemusic.duckdns.org/api/health"
echo ""
echo "To view logs:"
echo "  ssh root@$DROPLET_IP 'cd $DEPLOY_DIR && docker-compose logs -f'"
echo ""
echo "To view API container logs:"
echo "  ssh root@$DROPLET_IP 'docker logs -f kexp-search-api'"
echo ""
echo "To update data only:"
echo "  ./scripts/deploy_to_droplet.sh --data-only"
echo ""
echo "To update app only:"
echo "  ./scripts/deploy_to_droplet.sh --app-only"
