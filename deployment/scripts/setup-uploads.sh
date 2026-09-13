#!/bin/bash

# Setup uploads directory for Nomi Education System
# This script creates the necessary directory structure and sets permissions

UPLOAD_DIR="/var/uploads/nomi-education"
APP_USER="${APP_USER:-nomi-user}"
APP_GROUP="${APP_GROUP:-nomi-user}"

echo "Setting up uploads directory at: $UPLOAD_DIR"
echo "Application user: $APP_USER"
echo "Application group: $APP_GROUP"
echo ""

# Create main uploads directory
echo "Creating directory structure..."
sudo mkdir -p "$UPLOAD_DIR/invoices"
sudo mkdir -p "$UPLOAD_DIR/documents"
sudo mkdir -p "$UPLOAD_DIR/temp"

# Set ownership
echo "Setting ownership..."
sudo chown -R "$APP_USER:$APP_GROUP" "$UPLOAD_DIR"

# Set permissions
echo "Setting permissions..."
sudo chmod -R 755 "$UPLOAD_DIR"

# Verify setup
echo ""
echo "Verifying setup..."
ls -la "$UPLOAD_DIR"

# Check if writable
if [ -w "$UPLOAD_DIR" ]; then
    echo ""
    echo "✓ Directory is writable"
else
    echo ""
    echo "✗ Warning: Directory is not writable for current user"
    echo "  This might be expected if you're not running as $APP_USER"
fi

# Create test file as app user
echo ""
echo "Testing write permissions as $APP_USER..."
sudo -u "$APP_USER" touch "$UPLOAD_DIR/test.txt" 2>/dev/null && {
    echo "✓ Write test successful"
    sudo -u "$APP_USER" rm "$UPLOAD_DIR/test.txt"
} || {
    echo "✗ Write test failed - please check permissions"
    exit 1
}

echo ""
echo "Setup complete! Upload directory is ready at: $UPLOAD_DIR"
