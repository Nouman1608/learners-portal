-- Add WhatsApp group link column to users table
-- This field allows storing WhatsApp group links for students

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "whatsapp_group_link" text;
