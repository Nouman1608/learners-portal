-- =============================================================================
-- Fix: Enrollment dates stored with year 0026 instead of 2026
-- =============================================================================
-- Root cause: 2-digit year entered in UI ("26"), zero-padded to "0026" on save.
-- Fix: add 2000 years to any date field where year is between 1 and 99
--      (catches 0026, 0027, etc. but not 1970 epoch which needs separate handling)
--
-- Run the PREVIEW first, then uncomment the UPDATE.
-- =============================================================================

-- PREVIEW — shows before/after for every affected row
SELECT
  e.id                                              AS enrollment_id,
  u.first_name || ' ' || u.last_name               AS student,
  u.email,
  c.title                                           AS course,
  e.status,
  e.start_date                                      AS start_date_before,
  CASE
    WHEN e.start_date IS NOT NULL
     AND EXTRACT(YEAR FROM e.start_date)::int BETWEEN 1 AND 99
    THEN (e.start_date + INTERVAL '2000 years')::date
    ELSE e.start_date
  END                                               AS start_date_after,
  e.enrolled_at                                     AS enrolled_at_before,
  CASE
    WHEN e.enrolled_at IS NOT NULL
     AND EXTRACT(YEAR FROM e.enrolled_at)::int BETWEEN 1 AND 99
    THEN (e.enrolled_at + INTERVAL '2000 years')
    ELSE e.enrolled_at
  END                                               AS enrolled_at_after
FROM enrollments e
JOIN users   u ON e.student_id = u.id
JOIN courses c ON e.course_id  = c.id
WHERE (
  (e.start_date  IS NOT NULL AND EXTRACT(YEAR FROM e.start_date)::int  BETWEEN 1 AND 99)
  OR
  (e.enrolled_at IS NOT NULL AND EXTRACT(YEAR FROM e.enrolled_at)::int BETWEEN 1 AND 99)
)
ORDER BY student, course;


-- =============================================================================
-- UPDATE — uncomment after reviewing the preview above
-- =============================================================================

UPDATE enrollments
SET
  start_date  = CASE
                  WHEN start_date IS NOT NULL
                   AND EXTRACT(YEAR FROM start_date)::int BETWEEN 1 AND 99
                  THEN (start_date + INTERVAL '2000 years')::date
                  ELSE start_date
                END,
  enrolled_at = CASE
                  WHEN enrolled_at IS NOT NULL
                   AND EXTRACT(YEAR FROM enrolled_at)::int BETWEEN 1 AND 99
                  THEN (enrolled_at + INTERVAL '2000 years')
                  ELSE enrolled_at
                END
WHERE (
  (start_date  IS NOT NULL AND EXTRACT(YEAR FROM start_date)::int  BETWEEN 1 AND 99)
  OR
  (enrolled_at IS NOT NULL AND EXTRACT(YEAR FROM enrolled_at)::int BETWEEN 1 AND 99)
);
