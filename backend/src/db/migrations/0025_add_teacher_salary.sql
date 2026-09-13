ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "teacher_payment_type" varchar(20) DEFAULT 'percentage_based';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "monthly_salary" decimal(10, 2);
