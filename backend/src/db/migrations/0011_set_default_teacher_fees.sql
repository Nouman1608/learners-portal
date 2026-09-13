-- Set default fee configuration for existing teachers
-- This updates teachers who don't have fee configuration set

UPDATE users
SET
  local_student_fee_percentage = 75.00,  -- Teacher gets 75% of local student fees
  online_student_fixed_amount = 4000.00   -- Teacher gets PKR 4000 per online student
WHERE
  role = 'teacher'
  AND (
    local_student_fee_percentage IS NULL
    OR online_student_fixed_amount IS NULL
  );

-- Verify the update
SELECT
  id,
  first_name,
  last_name,
  email,
  role,
  local_student_fee_percentage,
  online_student_fixed_amount
FROM users
WHERE role = 'teacher'
ORDER BY first_name, last_name;
