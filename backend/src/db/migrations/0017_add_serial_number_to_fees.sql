-- Add serial_number column to fees table for cash payment tracking
ALTER TABLE "fees" ADD COLUMN "serial_number" varchar(255);
