#!/bin/bash
# Streamlined deployment script for Digital Ocean droplet using doctl and rsync
# Usage: ./scripts/deploy_to_droplet.sh [--data-only|--app-only]
#
# IMPORTANT: This script includes safeguards to prevent data corruption:
# - Creates backups before overwriting production data
# - Follows symlinks (copies actual files, not symlink references)
# - Validates data files before deployment
# - Consolidates SQLite WAL before copying

set -e

# Configuration
DROPLET_NAME="ubuntu-s-2vcpu-4gb-sfo3-01"
DEPLOY_DIR="/root/faiss-search-api"
DATA_DIR="/Users/pooks/Dev/crate/data"
APP_DIR="/Users/pooks/Dev/crate/faiss-search-api"
BACKUP_DIR="/root/faiss-backups"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Required data files and minimum sizes (in bytes)
declare -A REQUIRED_FILES=(
    ["embeddings_384d.npy"]=1000000000    # ~3GB expected
    ["embeddings_384d.index"]=100000       # varies
    ["play_ids.npy"]=1000000               # ~17MB expected
    ["metadata.json"]=50                   # small config file
)

# CRITICAL: Minimum size for SQLite database to prevent accidental overwrites
# Production DB should be at least 500MB with all MB entity tables populated
MIN_SQLITE_SIZE=500000000  # 500MB minimum

echo "========================================="
echo "KEXP FAISS Search API Deployment"
echo "========================================="

# Function to check for symlinks and validate files
validate_data_files() {
    echo -e "\n${BLUE}Validating data files...${NC}"
    local has_errors=false

    for file in "${!REQUIRED_FILES[@]}"; do
        local filepath="$DATA_DIR/$file"
        local min_size=${REQUIRED_FILES[$file]}

        # Check if file exists
        if [ ! -e "$filepath" ]; then
            echo -e "${RED}✗ Missing: $file${NC}"
            has_errors=true
            continue
        fi

        # Check if it's a symlink
        if [ -L "$filepath" ]; then
            local target=$(readlink -f "$filepath" 2>/dev/null || readlink "$filepath")
            if [ ! -f "$target" ]; then
                echo -e "${RED}✗ Broken symlink: $file -> $target${NC}"
                has_errors=true
                continue
            fi
            echo -e "${YELLOW}⚠ Symlink (will follow): $file -> $target${NC}"
            filepath="$target"
        fi

        # Check file size
        local size=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath")
        if [ "$size" -lt "$min_size" ]; then
            echo -e "${RED}✗ Too small: $file ($size bytes, expected >= $min_size)${NC}"
            has_errors=true
            continue
        fi

        echo -e "${GREEN}✓ Valid: $file ($(numfmt --to=iec $size 2>/dev/null || echo "$size bytes"))${NC}"
    done

    # Check SQLite database
    local db_path="$APP_DIR/data/music_kb.sqlite"
    if [ -L "$db_path" ]; then
        local target=$(readlink -f "$db_path" 2>/dev/null || readlink "$db_path")
        if [ ! -f "$target" ]; then
            echo -e "${RED}✗ Broken symlink: music_kb.sqlite -> $target${NC}"
            has_errors=true
        else
            echo -e "${YELLOW}⚠ Symlink (will follow): music_kb.sqlite -> $target${NC}"
        fi
    elif [ ! -f "$db_path" ]; then
        echo -e "${RED}✗ Missing: music_kb.sqlite${NC}"
        has_errors=true
    else
        local size=$(stat -f%z "$db_path" 2>/dev/null || stat -c%s "$db_path")
        echo -e "${GREEN}✓ Valid: music_kb.sqlite ($(numfmt --to=iec $size 2>/dev/null || echo "$size bytes"))${NC}"
    fi

    if [ "$has_errors" = true ]; then
        echo -e "\n${RED}Data validation failed. Fix the issues above before deploying.${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ All data files validated${NC}"
}

# Function to create backup on remote
create_remote_backup() {
    echo -e "\n${BLUE}Creating backup of production data...${NC}"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    ssh root@$DROPLET_IP "
        mkdir -p $BACKUP_DIR
        if [ -d $DEPLOY_DIR/data ]; then
            # Only backup if data exists and has content
            if [ -f $DEPLOY_DIR/data/music_kb.sqlite ]; then
                echo 'Backing up current data...'
                tar -czf $BACKUP_DIR/data_backup_$timestamp.tar.gz -C $DEPLOY_DIR data/ 2>/dev/null || true
                echo 'Backup created: $BACKUP_DIR/data_backup_$timestamp.tar.gz'
                # Keep only last 3 backups
                ls -t $BACKUP_DIR/data_backup_*.tar.gz 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null || true
            else
                echo 'No existing data to backup'
            fi
        else
            echo 'No existing data directory'
        fi
    "
    echo -e "${GREEN}✓ Backup complete${NC}"
}

# Function to consolidate SQLite WAL
consolidate_sqlite() {
    local db_path="$1"

    # Resolve symlink if needed
    if [ -L "$db_path" ]; then
        db_path=$(readlink -f "$db_path" 2>/dev/null || readlink "$db_path")
    fi

    if [ -f "$db_path" ]; then
        echo -e "${BLUE}Consolidating SQLite WAL for: $db_path${NC}"
        # Run VACUUM to consolidate WAL and optimize
        sqlite3 "$db_path" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
        echo -e "${GREEN}✓ WAL consolidated${NC}"
    fi
}

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
SKIP_BACKUP=false
if [ "$1" == "--data-only" ]; then
    DATA_ONLY=true
    echo -e "${YELLOW}Mode: Data files only${NC}"
elif [ "$1" == "--app-only" ]; then
    APP_ONLY=true
    echo -e "${YELLOW}Mode: Application files only${NC}"
elif [ "$1" == "--no-backup" ]; then
    SKIP_BACKUP=true
    echo -e "${YELLOW}Mode: Full deployment (skipping backup)${NC}"
else
    echo -e "${YELLOW}Mode: Full deployment (data + app)${NC}"
fi

# Validate data files before deployment
if [ "$APP_ONLY" = false ]; then
    validate_data_files
fi

# Create remote directories
echo -e "\n${BLUE}Creating remote directories...${NC}"
ssh root@$DROPLET_IP "mkdir -p $DEPLOY_DIR/{data,logs,secrets}"
echo -e "${GREEN}✓ Directories created${NC}"

# Deploy data files (if not app-only)
if [ "$APP_ONLY" = false ]; then
    # Create backup before overwriting (unless skipped)
    if [ "$SKIP_BACKUP" = false ]; then
        create_remote_backup
    fi

    # Consolidate SQLite WAL before copying
    consolidate_sqlite "$APP_DIR/data/music_kb.sqlite"

    echo -e "\n${BLUE}Syncing data files (this may take a while)...${NC}"

    # Use rsync with --copy-links (-L) to follow symlinks
    # This ensures actual files are copied, not symlink references
    rsync -avzL --progress \
        --include='embeddings_384d.npy' \
        --include='embeddings_384d.index' \
        --include='metadata.json' \
        --include='play_ids.npy' \
        --exclude='*' \
        $DATA_DIR/ root@$DROPLET_IP:$DEPLOY_DIR/data/

    # Copy SQLite database (following symlinks) - WITH SIZE VALIDATION
    echo -e "\n${BLUE}Syncing SQLite database...${NC}"

    # CRITICAL: Validate database size before overwriting production
    local db_source="$APP_DIR/data/music_kb.sqlite"
    if [ -L "$db_source" ]; then
        db_source=$(readlink -f "$db_source" 2>/dev/null || readlink "$db_source")
    fi

    if [ ! -f "$db_source" ]; then
        echo -e "${RED}ERROR: Database file not found: $db_source${NC}"
        echo -e "${RED}ABORTING to prevent data loss on production!${NC}"
        exit 1
    fi

    local db_size=$(stat -f%z "$db_source" 2>/dev/null || stat -c%s "$db_source")
    if [ "$db_size" -lt "$MIN_SQLITE_SIZE" ]; then
        echo -e "${RED}=========================================${NC}"
        echo -e "${RED}CRITICAL ERROR: Database too small!${NC}"
        echo -e "${RED}=========================================${NC}"
        echo -e "${RED}Local DB size: $(numfmt --to=iec $db_size 2>/dev/null || echo "$db_size bytes")${NC}"
        echo -e "${RED}Minimum required: $(numfmt --to=iec $MIN_SQLITE_SIZE 2>/dev/null || echo "$MIN_SQLITE_SIZE bytes")${NC}"
        echo -e "${RED}${NC}"
        echo -e "${RED}This likely means the local database is empty or corrupt.${NC}"
        echo -e "${RED}ABORTING to prevent overwriting production data!${NC}"
        echo -e "${RED}${NC}"
        echo -e "${YELLOW}If you need to deploy app code only, use: --app-only${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Database size validated: $(numfmt --to=iec $db_size 2>/dev/null || echo "$db_size bytes")${NC}"

    rsync -avzL --progress \
        $APP_DIR/data/music_kb.sqlite \
        root@$DROPLET_IP:$DEPLOY_DIR/data/

    echo -e "${GREEN}✓ Data files synced${NC}"

    # Verify data on remote
    echo -e "\n${BLUE}Verifying remote data files...${NC}"
    ssh root@$DROPLET_IP "
        echo 'Remote data files:'
        ls -lh $DEPLOY_DIR/data/*.sqlite $DEPLOY_DIR/data/*.npy $DEPLOY_DIR/data/*.index $DEPLOY_DIR/data/*.json 2>/dev/null || echo 'Some files missing'
        echo ''
        echo 'Checking for symlinks (should be none):'
        find $DEPLOY_DIR/data -type l 2>/dev/null && echo 'WARNING: Symlinks found!' || echo 'No symlinks - good!'
    "
fi

# Deploy application files (if not data-only)
if [ "$DATA_ONLY" = false ]; then
    echo -e "\n${BLUE}Syncing application files...${NC}"

    # Sync application code directly to DEPLOY_DIR (not DEPLOY_DIR/app)
    # Use --copy-links for any symlinks in app dir
    rsync -avzL --progress \
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
        --exclude='secrets/' \
        $APP_DIR/ root@$DROPLET_IP:$DEPLOY_DIR/

    echo -e "${GREEN}✓ Application files synced${NC}"

    # Sync secrets (GCP credentials)
    if [ -d "$APP_DIR/secrets" ]; then
        echo -e "\n${BLUE}Syncing secrets...${NC}"
        rsync -avzL --progress \
            $APP_DIR/secrets/ root@$DROPLET_IP:$DEPLOY_DIR/secrets/
        ssh root@$DROPLET_IP "chmod 600 $DEPLOY_DIR/secrets/*"
        echo -e "${GREEN}✓ Secrets synced${NC}"
    fi

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
echo ""
echo "To restore from backup:"
echo "  ssh root@$DROPLET_IP 'cd $BACKUP_DIR && ls -la'"
echo "  ssh root@$DROPLET_IP 'tar -xzf $BACKUP_DIR/data_backup_TIMESTAMP.tar.gz -C $DEPLOY_DIR'"
