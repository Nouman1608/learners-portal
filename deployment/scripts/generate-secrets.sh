#!/bin/bash
# Script to generate secure random secrets for production environment

echo "==================================================="
echo "Nomi Education - Secret Generation Script"
echo "==================================================="
echo ""
echo "Copy these values to your .env.production file"
echo ""

echo "# JWT Secret (64 bytes hex)"
echo "JWT_SECRET=$(openssl rand -hex 64)"
echo ""

echo "# JWT Refresh Secret (64 bytes hex)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 64)"
echo ""

echo "# Encryption Key (32 bytes hex)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo ""

echo "# PostgreSQL Password (32 chars alphanumeric)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)"
echo ""

echo "==================================================="
echo "IMPORTANT: Store these secrets securely!"
echo "NEVER commit them to version control!"
echo "==================================================="
