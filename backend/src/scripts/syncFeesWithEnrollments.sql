-- ============================================================================
-- Script: Sync Fees with Enrollment Fees
-- Description: Updates fee amounts to match their enrollment's customFeePerMonth
--              Only affects pending and submitted fees (not received/overdue)
--
-- Usage:
--   psql -U postgres -d nomi_education -f src/scripts/syncFeesWithEnrollments.sql
--
-- Or from within psql:
--   \i src/scripts/syncFeesWithEnrollments.sql
--
-- Safety: Only affects pending/submitted fees
-- ============================================================================

\echo '============================================================================'
\echo 'Starting sync of fees with enrollment fees...'
\echo '============================================================================'
\echo ''

-- Start transaction for safety
BEGIN;

-- Create temporary table to track mismatches
CREATE TEMP TABLE fee_mismatches AS
SELECT
    f.id AS fee_id,
    f.enrollment_id,
    f.student_id,
    f.course_id,
    f.month,
    f.year,
    f.status AS fee_status,
    f.amount AS current_fee_amount,
    e.custom_fee_per_month AS enrollment_fee,
    u.first_name || ' ' || u.last_name AS student_name,
    c.title AS course_title
FROM fees f
JOIN enrollments e ON f.enrollment_id = e.id
JOIN users u ON f.student_id = u.id
JOIN courses c ON f.course_id = c.id
WHERE f.status IN ('pending', 'submitted')
    AND e.custom_fee_per_month IS NOT NULL
    AND f.amount != e.custom_fee_per_month;

\echo '--- Mismatches Found ---'
\echo ''

-- Count mismatches
SELECT COUNT(*) AS total_mismatches FROM fee_mismatches;

\echo ''
\echo '--- Detailed Mismatches ---'
\echo ''

-- Show all mismatches
SELECT
    student_name,
    course_title,
    month || '/' || year AS period,
    fee_status AS status,
    'PKR ' || current_fee_amount AS current,
    'PKR ' || enrollment_fee AS should_be,
    'PKR ' || (enrollment_fee::numeric - current_fee_amount::numeric) AS difference
FROM fee_mismatches
ORDER BY student_name, course_title, year DESC, month DESC;

\echo ''
\echo '--- Summary by Student ---'
\echo ''

-- Group by student
SELECT
    student_name,
    COUNT(*) AS affected_fees,
    SUM(enrollment_fee::numeric - current_fee_amount::numeric) AS total_difference
FROM fee_mismatches
GROUP BY student_name
ORDER BY student_name;

\echo ''
\echo '--- Applying Updates ---'
\echo ''

-- Update fees with mismatched amounts
UPDATE fees f
SET
    amount = e.custom_fee_per_month,
    updated_at = NOW()
FROM enrollments e
WHERE f.enrollment_id = e.id
    AND f.status IN ('pending', 'submitted')
    AND e.custom_fee_per_month IS NOT NULL
    AND f.amount != e.custom_fee_per_month;

-- Show number of rows updated
\echo 'Fees updated'

\echo ''
\echo '--- Verification ---'
\echo ''

-- Verify sync is complete
SELECT
    COUNT(*) AS remaining_mismatches
FROM fees f
JOIN enrollments e ON f.enrollment_id = e.id
WHERE f.status IN ('pending', 'submitted')
    AND e.custom_fee_per_month IS NOT NULL
    AND f.amount != e.custom_fee_per_month;

\echo ''
\echo '============================================================================'
\echo 'Sync completed successfully!'
\echo ''
\echo 'IMPORTANT: Review the changes above before committing.'
\echo 'Type COMMIT to save changes or ROLLBACK to cancel.'
\echo '============================================================================'

-- Leave transaction open for user to review and commit/rollback
-- User must manually type COMMIT; or ROLLBACK;
