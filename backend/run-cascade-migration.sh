#!/bin/bash

# Script to run the cascade constraint migration
# This changes payments.fee_id foreign key from RESTRICT to CASCADE

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=====================================${NC}"
echo -e "${YELLOW}  Payments Cascade Constraint Fix${NC}"
echo -e "${YELLOW}=====================================${NC}"
echo ""

# Get database connection details from environment or use defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-nomi_db}"
DB_USER="${DB_USER:-postgres}"

echo -e "${YELLOW}Database Connection:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# Check if migration file exists
MIGRATION_FILE="./migrations/manual_cascade_fix.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: Migration file not found at $MIGRATION_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Running migration...${NC}"
echo ""

# Run the migration
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Migration completed successfully!${NC}"
    echo ""
    echo -e "${GREEN}The payments table foreign key has been updated:${NC}"
    echo -e "  ${GREEN}• fee_id now uses ON DELETE CASCADE${NC}"
    echo -e "  ${GREEN}• Deleting a fee will now automatically delete its payments${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}✗ Migration failed!${NC}"
    echo -e "${RED}Please check the error messages above.${NC}"
    exit 1
fi
