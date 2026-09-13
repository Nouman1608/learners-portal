#!/bin/bash

# Script to run database migrations
# This runs both cascade fix and currency support migrations

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}     Nomi Education - Database Migrations${NC}"
echo -e "${BLUE}================================================${NC}"
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
MIGRATION_FILE="./migrations/combined_migration.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: Migration file not found at $MIGRATION_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Running migrations...${NC}"
echo ""

# Run the migration
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}   ✓ All migrations completed successfully!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "${GREEN}Changes applied:${NC}"
    echo -e "  ${GREEN}• Payments cascade constraint updated${NC}"
    echo -e "  ${GREEN}• Multi-currency support added (PKR, USD, GBP, SAR)${NC}"
    echo -e "  ${GREEN}• Existing data defaults to PKR${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Restart your backend server"
    echo "  2. Test currency API: GET /api/currencies"
    echo "  3. Update enrollment forms to include currency selector"
    echo ""
else
    echo ""
    echo -e "${RED}================================================${NC}"
    echo -e "${RED}   ✗ Migration failed!${NC}"
    echo -e "${RED}================================================${NC}"
    echo -e "${RED}Please check the error messages above.${NC}"
    exit 1
fi
