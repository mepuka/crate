#!/bin/bash
# Rollback script to restore from backup after a failed deployment
#
# Usage:
#   ./scripts/rollback.sh                    # Interactive - shows backups and prompts
#   ./scripts/rollback.sh --list             # List available backups
#   ./scripts/rollback.sh --latest           # Restore from latest backup
#   ./scripts/rollback.sh --backup <name>    # Restore specific backup
#   ./scripts/rollback.sh --verify <name>    # Verify backup integrity without restoring
#
# This script connects to the production droplet, stops the API,
# restores data from a backup, and restarts the service.

set -e

# Configuration - matches deploy_to_droplet.sh
DROPLET_NAME="ubuntu-s-2vcpu-4gb-sfo3-01"
DEPLOY_DIR="/root/faiss-search-api"
BACKUP_DIR="/root/faiss-backups"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================="
echo "FAISS Search API Rollback Tool"
echo "========================================="

# Get droplet IP
echo -e "\n${BLUE}Getting droplet IP...${NC}"
DROPLET_IP=$(doctl compute droplet get $DROPLET_NAME --format PublicIPv4 --no-header)
if [ -z "$DROPLET_IP" ]; then
    echo -e "${RED}Error: Could not get droplet IP${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Droplet IP: $DROPLET_IP${NC}"

# Function to list available backups
list_backups() {
    echo -e "\n${BLUE}Available backups:${NC}"
    ssh root@$DROPLET_IP "
        if [ -d $BACKUP_DIR ]; then
            ls -lht $BACKUP_DIR/data_backup_*.tar.gz 2>/dev/null | while read line; do
                filename=\$(echo \$line | awk '{print \$NF}')
                size=\$(echo \$line | awk '{print \$5}')
                date=\$(echo \$line | awk '{print \$6, \$7, \$8}')
                basename=\$(basename \$filename)
                echo \"  \$basename (\$size, \$date)\"
            done
            if [ -z \"\$(ls $BACKUP_DIR/data_backup_*.tar.gz 2>/dev/null)\" ]; then
                echo '  No backups found'
            fi
        else
            echo '  Backup directory does not exist'
        fi
    "
}

# Function to verify backup integrity
verify_backup() {
    local backup_name="$1"
    echo -e "\n${BLUE}Verifying backup: $backup_name${NC}"

    ssh root@$DROPLET_IP "
        backup_path=\"$BACKUP_DIR/$backup_name\"
        if [ ! -f \"\$backup_path\" ]; then
            echo 'ERROR: Backup file not found'
            exit 1
        fi

        echo 'Checking tar integrity...'
        if ! tar -tzf \"\$backup_path\" > /dev/null 2>&1; then
            echo 'ERROR: Backup archive is corrupted'
            exit 1
        fi
        echo '✓ Archive integrity OK'

        echo 'Checking for required files...'
        required_files='data/music_kb.sqlite'
        for file in \$required_files; do
            if tar -tzf \"\$backup_path\" | grep -q \"\$file\"; then
                echo \"✓ Found: \$file\"
            else
                echo \"WARNING: Missing: \$file\"
            fi
        done

        echo ''
        echo 'Backup contents:'
        tar -tzf \"\$backup_path\" | head -20
        file_count=\$(tar -tzf \"\$backup_path\" | wc -l)
        if [ \$file_count -gt 20 ]; then
            echo \"... and \$((file_count - 20)) more files\"
        fi
    "
}

# Function to get latest backup name
get_latest_backup() {
    ssh root@$DROPLET_IP "ls -t $BACKUP_DIR/data_backup_*.tar.gz 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo ''"
}

# Function to perform rollback
perform_rollback() {
    local backup_name="$1"

    echo -e "\n${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}ROLLBACK PROCEDURE${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "Backup: ${backup_name}"
    echo -e "${YELLOW}This will:${NC}"
    echo "  1. Stop the API service"
    echo "  2. Replace current data with backup"
    echo "  3. Restart the API service"
    echo ""

    read -p "Continue with rollback? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Rollback cancelled"
        exit 0
    fi

    echo -e "\n${BLUE}Step 1: Stopping API service...${NC}"
    ssh root@$DROPLET_IP "cd $DEPLOY_DIR && docker-compose stop kexp-search-api" || true
    echo -e "${GREEN}✓ Service stopped${NC}"

    echo -e "\n${BLUE}Step 2: Backing up current (failed) data...${NC}"
    local failed_backup="data_failed_$(date +%Y%m%d_%H%M%S).tar.gz"
    ssh root@$DROPLET_IP "
        if [ -d $DEPLOY_DIR/data ]; then
            tar -czf $BACKUP_DIR/$failed_backup -C $DEPLOY_DIR data/ 2>/dev/null || true
            echo 'Failed state saved to: $BACKUP_DIR/$failed_backup'
        fi
    "
    echo -e "${GREEN}✓ Current state preserved${NC}"

    echo -e "\n${BLUE}Step 3: Restoring from backup...${NC}"
    ssh root@$DROPLET_IP "
        # Remove current data
        rm -rf $DEPLOY_DIR/data/*

        # Extract backup
        tar -xzf $BACKUP_DIR/$backup_name -C $DEPLOY_DIR

        # Verify extraction
        if [ -f $DEPLOY_DIR/data/music_kb.sqlite ]; then
            echo '✓ Database restored'
            ls -lh $DEPLOY_DIR/data/music_kb.sqlite
        else
            echo 'ERROR: Database not found after restore!'
            exit 1
        fi
    "
    echo -e "${GREEN}✓ Data restored${NC}"

    echo -e "\n${BLUE}Step 4: Restarting API service...${NC}"
    ssh root@$DROPLET_IP "cd $DEPLOY_DIR && docker-compose start kexp-search-api"
    echo -e "${GREEN}✓ Service restarted${NC}"

    echo -e "\n${BLUE}Step 5: Waiting for service to initialize (30 seconds)...${NC}"
    sleep 30

    echo -e "\n${BLUE}Step 6: Running integrity check...${NC}"
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/db_integrity_check.py" ]; then
        scp "$SCRIPT_DIR/db_integrity_check.py" root@$DROPLET_IP:/tmp/
        ssh root@$DROPLET_IP "python3 /tmp/db_integrity_check.py --db-path $DEPLOY_DIR/data/music_kb.sqlite"
    fi

    echo -e "\n${BLUE}Step 7: Verifying API health...${NC}"
    ssh root@$DROPLET_IP "cd $DEPLOY_DIR && docker exec kexp-search-api curl -f http://localhost:8000/api/health" || echo -e "${YELLOW}Health check pending - service may still be loading${NC}"

    echo -e "\n${GREEN}=========================================${NC}"
    echo -e "${GREEN}✓ ROLLBACK COMPLETE${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "Service URL: https://cratemusic.duckdns.org"
    echo "Health: https://cratemusic.duckdns.org/api/health"
    echo ""
    echo "Failed state saved to: $BACKUP_DIR/$failed_backup"
    echo "To check logs: ssh root@$DROPLET_IP 'docker logs -f kexp-search-api'"
}

# Parse arguments
case "$1" in
    --list)
        list_backups
        ;;
    --latest)
        latest=$(get_latest_backup)
        if [ -z "$latest" ]; then
            echo -e "${RED}No backups found${NC}"
            exit 1
        fi
        echo "Latest backup: $latest"
        verify_backup "$latest"
        perform_rollback "$latest"
        ;;
    --backup)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Backup name required${NC}"
            echo "Usage: $0 --backup <backup_name>"
            exit 1
        fi
        verify_backup "$2"
        perform_rollback "$2"
        ;;
    --verify)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Backup name required${NC}"
            echo "Usage: $0 --verify <backup_name>"
            exit 1
        fi
        verify_backup "$2"
        ;;
    --help|-h)
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --list             List available backups"
        echo "  --latest           Restore from latest backup"
        echo "  --backup <name>    Restore specific backup"
        echo "  --verify <name>    Verify backup integrity without restoring"
        echo "  --help             Show this help"
        echo ""
        echo "Interactive mode (no options): Shows backups and prompts for selection"
        ;;
    *)
        # Interactive mode
        list_backups
        echo ""
        read -p "Enter backup name to restore (or 'q' to quit): " selected
        if [ "$selected" = "q" ] || [ -z "$selected" ]; then
            echo "Cancelled"
            exit 0
        fi
        verify_backup "$selected"
        perform_rollback "$selected"
        ;;
esac
