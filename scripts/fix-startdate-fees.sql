-- =============================================================================
-- Fix: Delete fees generated under the old start_date-based logic
-- =============================================================================
-- Fee generation now depends on enrolled_at only. A fee is invalid if:
--   1. Its billing month is BEFORE the month the enrollment was created, OR
--   2. It is a regular (non-catch-up) fee for the enrollment month itself,
--      but the student enrolled on/after the 20th (per the 20th rule that
--      month should only have a catch-up fee, not a regular fee)
--
-- Enrollments with corrupted enrolled_at (year < 2000) are excluded — fix
-- those first with find-bad-enrollment-dates.sql, then re-run this.
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
  e.enrolled_at,
  f.amount,
  f.currency,
  f.status,
  f.is_catch_up,
  CASE
    WHEN MAKE_DATE(f.year, f.month, 1) < DATE_TRUNC('month', e.enrolled_at)::date
      THEN 'billing month before enrollment'
    ELSE 'regular fee but enrolled on/after 20th'
  END                                           AS reason
FROM fees f
JOIN enrollments e ON f.enrollment_id = e.id
JOIN users       u ON e.student_id    = u.id
JOIN courses     c ON f.course_id     = c.id
WHERE f.status != 'received'
  AND e.enrolled_at IS NOT NULL
  AND EXTRACT(YEAR FROM e.enrolled_at)::int >= 2000
  AND (
    -- billing month before the enrollment existed
    MAKE_DATE(f.year, f.month, 1) < DATE_TRUNC('month', e.enrolled_at)::date
    OR (
      -- regular fee for the enrollment month, but enrolled on/after the 20th
      MAKE_DATE(f.year, f.month, 1) = DATE_TRUNC('month', e.enrolled_at)::date
      AND EXTRACT(DAY FROM e.enrolled_at)::int >= 20
      AND f.is_catch_up = false
    )
  )
ORDER BY student, course, f.year, f.month;


-- =============================================================================
-- DELETE — uncomment after reviewing the preview above
-- =============================================================================

DELETE FROM fees f
USING enrollments e
WHERE f.enrollment_id = e.id
  AND f.status != 'received'
  AND e.enrolled_at IS NOT NULL
  AND EXTRACT(YEAR FROM e.enrolled_at)::int >= 2000
  AND (
    MAKE_DATE(f.year, f.month, 1) < DATE_TRUNC('month', e.enrolled_at)::date
    OR (
      MAKE_DATE(f.year, f.month, 1) = DATE_TRUNC('month', e.enrolled_at)::date
      AND EXTRACT(DAY FROM e.enrolled_at)::int >= 20
      AND f.is_catch_up = false
    )
  );
