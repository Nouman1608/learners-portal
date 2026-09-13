-- Add currency column to invoices table
ALTER TABLE "invoices" ADD COLUMN "currency" varchar(3) DEFAULT 'PKR' NOT NULL;
