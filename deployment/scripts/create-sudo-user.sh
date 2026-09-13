#!/bin/bash

# Script to create a sudo user in the Nomi Education database
# Usage: ./create-sudo-user.sh [password]

set -e

# Default password
DEFAULT_PASSWORD="Admin@123"
PASSWORD="${1:-$DEFAULT_PASSWORD}"

echo "Creating sudo user with password: $PASSWORD"
echo

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Change to backend directory
cd "$BACKEND_DIR"

# Create a temporary TypeScript file in the backend directory
cat > "$BACKEND_DIR/hash-password-temp.ts" << EOF
import { hashPassword } from './src/utils/bcrypt';

async function main() {
  const hash = await hashPassword('${PASSWORD}');
  console.log(hash);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
EOF

echo "Generating password hash..."
HASH=$(npx tsx hash-password-temp.ts)

# Cleanup temp file
rm -f hash-password-temp.ts

if [ -z "$HASH" ]; then
  echo "❌ Failed to generate password hash"
  exit 1
fi

echo "✅ Password hash generated"
echo $HASH

# Insert user into database
echo "Inserting user into database..."
sudo -u postgres psql -d nomi_education << SQL
-- Delete existing sudo user if exists
DELETE FROM users WHERE username = 'sudo';

-- Insert new sudo user
INSERT INTO users (id, username, password_hash, role, first_name, last_name, email, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'sudo',
  '${HASH}',
  'sudo',
  'Super',
  'Admin',
  'sudo@nomi.edu',
  true,
  NOW(),
  NOW()
);

-- Verify user was created
SELECT username, role, email, is_active FROM users WHERE username = 'sudo';
SQL

echo
echo "✅ Sudo user created successfully!"
echo
echo "Login credentials:"
echo "  Username: sudo"
echo "  Password: $PASSWORD"
echo
echo "⚠️  IMPORTANT: Change this password after first login in production!"
