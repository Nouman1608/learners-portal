-- Script to remove all calendar events before today
-- This helps clean up old events and reduce database size
--
-- IMPORTANT: This runs in a transaction. Review the preview, then:
--   - Type COMMIT; to apply changes
--   - Type ROLLBACK; to cancel

-- Start transaction
BEGIN;

-- Get current date
\set today '\'$(date +%Y-%m-%d)\''

-- Show preview of events to be deleted
\echo '=========================================='
\echo 'PREVIEW: Events to be deleted'
\echo '=========================================='
\echo ''

SELECT
    ce.id,
    c.title as course_title,
    ce.event_date,
    ce.status,
    u.first_name || ' ' || u.last_name as teacher_name
FROM course_events ce
LEFT JOIN courses c ON ce.course_id = c.id
LEFT JOIN users u ON ce.teacher_id = u.id
WHERE ce.event_date < CURRENT_DATE
ORDER BY ce.event_date DESC, c.title
LIMIT 50;

-- Count total events to be deleted
\echo ''
\echo '=========================================='
\echo 'Summary'
\echo '=========================================='
SELECT
    COUNT(*) as total_events_to_delete,
    COUNT(DISTINCT course_id) as affected_courses,
    MIN(event_date) as oldest_event,
    MAX(event_date) as newest_old_event
FROM course_events
WHERE event_date < CURRENT_DATE;

-- Count by status
\echo ''
\echo 'Breakdown by status:'
SELECT
    status,
    COUNT(*) as count
FROM course_events
WHERE event_date < CURRENT_DATE
GROUP BY status
ORDER BY count DESC;

-- Delete old events
\echo ''
\echo '=========================================='
\echo 'Deleting old events...'
\echo '=========================================='

DELETE FROM course_events
WHERE event_date < CURRENT_DATE;

-- Show summary after deletion
\echo ''
\echo '=========================================='
\echo 'Deletion completed'
\echo '=========================================='
\echo ''
\echo 'Remaining events:'
SELECT COUNT(*) as remaining_events FROM course_events;

\echo ''
\echo '=========================================='
\echo 'Transaction is ready to commit or rollback'
\echo '=========================================='
\echo 'Type COMMIT; to save changes'
\echo 'Type ROLLBACK; to cancel'
\echo '=========================================='
