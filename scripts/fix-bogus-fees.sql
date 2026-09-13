-- =============================================================================
-- Fix: Delete unpaid fees older than the last 2 months
-- =============================================================================
-- Removes any fee with status != 'received' whose billing period is before
-- the previous calendar month. Keeps current month and previous month intact.
--
-- Example (run in June 2026): deletes all unpaid fees for Jan, Feb, Mar, Apr 2026
--   and any prior years. Keeps May 2026 and Jun 2026.
--
-- Never deletes received fees.
-- =============================================================================

-- PREVIEW — run this first to see exactly what will be deleted
SELECT
  f.id                                          AS fee_id,
  u.first_name || ' ' || u.last_name           AS student,
  u.email,
  c.title                                       AS course,
  f.month || '/' || f.year                      AS billing_period,
  f.amount,
  f.currency,
  f.status,
  f.created_at                                  AS fee_created_at
FROM fees f
JOIN enrollments e ON f.enrollment_id = e.id
JOIN users       u ON e.student_id    = u.id
JOIN courses     c ON f.course_id     = c.id
WHERE f.status != 'received'
  AND MAKE_DATE(f.year, f.month, 1) < DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
ORDER BY student, billing_period;


-- =============================================================================
-- DELETE — uncomment after reviewing the preview above
-- =============================================================================

DELETE FROM fees
WHERE status != 'received'
  AND MAKE_DATE(year, month, 1) < DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
